import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchNewReplies, isEmailConfigured, type InboundMessage } from "@/lib/email/gmail";

export const maxDuration = 60;

/**
 * Inbound reply intake. Reads recent Gmail messages and matches each one back to
 * the outbound request it answers — by comparing the reply's In-Reply-To /
 * References headers against the Message-ID we stored when sending. Matches update
 * the related record:
 *   • agenda_solicitations → reply_text + status='replied'
 *   • interviews           → the reply text is saved to notes for the assistant to
 *                            parse into a scheduled time.
 * Unmatched mail is ignored. Idempotent: a solicitation already 'replied' or an
 * interview whose notes already hold the reply is left alone, so re-polling is safe.
 *
 * Triggered on demand by the "Check for replies" button; can also be wired to a
 * cron. Returns { matched } so the caller can report how many replies landed.
 */
export async function POST() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  if (!(await isEmailConfigured())) {
    return NextResponse.json({ error: "Email isn't configured. Set it up in Settings → Email." }, { status: 409 });
  }

  let messages: InboundMessage[];
  try {
    messages = await fetchNewReplies({ withinDays: 30 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to read the inbox";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const db = createAdminClient();

  // Load the records that are awaiting a reply, keyed by the Message-ID we sent.
  const [{ data: solRows, error: solErr }, { data: intRows, error: intErr }] = await Promise.all([
    db.from("agenda_solicitations").select("id, email_message_id, status").not("email_message_id", "is", null),
    db.from("interviews").select("id, email_message_id, notes").not("email_message_id", "is", null),
  ]);
  if (solErr) return NextResponse.json({ error: solErr.message }, { status: 500 });
  if (intErr) return NextResponse.json({ error: intErr.message }, { status: 500 });

  const solByMsgId = new Map<string, { id: string; status: string }>();
  for (const r of solRows ?? []) if (r.email_message_id) solByMsgId.set(r.email_message_id, { id: r.id, status: r.status });
  const intByMsgId = new Map<string, { id: string; notes: string | null }>();
  for (const r of intRows ?? []) if (r.email_message_id) intByMsgId.set(r.email_message_id, { id: r.id, notes: r.notes });

  let matched = 0;

  for (const msg of messages) {
    // A reply references the original either via In-Reply-To or in References.
    const refs = [msg.inReplyTo, ...msg.references].filter(Boolean) as string[];

    const sol = refs.map((id) => solByMsgId.get(id)).find(Boolean);
    if (sol && sol.status !== "replied") {
      const { error } = await db
        .from("agenda_solicitations")
        .update({ reply_text: msg.text, status: "replied" })
        .eq("id", sol.id);
      if (!error) matched++;
      continue;
    }

    const int = refs.map((id) => intByMsgId.get(id)).find(Boolean);
    if (int) {
      const stamp = `Reply from ${msg.from}:\n${msg.text}`;
      // Skip if we've already recorded this exact reply (idempotent re-polling).
      if (int.notes?.includes(msg.text.trim()) && msg.text.trim()) continue;
      const notes = int.notes ? `${int.notes}\n\n${stamp}` : stamp;
      const { error } = await db.from("interviews").update({ notes }).eq("id", int.id);
      if (!error) matched++;
    }
  }

  return NextResponse.json({ ok: true, scanned: messages.length, matched });
}
