-- ============================================================================
-- Open Bishopric — availability windows gain a preferred time slot
--
-- Each availability window can now name a preferred appointment time (e.g.
-- 19:00 for an 18:00–20:00 window). The scheduler phases the slot grid so the
-- preferred time is a bookable boundary and offers it first, filling the
-- neighbouring slots only once the preferred slot is taken.
--
-- Forward-only + idempotent (add column if not exists), mirroring the
-- conventions in 0001_initial_schema.sql. Never destructive: existing rows keep
-- a NULL preferred_time and behave exactly as before (earliest slot first).
-- ============================================================================

alter table public.availability_blocks
  add column if not exists preferred_time text;
