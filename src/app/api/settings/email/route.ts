import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailCreds, sendEmail, verifyEmailCreds } from "@/lib/email/gmail";

/**
 * Email (Gmail app-password) configuration. The address + app password live in
 * the server-only `app_settings` table, so all access goes through the
 * service-role client here. GET deliberately omits the password — it returns only
 * whether one is set and the address — so the secret never reaches the browser.
 * Mirrors the AI-settings route.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("gmail_address, gmail_app_password, settlement_email_subject, settlement_email_body")
    .eq("id", "default")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    gmailAddress: data?.gmail_address ?? "",
    connected: Boolean(data?.gmail_address && data?.gmail_app_password),
    // Empty string = not customized; the client falls back to the built-in copy.
    settlementEmailSubject: data?.settlement_email_subject ?? "",
    settlementEmailBody: data?.settlement_email_body ?? "",
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const gmailAddress: unknown = body.gmailAddress;
  // appPassword is optional on update: omit it to keep the current one; send an
  // empty string to clear it. Any other string replaces it.
  const appPassword: string | undefined = body.appPassword;
  // Settlement email template — each field is optional; omit to leave as-is, send
  // an empty string to clear it back to the built-in default.
  const settlementEmailSubject: unknown = body.settlementEmailSubject;
  const settlementEmailBody: unknown = body.settlementEmailBody;

  const patch: Record<string, string> = {};
  if (typeof gmailAddress === "string") patch.gmail_address = gmailAddress.trim();
  if (typeof appPassword === "string") {
    // Google shows app passwords with spaces ("abcd efgh ijkl mnop"); strip them.
    patch.gmail_app_password = appPassword.replace(/\s+/g, "");
  }
  if (typeof settlementEmailSubject === "string") patch.settlement_email_subject = settlementEmailSubject;
  if (typeof settlementEmailBody === "string") patch.settlement_email_body = settlementEmailBody;

  const { error } = await createAdminClient()
    .from("app_settings")
    .update(patch)
    .eq("id", "default");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

/**
 * Send a test email to verify the saved credentials end-to-end. POST { to } —
 * defaults to the mailbox itself, so the bishopric can confirm delivery without
 * bothering anyone else.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const creds = await getGmailCreds();
  if (!creds) {
    return NextResponse.json(
      { error: "Save a Gmail address and app password first." },
      { status: 400 },
    );
  }

  let to = creds.address;
  try {
    const body = await request.json();
    if (typeof body?.to === "string" && body.to.trim()) to = body.to.trim();
  } catch {
    /* empty body — send to self */
  }

  try {
    await verifyEmailCreds(creds);
    await sendEmail({
      to,
      subject: "Open Bishopric — test email",
      body: "This is a test message from Open Bishopric. If you received this, sending is working.",
    });
    return NextResponse.json({ ok: true, to });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send test email";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
