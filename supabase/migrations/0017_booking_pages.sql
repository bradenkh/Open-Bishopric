-- ============================================================================
-- Open Bishopric — Google booking-page URLs (per interview type)
--
-- Phase 2 of the calendar strategy shift: members self-book through Google
-- Calendar appointment/booking pages instead of the app's own /book flow. A
-- Google appointment schedule is one type with one duration, so each interview
-- type points at its own booking page. Outreach emails link members to the right
-- page; the resulting bookings flow back in via the calendar subscription
-- (Phase 1).
--
--   * app_settings.booking_page_urls — a JSON map of interview type → booking URL
--        (e.g. {"tithing_settlement": "https://calendar.app.google/…"}). Missing
--        or empty keys mean that type has no booking page configured yet.
--
-- Forward-only + idempotent (add column if not exists), mirroring prior
-- migrations. Never destructive.
-- ============================================================================

alter table public.app_settings
  add column if not exists booking_page_urls jsonb not null default '{}'::jsonb;
