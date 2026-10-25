import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Message templates: the tithing-settlement invitation and the task reminder.
 * The app sends no email itself — these are the text the bishopric copies into
 * LCR, Member Tools or their own mail client. Stored on the server-only
 * `app_settings` row, so access goes through the service-role client.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("settlement_email_subject, settlement_email_body, task_reminder_subject, task_reminder_body")
    .eq("id", "default")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    // Empty string = not customized; the client falls back to the built-in copy.
    settlementSubject: data?.settlement_email_subject ?? "",
    settlementBody: data?.settlement_email_body ?? "",
    taskReminderSubject: data?.task_reminder_subject ?? "",
    taskReminderBody: data?.task_reminder_body ?? "",
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  // Each field is optional; omit to leave as-is, send an empty string to clear it
  // back to the built-in default.
  const body = await request.json();
  const fields: Record<string, string> = {
    settlementSubject: "settlement_email_subject",
    settlementBody: "settlement_email_body",
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
