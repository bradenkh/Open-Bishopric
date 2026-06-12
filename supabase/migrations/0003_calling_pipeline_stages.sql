-- ============================================================================
-- Open Bishopric — calling pipeline stage rework
--
-- Reworks the calling lifecycle stages:
--   * adds   needs_calling (a member who needs a calling) and lcr_update
--            (set apart, awaiting the ward clerk to record it in LCR)
--   * drops  accepted, sustained, lcr_updated as resting stages — accepting
--            now jumps straight to sustaining, and the trailing LCR step is
--            renamed lcr_update.
--
-- Because deploys never rebuild the database, this forward migration alters the
-- existing `callings.stage` CHECK constraint in place and backfills any rows
-- still carrying the old values. Safe to run against a populated database.
--
-- Idempotent (re-applied by the manual `npm run db:reset`, never on deploy),
-- mirroring the conventions in 0001_initial_schema.sql.
-- ============================================================================

-- 1. Drop the old constraint so the backfill can write the new values.
alter table public.callings drop constraint if exists callings_stage_check;

-- 2. Migrate any legacy stage values forward (matches the app's normalizeStage).
update public.callings
set stage = case stage
  when 'accepted'    then 'sustaining'
  when 'sustained'   then 'set_apart'
  when 'lcr_updated' then 'lcr_update'
  -- pre-0001 legacy values, handled defensively (no-ops if absent)
  when 'identified'  then 'vacant'
  when 'discussing'  then 'vacant'
  when 'approved'    then 'extending'
  when 'extended'    then 'extending'
  when 'responded'   then 'sustaining'
  else stage
end
where stage in (
  'accepted', 'sustained', 'lcr_updated',
  'identified', 'discussing', 'approved', 'extended', 'responded'
);

-- 3. Re-add the constraint with the current set of stages.
alter table public.callings add constraint callings_stage_check
  check (stage in (
    'needs_calling', 'vacant', 'needs_release',
    'extending', 'sustaining', 'set_apart',
    'lcr_update', 'recorded'
  ));
