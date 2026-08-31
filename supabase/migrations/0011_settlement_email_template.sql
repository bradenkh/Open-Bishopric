-- ============================================================================
-- Open Bishopric — customizable tithing-settlement link email
--
-- The email that delivers a member's settlement booking link was hard-coded.
-- Let the bishopric edit it: a saved subject + body template (with {name} and
-- {link} placeholders substituted per recipient at send time) lives in the
-- RLS-locked app_settings table, next to the Gmail credentials. Null columns
-- mean "not customized" — the app falls back to its built-in default copy.
--
-- Forward-only + idempotent, mirroring prior migrations. Never destructive.
-- ============================================================================

alter table public.app_settings
  add column if not exists settlement_email_subject text,
  add column if not exists settlement_email_body    text;
