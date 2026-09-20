import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCalendar, getCalendarUrl, CalendarNotConfiguredError } from "@/lib/calendar/sync";

/**
 * Ingest the bishop's subscribed Google Calendar.
 *
 *   POST → fetch + parse the secret iCal feed, match appointments to members,
 *          upsert into `calendar_bookings`, and return the sync counts.
 *   GET  → current subscription state: whether a URL is set, when it last
 *          synced, and matched/unmatched counts.
 *
 * GET is deliberately lightweight — it never returns the booking rows themselves
 * (those already reach the client through the shared DataContext). It only reads
 * the small subscription-status fields, using count-only queries so the whole
 * `calendar_bookings` table isn't serialized on every Scheduling-tab visit.
 *
 * Server-only via the service-role client. Triggered on demand from Settings →
 * Calendar (there is no cron in this project — the email intake works the same
 * way), so re-syncing is safe and idempotent.
 */

export const maxDuration = 60;

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const admin = createAdminClient();

  const { data: settings, error } = await admin
    .from("app_settings")
    .select("calendar_synced_at")
    .eq("id", "default")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const url = await getCalendarUrl(admin);

  // Count-only queries (head: true) — no rows are transferred, just totals.
  const [matchedRes, unmatchedRes] = await Promise.all([
    admin.from("calendar_bookings").select("id", { count: "exact", head: true }).not("member_id", "is", null),
    admin.from("calendar_bookings").select("id", { count: "exact", head: true }).is("member_id", null),
  ]);
  if (matchedRes.error) return NextResponse.json({ error: matchedRes.error.message }, { status: 500 });
  if (unmatchedRes.error) return NextResponse.json({ error: unmatchedRes.error.message }, { status: 500 });

  return NextResponse.json({
    configured: Boolean(url),
    syncedAt: settings?.calendar_synced_at ?? null,
    matched: matchedRes.count ?? 0,
    unmatched: unmatchedRes.count ?? 0,
  });
}

export async function POST() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  try {
    const result = await syncCalendar(createAdminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof CalendarNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : "Failed to sync the calendar";
    // A bad URL / unreachable feed is an upstream failure, not our bug.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
