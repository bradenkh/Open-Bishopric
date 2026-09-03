-- ============================================================================
-- Open Bishopric — tithing-settlement booking confirmation email
--
-- When a member self-books their household's settlement appointment through
-- their /book/<token> link, the app now emails them a confirmation of the
-- date, time, and interviewer. Like the invite email, the copy is editable:
-- a saved subject + body template (with {name}, {date}, {time}, {interviewer}
-- placeholders substituted at send time) lives in the RLS-locked app_settings
-- table. Null columns mean "not customized" — the app uses its built-in copy.
--
-- Forward-only + idempotent, mirroring prior migrations. Never destructive.
-- ============================================================================

alter table public.app_settings
  add column if not exists settlement_confirmation_subject text,
  add column if not exists settlement_confirmation_body    text;
