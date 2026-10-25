import "server-only";
import * as ical from "node-ical";
import type { Organizer, VEvent } from "node-ical";
import type { CalendarMatchMethod, InterviewType, Member } from "@/types";

/**
 * Read side of the calendar strategy: fetch and parse the bishop's subscribed
 * Google Calendar (its *secret* iCal address) into plain appointment records,
 * and match each one back to a ward member.
 *
 * The app no longer computes availability or writes events — members self-book
 * through Google booking pages, and the resulting events land on the bishop's
 * calendar. This module turns that feed into `ParsedEvent`s the ingest step
 * (`sync.ts`) upserts into `calendar_bookings`.
 *
 * Server-only: the secret URL is a credential and node-ical is a Node library.
 */

/** A single appointment parsed from the feed, normalized for storage. */
export interface ParsedEvent {
  /** The event's iCalendar UID — our stable key across syncs. */
  uid: string;
  summary?: string;
  description?: string;
  location?: string;
  start: Date;
  end?: Date;
  organizerEmail?: string;
  /** True when the feed marks the event STATUS:CANCELLED. */
  cancelled: boolean;
}

/** The outcome of linking an event to the roster. */
export interface MemberMatch {
  memberId?: string;
  memberName?: string;
  method?: CalendarMatchMethod;
}

/**
 * Fetch the raw iCalendar document at `url`. Google's secret address is a plain
 * HTTPS URL (sometimes shared as `webcal://`, which we normalize). We fetch it
 * ourselves — rather than node-ical's `fromURL` — so the request goes through
 * the platform's own `fetch` (and any configured proxy), and so failures surface
 * as ordinary HTTP errors the caller can report.
 */
export async function fetchIcs(url: string): Promise<string> {
  const httpsUrl = url.trim().replace(/^webcal:\/\//i, "https://");
  const res = await fetch(httpsUrl, {
    redirect: "follow",
    // The feed changes on Google's own refresh cadence; never serve a stale cache.
    cache: "no-store",
    headers: { Accept: "text/calendar, text/plain, */*" },
  });
  if (!res.ok) {
    throw new Error(`Calendar feed returned ${res.status} ${res.statusText}`);
  }
  return res.text();
}

/** Pull a bare email address out of an ORGANIZER value. */
function emailOf(value: Organizer | undefined): string | undefined {
  if (!value) return undefined;
  // A value is either the raw "mailto:foo@bar.com" string or an object whose
  // `val` holds it (with CN/PARTSTAT params alongside).
  const raw = typeof value === "string" ? value : value.val;
  if (!raw) return undefined;
  const email = raw.replace(/^mailto:/i, "").trim().toLowerCase();
  return email.includes("@") ? email : undefined;
}

/**
 * Strip email addresses and phone numbers from event text. Google booking pages
 * write the booker's contact details into the description; the app keeps member
 * names only, so those never reach the database.
 */
export function scrubContact(text?: string): string | undefined {
  const scrubbed = text
    ?.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "")
    .replace(/\+?1?[ .-]?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/g, "")
    .trim();
  return scrubbed || undefined;
}

/**
 * Parse an iCalendar document into appointment records. Recurring *masters*
 * (events carrying an RRULE) are skipped — self-booked appointments are always
 * single instances, and the app no longer needs the bishop's recurring personal
 * events for availability math. Events with no start are skipped as malformed.
 */
export function parseIcs(icsText: string): ParsedEvent[] {
  const parsed = ical.sync.parseICS(icsText);
  const events: ParsedEvent[] = [];

  for (const component of Object.values(parsed)) {
    if (component.type !== "VEVENT") continue;
    const event = component as VEvent;
    if (event.rrule) continue; // recurring master — not a booking
    if (!event.start) continue;

    events.push({
      uid: event.uid,
      summary: scrubContact(event.summary),
      description: scrubContact(event.description),
      location: event.location?.trim() || undefined,
      start: event.start,
      end: event.end ?? undefined,
      organizerEmail: emailOf(event.organizer),
      cancelled: event.status === "CANCELLED",
    });
  }

  return events;
}

/** A member's full name, normalized (trim, collapse whitespace, case-fold). */
function normalizedName(member: Pick<Member, "firstName" | "lastName">): string {
  return `${member.firstName} ${member.lastName}`.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Link a parsed event to a ward member by name: the event summary/description
 * must contain exactly one member's full name. Ambiguity leaves the booking
 * unmatched for manual review. (The app keeps no member emails, so there is no
 * email match.)
 *
 * Returns an empty match when nothing links — the ingest step keeps those in an
 * "unmatched" state rather than guessing.
 */
export function matchMember(event: ParsedEvent, members: Member[]): MemberMatch {
  // Only when exactly one member's full name appears in the text.
  const haystack = `${event.summary ?? ""} ${event.description ?? ""}`
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (haystack.trim()) {
    const hits = members.filter((m) => {
      const name = normalizedName(m);
      return name.length > 0 && haystack.includes(name);
    });
    if (hits.length === 1) {
      const m = hits[0];
      return { memberId: m.id, memberName: `${m.firstName} ${m.lastName}`, method: "name" };
    }
  }

  return {};
}

/**
 * Keyword → interview type, checked against an event's summary/description. A
 * best-effort label so the tracking board can group bookings; order matters
 * (more specific phrases first). Absence just leaves the type unset.
 */
const TYPE_KEYWORDS: [RegExp, InterviewType][] = [
  [/youth\s+temple\s+recommend/, "temple_recommend_youth"],
  [/temple\s+recommend/, "temple_recommend"],
  [/tithing|settlement/, "tithing_settlement"],
  [/ministering/, "ministering"],
  [/calling/, "calling"],
  [/worthiness/, "worthiness"],
  [/youth/, "youth"],
];

/** Infer the interview type from an event's text, or undefined when unclear. */
export function inferInterviewType(event: ParsedEvent): InterviewType | undefined {
  const text = `${event.summary ?? ""} ${event.description ?? ""}`.toLowerCase();
  if (!text.trim()) return undefined;
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(text)) return type;
  }
  return undefined;
}
