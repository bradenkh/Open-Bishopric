import "server-only";
import * as ical from "node-ical";
import type { Attendee, Organizer, VEvent } from "node-ical";
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
  attendeeEmails: string[];
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

/** Pull a bare email address out of an ORGANIZER/ATTENDEE value. */
function emailOf(value: Attendee | Organizer | undefined): string | undefined {
  if (!value) return undefined;
  // A value is either the raw "mailto:foo@bar.com" string or an object whose
  // `val` holds it (with CN/PARTSTAT params alongside).
  const raw = typeof value === "string" ? value : value.val;
  if (!raw) return undefined;
  const email = raw.replace(/^mailto:/i, "").trim().toLowerCase();
  return email.includes("@") ? email : undefined;
}

/** Every attendee email on an event, de-duplicated. */
function attendeeEmails(event: VEvent): string[] {
  const raw = event.attendee;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const emails = list.map(emailOf).filter((e): e is string => Boolean(e));
  return [...new Set(emails)];
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
    // All-day events (birthdays, holidays, anniversaries) are never interview
    // appointments — a booked interview always has a specific time. Dropping them
    // keeps the ingest to real appointments.
    if (event.datetype === "date") continue;

    events.push({
      uid: event.uid,
      summary: event.summary?.trim() || undefined,
      description: event.description?.trim() || undefined,
      location: event.location?.trim() || undefined,
      start: event.start,
      end: event.end ?? undefined,
      organizerEmail: emailOf(event.organizer),
      attendeeEmails: attendeeEmails(event),
      cancelled: event.status === "CANCELLED",
    });
  }

  return events;
}

/** A member's full name, normalized (trim, collapse whitespace, case-fold). */
function normalizedName(member: Pick<Member, "firstName" | "lastName">): string {
  return `${member.firstName} ${member.lastName}`.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Normalize an event title for "always ignore" matching (trim, collapse, fold). */
export function normalizeTitle(summary?: string): string {
  return (summary ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Link a parsed event to a ward member.
 *
 *   1. By email — an attendee address equals a member's email on file. Reliable,
 *      so it wins outright.
 *   2. By name — the event summary/description contains exactly one member's full
 *      name. Fuzzy, so it is used only when a single member matches; ambiguity
 *      leaves the booking unmatched for manual review.
 *
 * Returns an empty match when nothing links — the ingest step keeps those in an
 * "unmatched" state rather than guessing.
 */
export function matchMember(event: ParsedEvent, members: Member[]): MemberMatch {
  // 1. Email — direct and unambiguous.
  const guestEmails = new Set(event.attendeeEmails);
  for (const member of members) {
    const email = member.email?.trim().toLowerCase();
    if (email && guestEmails.has(email)) {
      return { memberId: member.id, memberName: `${member.firstName} ${member.lastName}`, method: "email" };
    }
  }

  // 2. Name — only when exactly one member's full name appears in the text.
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
