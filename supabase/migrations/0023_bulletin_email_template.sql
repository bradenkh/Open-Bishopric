-- ============================================================================
-- Open Bishopric — customizable weekly bulletin email
--
-- The getBulletinPdf tool returns the bulletin PDF together with the text of the
-- email that goes out to the ward with it. That email is a template the
-- bishopric edits in Settings → Email ({ward}, {date} and {announcements} are
-- filled in each week). Null columns mean "not customized" — the app falls back
-- to its built-in default copy.
--
-- Forward-only + idempotent, mirroring prior migrations. Never destructive.
-- ============================================================================

alter table public.app_settings
  add column if not exists bulletin_email_body text;
