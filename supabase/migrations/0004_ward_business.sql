-- ============================================================================
-- Open Bishopric — ward business: categorized, editable sacrament-meeting business
--
-- Adds:
--   * meetings.business — the ward business read in a sacrament meeting, keyed by
--                         category (Stake Visitors, Release, Sustainings, Setting
--                         Aparts, etc.). Stored as jsonb: a map of category name to
--                         an array of { id, text } entries. Release / Sustainings /
--                         Setting Aparts are seeded from the callings pipeline on
--                         first edit; all categories are freely editable thereafter.
--
-- Idempotent (never re-run on deploy — migration runner baselines this on existing
-- databases), mirroring the conventions in 0001_initial_schema.sql / 0002_meeting_agendas.sql.
-- ============================================================================

alter table public.meetings add column if not exists business jsonb;
