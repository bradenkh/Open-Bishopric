-- ============================================================================
-- Open Bishopric — customizable task-reminder email
--
-- The reminder emailed to a task's owner was hard-coded. Let the bishopric edit
-- it: a saved subject + body template (with {name}, {task}, {description} and
-- {due} placeholders substituted per task when a reminder is composed) lives in
-- the RLS-locked app_settings table, next to the Gmail credentials and the
-- settlement email templates. Null columns mean "not customized" — the app falls
-- back to its built-in default copy.
--
-- Forward-only + idempotent, mirroring prior migrations. Never destructive.
-- ============================================================================

alter table public.app_settings
  add column if not exists task_reminder_subject text,
  add column if not exists task_reminder_body    text;
