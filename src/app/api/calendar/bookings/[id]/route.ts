import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromRow } from "@/lib/db/mappers";
import type { Member } from "@/types";

/**
 * Manually link (or unlink) an ingested calendar booking to a ward member — the
 * review action for bookings the automatic matcher couldn't place (a member who
 * booked with an off-file email, say).
 *
 *   PATCH { memberId }        → link to that member (match_method = 'manual')
 *   PATCH { memberId: null }  → clear the link, back to unmatched
 *
 * A manual link is authoritative: the calendar sync preserves it and never
 * re-runs the auto-matcher over it (see lib/calendar/sync.ts).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const memberId: unknown = body?.memberId;

  const admin = createAdminClient();

  // Unlink: clear the member fields and the manual mark.
  if (memberId === null || memberId === "" || memberId === undefined) {
    const { error } = await admin
      .from("calendar_bookings")
      .update({ member_id: null, member_name: null, match_method: null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, memberId: null });
  }

  if (typeof memberId !== "string") {
    return NextResponse.json({ error: "memberId must be a string or null" }, { status: 400 });
  }

  // Resolve the member so the booking carries the display name too.
  const { data: memberRow, error: memberErr } = await admin
    .from("members")
    .select("*")
    .eq("id", memberId)
    .maybeSingle();
  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
  if (!memberRow) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const member = fromRow<Member>(memberRow as Record<string, unknown>);
  const { error } = await admin
    .from("calendar_bookings")
    .update({
      member_id: member.id,
      member_name: `${member.firstName} ${member.lastName}`,
      match_method: "manual",
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, memberId: member.id });
}
