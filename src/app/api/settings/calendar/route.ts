import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Calendar feed configuration. The feed token lives in the server-only
 * `app_settings` table, so all access goes through the service-role client here.
 * Every signed-in user is a trusted bishopric member, so GET returns the token
 * itself — they need it to build the subscribe URL — but it never reaches an
 * unauthenticated request. Mirrors the email-settings route.
 *
 *   GET    → { token, enabled }        current feed token (or null)
 *   POST   → { token, enabled: true }  generate / rotate the token
 *   DELETE → { enabled: false }        disable the feed, invalidating every URL
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
    .select("calendar_feed_token")
    .eq("id", "default")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const token = (data?.calendar_feed_token as string | null) ?? null;
  return NextResponse.json({ token, enabled: Boolean(token) });
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
