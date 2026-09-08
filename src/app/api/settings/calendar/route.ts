import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBookingPageUrls } from "@/lib/booking-pages";

/**
 * Calendar configuration. Everything here lives on the server-only `app_settings`
 * table, so all access goes through the service-role client. Every signed-in user
 * is a trusted bishopric member, so GET returns the secret values themselves —
 * they're needed to manage the URLs — but they never reach an unauthenticated
 * request. Mirrors the email-settings route.
 *
 * Inbound subscription (the app reading the bishop's calendar):
 *   PUT { icalUrl } → save (or clear) the calendar's secret iCal address
 *
 * Google booking pages (members self-book by interview type):
 *   PUT { bookingPageUrls } → save the interview-type → booking-page-URL map
 *
 *   GET → { icalUrl, bookingPageUrls } — all settings at once
 */

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("bishop_ical_url, booking_page_urls")
    .eq("id", "default")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const icalUrl = (data?.bishop_ical_url as string | null) ?? "";
  const bookingPageUrls = normalizeBookingPageUrls(data?.booking_page_urls);
  return NextResponse.json({ icalUrl, bookingPageUrls });
}

/**
 * Save calendar settings. Each field is optional — only the ones provided are
 * written, so the client can update the iCal URL and the booking-page URLs
 * independently.
 *   { icalUrl }          → the inbound subscription's secret iCal URL (empty clears)
 *   { bookingPageUrls }  → the interview-type → booking-page-URL map
 */
export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const patch: Record<string, unknown> = {};

  if (typeof body?.icalUrl === "string") {
    // Empty string clears the subscription (stored as null).
    patch.bishop_ical_url = body.icalUrl.trim() || null;
  }
  if (body && "bookingPageUrls" in body) {
    patch.booking_page_urls = normalizeBookingPageUrls(body.bookingPageUrls);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Provide icalUrl and/or bookingPageUrls." },
      { status: 400 },
    );
  }

  const { error } = await createAdminClient()
    .from("app_settings")
    .update(patch)
    .eq("id", "default");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
