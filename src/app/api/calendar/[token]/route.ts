import { type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { interviewsRepo } from "@/lib/db";
import { buildInterviewFeed } from "@/lib/calendar/ics";

/**
 * Public, token-authenticated iCalendar feed of the ward's scheduled interviews.
 * NO login required — the unguessable token in the URL is the credential (like
 * the /book links). It runs with the service-role client and returns ONLY the
 * interview appointments, never the wider ward data.
 *
 * Subscribe from Google Calendar via "Other calendars → From URL". Calendar apps
 * poll this endpoint periodically, so it must stay reachable without a session.
 * The feed URL is shown (and can be rotated/disabled) under Settings → Calendar.
 */

// Always read the live token + interviews; never let a CDN cache the response.
export const dynamic = "force-dynamic";

/** Constant-time string compare that tolerates unequal lengths. */
function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: raw } = await params;
  // Allow the URL to carry a friendly ".ics" suffix (…/calendar/<token>.ics).
  const token = raw.replace(/\.ics$/i, "");

  const admin = createAdminClient();

  let stored: string | null = null;
  try {
    const { data, error } = await admin
      .from("app_settings")
      .select("calendar_feed_token")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw error;
    stored = (data?.calendar_feed_token as string | null) ?? null;
  } catch {
    return new Response("Lookup failed", { status: 500 });
  }

  // No feed enabled, or a wrong/blank token — reveal nothing. Generic 404.
  if (!stored || !token || !tokensMatch(token, stored)) {
    return new Response("Not found", { status: 404 });
  }

  let ics: string;
  try {
    const interviews = await interviewsRepo.list(admin);
    ics = buildInterviewFeed(interviews, {
      uidHost: request.nextUrl.host || "open-bishopric",
    });
  } catch {
    return new Response("Feed unavailable", { status: 500 });
  }

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="interviews.ics"',
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
