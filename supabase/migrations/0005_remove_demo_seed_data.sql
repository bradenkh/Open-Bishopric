-- ============================================================================
-- Open Bishopric — remove demo seed data
--
-- supabase/seed.sql (generated from src/lib/mock-data.ts) was applied against
-- this database at some point, inserting a fictional prototype dataset —
-- "Bishop Anderson", "Counselor Hughes", "Counselor Davis", demo members,
-- callings, meetings, announcements, interviews, availability, and tasks.
-- That data is still live and was leaking into real workflows (e.g. the
-- interview scheduler offering slots for interviewers who don't exist).
--
-- Deletes exactly the rows seed.sql inserts, by their known ids (the app
-- never generates ids in these short forms — see newId() in DataContext,
-- which uses crypto.randomUUID()) as well as the demo created_by marker.
-- Real data — roster_groups and ward_info (the actual Schenectady Ward
-- roster/letterhead) — is untouched.
--
-- Idempotent (never re-run on deploy — migration runner baselines this on
-- existing databases), mirroring the conventions in prior migrations.
-- ============================================================================

delete from public.interviews
  where created_by = 'mock-bishop-001'
     or id in ('int01','int02','int03','int04','int05','int06','int07','int08','int09');

delete from public.tasks
  where created_by = 'mock-bishop-001'
     or id in ('t01','t02','t03','t04','t05','t06','t07','t08');

delete from public.meetings
  where created_by = 'mock-bishop-001'
     or id in ('mtg01','mtg02','mtg03','mtg04','mtg05');

delete from public.announcements
  where created_by = 'mock-bishop-001'
     or id in ('ann01','ann02','ann03','ann04','ann05');

delete from public.callings
  where created_by = 'mock-bishop-001'
     or id in ('c00a','c00b','c00c','c00d','c01','c02','c03','c05','c06','c07','c08','c09','c10','c11');

-- No created_by column on these — the demo ids are the only signal.
delete from public.availability_exceptions where id in ('ax1');
delete from public.availability_blocks
  where id in ('av1','av2','av3','av4','av5','av6','av7')
     or member_id in ('bm1','bm2','bm3');

delete from public.members
  where id in ('m01','m02','m03','m04','m05','m06','m07','m08','m09','m10','m11','m12');
