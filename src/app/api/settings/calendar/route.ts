import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Calendar configuration. Two independent settings live here, both in the
 * server-only `app_settings` table, so all access goes through the service-role
 * client. Every signed-in user is a trusted bishopric member, so GET returns the
 * secret values themselves — they're needed to build/manage the URLs — but they
 * never reach an unauthenticated request. Mirrors the email-settings route.
 *
 * Outbound feed (legacy — the app mirroring its board into Google):
 *   POST   → { token, enabled: true }  generate / rotate the feed token
 *   DELETE → { enabled: false }        disable the feed, invalidating every URL
 *
 * Inbound subscription (current strategy — the app reading the bishop's calendar):
 *   PUT { icalUrl } → save (or clear) the calendar's secret iCal address
 *
 *   GET → { token, enabled, icalUrl } — both settings at once
 */

/** An unguessable, URL-safe feed token. */
function newFeedToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("calendar_feed_token, bishop_ical_url")
    .eq("id", "default")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const token = (data?.calendar_feed_token as string | null) ?? null;
  const icalUrl = (data?.bishop_ical_url as string | null) ?? "";
  return NextResponse.json({ token, enabled: Boolean(token), icalUrl });
}

/** Save (or clear) the inbound subscription's secret iCal URL. */
export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const icalUrl: unknown = body?.icalUrl;
  if (typeof icalUrl !== "string") {
    return NextResponse.json({ error: "icalUrl must be a string" }, { status: 400 });
  }

  const trimmed = icalUrl.trim();
  const { error } = await createAdminClient()
    .from("app_settings")
    // Empty string clears the subscription (stored as null).
    .update({ bishop_ical_url: trimmed || null })
    .eq("id", "default");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, icalUrl: trimmed });
}

export async function POST() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const token = newFeedToken();
  const { error } = await createAdminClient()
    .from("app_settings")
    .update({ calendar_feed_token: token })
    .eq("id", "default");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ token, enabled: true });
}

export async function DELETE() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { error } = await createAdminClient()
    .from("app_settings")
    .update({ calendar_feed_token: null })
    .eq("id", "default");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ enabled: false });
}
