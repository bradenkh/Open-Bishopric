import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { isEmailConfigured, sendEmail } from "@/lib/email/gmail";

/**
 * Authenticated send endpoint used by the app's outbound email actions (agenda
 * requests, to-do reminders, interview times). Returns the assigned Message-ID so
 * the caller can store it on the related record and later match the inbound reply.
 *
 * Returns 409 `notConfigured` when no Gmail account is set up, so the client can
 * fall back gracefully (e.g. the agenda dialog falls back to a `mailto:` link).
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { to, subject, body, inReplyTo } = await request.json();

  if (typeof to !== "string" || !to.trim()) {
    return NextResponse.json({ error: "A recipient (to) is required." }, { status: 400 });
  }
  if (typeof subject !== "string" || typeof body !== "string") {
    return NextResponse.json({ error: "subject and body are required." }, { status: 400 });
  }

  if (!(await isEmailConfigured())) {
    return NextResponse.json({ error: "notConfigured" }, { status: 409 });
  }

  try {
    const { messageId } = await sendEmail({
      to: to.trim(),
      subject,
      body,
      inReplyTo: typeof inReplyTo === "string" && inReplyTo ? inReplyTo : undefined,
    });
    return NextResponse.json({ ok: true, messageId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
