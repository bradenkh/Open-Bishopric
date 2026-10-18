import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Email templates. The app no longer sends email itself; these templates
 * prefill the drafts it opens in the user's own mail app (task reminders and
 * tithing-settlement links). They live in the server-only `app_settings`
 * table, so all access goes through the service-role client here.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select(
      "settlement_email_subject, settlement_email_body, settlement_confirmation_subject, settlement_confirmation_body, task_reminder_subject, task_reminder_body",
    )
    .eq("id", "default")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    // Empty string = not customized; the client falls back to the built-in copy.
    settlementEmailSubject: data?.settlement_email_subject ?? "",
    settlementEmailBody: data?.settlement_email_body ?? "",
    settlementConfirmationSubject: data?.settlement_confirmation_subject ?? "",
    settlementConfirmationBody: data?.settlement_confirmation_body ?? "",
    taskReminderSubject: data?.task_reminder_subject ?? "",
    taskReminderBody: data?.task_reminder_body ?? "",
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  // Each field is optional; omit to leave as-is, send an empty string to clear
  // it back to the built-in default.
  const fields: Record<string, string> = {
    settlementEmailSubject: "settlement_email_subject",
    settlementEmailBody: "settlement_email_body",
    settlementConfirmationSubject: "settlement_confirmation_subject",
    settlementConfirmationBody: "settlement_confirmation_body",
    taskReminderSubject: "task_reminder_subject",
    taskReminderBody: "task_reminder_body",
  };

  const patch: Record<string, string> = {};
  for (const [key, column] of Object.entries(fields)) {
    if (typeof body[key] === "string") patch[column] = body[key];
  }

  const { error } = await createAdminClient()
    .from("app_settings")
    .update(patch)
    .eq("id", "default");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
