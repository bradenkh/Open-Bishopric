-- ============================================================================
-- Open Bishopric — interview calendar feed (iCalendar subscription)
--
-- The interview board can now be mirrored into Google Calendar (or any calendar
-- app) as a read-only, subscribe-by-URL feed. The feed is protected by an
-- unguessable token — anyone with the URL can read the ward's scheduled
-- appointments, so the token IS the credential, exactly like a /book link.
--
-- The token lives in the server-only, RLS-locked `app_settings` table (next to
-- the Gmail + AI credentials), so it is read/written only through the
-- service-role client. A null column means the feed has never been enabled;
-- clearing it back to null disables the feed and invalidates every prior URL.
--
-- Forward-only + idempotent, mirroring prior migrations. Never destructive.
-- ============================================================================

alter table public.app_settings
  add column if not exists calendar_feed_token text;
