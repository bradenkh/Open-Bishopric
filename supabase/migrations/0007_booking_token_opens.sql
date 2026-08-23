-- ============================================================================
-- Open Bishopric — track booking-link opens
--
-- Records when a member opens their personalized booking link, so the
-- bishopric can tell "invited but never looked" apart from "opened the link
-- but hasn't booked yet" — the second group is the one to nudge.
--
--   * opened_at  — first time the link's page was loaded (null = never opened).
--   * open_count — how many times it has been loaded.
--
-- Stamped by the public booking API (GET /api/book/[token]).
--
-- Forward-only + idempotent, mirroring prior migrations. Never destructive.
-- ============================================================================

alter table public.booking_tokens
  add column if not exists opened_at  timestamptz,
  add column if not exists open_count integer not null default 0;
