import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { membersRepo } from "@/lib/db";
import { fetchIcs, parseIcs, matchMember, inferInterviewType, normalizeTitle } from "./subscribe";

/**
 * Ingest step for the calendar subscription. Reads the bishop's secret iCal URL
 * from `app_settings`, fetches and parses the feed, matches each appointment to
 * a ward member, and upserts the results into `calendar_bookings` (keyed by the
 * event UID, so re-syncing is idempotent). Records the sync time on
 * `app_settings.calendar_synced_at`.
 *
 * Runs under the service-role client from the `/api/calendar/sync` route.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface SyncResult {
  /** Appointments parsed from the feed. */
  fetched: number;
  /** Rows written (inserted or updated). */
  upserted: number;
  /** Of those, how many linked to a member. */
  matched: number;
  /** Of those, how many could not be linked (need manual review). */
  unmatched: number;
  /** Of those, how many the feed marks cancelled. */
  cancelled: number;
  /** ISO timestamp of this sync. */
  syncedAt: string;
}

/** Raised when no iCal URL has been configured yet, so the caller can 409. */
export class CalendarNotConfiguredError extends Error {
  constructor() {
    super("No calendar subscription URL is set. Add it in Settings → Calendar.");
    this.name = "CalendarNotConfiguredError";
  }
}

/** The subset of an existing row we consult to preserve manual member links. */
interface ExistingLink {
  memberId: string | null;
  memberName: string | null;
  matchMethod: string | null;
  status: string | null;
}

/** Read the configured secret iCal URL, or null when the feed isn't set up. */
export async function getCalendarUrl(admin: Admin): Promise<string | null> {
  const { data, error } = await admin
    .from("app_settings")
    .select("bishop_ical_url")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  const url = (data?.bishop_ical_url as string | null)?.trim();
  return url || null;
}

/**
 * Fetch, parse, match, and store the bishop's calendar. Manual member links
 * (match_method = 'manual') set by a reviewer are preserved across syncs — the
 * automatic matcher never overwrites a human decision.
 */
export async function syncCalendar(admin: Admin): Promise<SyncResult> {
  const url = await getCalendarUrl(admin);
  if (!url) throw new CalendarNotConfiguredError();

  const [icsText, members] = await Promise.all([fetchIcs(url), membersRepo.list(admin)]);
  const syncedAt = new Date().toISOString();

  // Standing "always ignore" title rules — skip any event whose title matches,
  // so recurring non-interview events (e.g. a weekly council) never re-enter.
  const { data: settingsRow, error: settingsReadErr } = await admin
    .from("app_settings")
    .select("ignored_event_titles")
    .eq("id", "default")
    .maybeSingle();
  if (settingsReadErr) throw settingsReadErr;
  const ignoredTitles = new Set(
    ((settingsRow?.ignored_event_titles as string[] | null) ?? []).map((t) => normalizeTitle(t)),
  );

  const events = parseIcs(icsText).filter((e) => !ignoredTitles.has(normalizeTitle(e.summary)));

  // Load existing links + status so a manual match or an "ignored" dismissal
  // survives re-syncing.
  const existing = new Map<string, ExistingLink>();
  if (events.length) {
    const { data, error } = await admin
      .from("calendar_bookings")
      .select("id, member_id, member_name, match_method, status")
      .in("id", events.map((e) => e.uid));
    if (error) throw error;
    for (const row of data ?? []) {
      existing.set(row.id as string, {
        memberId: (row.member_id as string | null) ?? null,
        memberName: (row.member_name as string | null) ?? null,
        matchMethod: (row.match_method as string | null) ?? null,
        status: (row.status as string | null) ?? null,
      });
    }
  }

  let matched = 0;
  let unmatched = 0;
  let cancelled = 0;

  const rows = events.map((event) => {
    const prior = existing.get(event.uid);
    // A reviewer's manual link is authoritative; otherwise run the auto-matcher.
    const link =
      prior?.matchMethod === "manual"
        ? { memberId: prior.memberId ?? undefined, memberName: prior.memberName ?? undefined, method: "manual" as const }
        : matchMember(event, members);

    if (link.memberId) matched++;
    else unmatched++;
    if (event.cancelled) cancelled++;

    // A reviewer's "ignored" dismissal sticks; otherwise the feed's state wins.
    const status = prior?.status === "ignored" ? "ignored" : event.cancelled ? "cancelled" : "active";

    return {
      id: event.uid,
      summary: event.summary ?? null,
      description: event.description ?? null,
      location: event.location ?? null,
      start_at: event.start.toISOString(),
      end_at: event.end ? event.end.toISOString() : null,
      organizer_email: event.organizerEmail ?? null,
      attendee_emails: event.attendeeEmails,
      member_id: link.memberId ?? null,
      member_name: link.memberName ?? null,
      match_method: link.method ?? null,
      interview_type: inferInterviewType(event) ?? null,
      status,
      last_seen_at: syncedAt,
    };
  });

  if (rows.length) {
    // Upsert by UID. Only the columns above are written, so each row's
    // created_at (column default) is preserved across updates.
    const { error } = await admin.from("calendar_bookings").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }

  // Sweep out stale, unmatched noise: rows that are no longer in the feed's
  // qualifying set (e.g. all-day events dropped by the ingest filter, or events
  // removed from the calendar) and were never linked to a member or dismissed by
  // hand. Matched, manually-linked, and ignored rows are always kept.
  const keepUids = new Set(rows.map((r) => r.id));
  const { data: strays, error: strayErr } = await admin
    .from("calendar_bookings")
    .select("id")
    .is("member_id", null)
    .is("match_method", null)
    .eq("status", "active");
  if (strayErr) throw strayErr;
  const toDelete = (strays ?? []).map((r) => r.id as string).filter((id) => !keepUids.has(id));
  if (toDelete.length) {
    const { error: delErr } = await admin.from("calendar_bookings").delete().in("id", toDelete);
    if (delErr) throw delErr;
  }

  const { error: settingsError } = await admin
    .from("app_settings")
    .update({ calendar_synced_at: syncedAt })
    .eq("id", "default");
  if (settingsError) throw settingsError;

  return {
    fetched: events.length,
    upserted: rows.length,
    matched,
    unmatched,
    cancelled,
    syncedAt,
  };
}
