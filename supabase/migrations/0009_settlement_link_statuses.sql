-- ============================================================================
-- Open Bishopric — split settlement "invited" into link_created / link_opened
--
-- "Invited" implied the link had been sent, which isn't necessarily true — the
-- bishopric generates the link and delivers it separately. Replace that single
-- status with two honest ones:
--
--   * link_created — the personalized link exists (NOT that it's been sent).
--   * link_opened  — the member has followed the link at least once. Stamped
--                    automatically by the public booking API (GET /api/book/[token]).
--
-- Existing 'invited' rows are the "link exists" case, so they become
-- 'link_created'. Rows whose token has already been opened are nudged forward
-- to 'link_opened' to match the new automatic behavior.
--
-- Forward-only + idempotent, mirroring prior migrations. Never destructive.
-- ============================================================================

-- Drop the old CHECK so the data can be migrated without tripping it.
alter table public.settlement_records
  drop constraint if exists settlement_records_status_check;

-- Any link that's already been opened jumps straight to link_opened; the rest
-- of the old 'invited' rows are just "link created".
update public.settlement_records sr
  set status = 'link_opened'
  where sr.status = 'invited'
    and exists (
      select 1 from public.booking_tokens bt
      where bt.settlement_record_id = sr.id
        and bt.opened_at is not null
    );

update public.settlement_records
  set status = 'link_created'
  where status = 'invited';

-- Re-add the CHECK with the new status set.
alter table public.settlement_records
  add constraint settlement_records_status_check
  check (status in (
    'not_started', 'link_created', 'link_opened', 'scheduled',
    'completed', 'declined', 'exempt'));

-- Realign the column default's phrasing (it was already not_started).
alter table public.settlement_records
  alter column status set default 'not_started';
