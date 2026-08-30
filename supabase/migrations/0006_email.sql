-- ============================================================================
-- Open Bishopric — email send + receive (Gmail via app password)
--
-- Adds real two-way email, replacing the deferred `mailto:` / paste-in-reply
-- seam. Credentials are a Gmail address + app password stored server-side in the
-- RLS-locked app_settings table (same home as ai_api_key); transport is SMTP for
-- send and IMAP for receive (see src/lib/email/gmail.ts).
--
-- Adds:
--   * app_settings.gmail_address / gmail_app_password — the sending mailbox.
--   * agenda_solicitations.email_message_id / email_thread_id — the Message-ID and
--       thread of the outbound request, used to match inbound replies back to the
--       row (via the reply's In-Reply-To / References headers).
--   * interviews.email_message_id / email_thread_id — same, for scheduling threads.
--   * tasks.reminder_sent_at — when a to-do reminder was last emailed (send-only).
--
-- Idempotent (never re-run on deploy — migration runner baselines this on existing
-- databases), mirroring the conventions in 0001_initial_schema.sql / 0002 / 0004.
-- ============================================================================

-- ── Sending mailbox credentials (server-only) ────────────────────────────────
alter table public.app_settings add column if not exists gmail_address      text;
alter table public.app_settings add column if not exists gmail_app_password text;

-- ── Outbound message identity for inbound reply matching ─────────────────────
alter table public.agenda_solicitations add column if not exists email_message_id text;
alter table public.agenda_solicitations add column if not exists email_thread_id  text;

alter table public.interviews add column if not exists email_message_id text;
alter table public.interviews add column if not exists email_thread_id  text;

-- ── Task reminders (send-only) ───────────────────────────────────────────────
alter table public.tasks add column if not exists reminder_sent_at timestamptz;
