-- ============================================================================
-- Open Bishopric — let ingested calendar bookings be marked "ignored"
--
-- The calendar subscription reads whatever is on the bishop's calendar. Non-
-- appointment events that slip through the ingest filters (e.g. a group meeting)
-- can be dismissed so they stop cluttering the "needs linking" queue. An ignored
-- booking is preserved across syncs (the ingest never re-activates it), just like
-- a manual member link.
--
-- Widens calendar_bookings.status from ('active','cancelled') to add 'ignored'.
-- Forward-only + idempotent. Never destructive.
-- ============================================================================

alter table public.calendar_bookings
  drop constraint if exists calendar_bookings_status_check;
alter table public.calendar_bookings
  add constraint calendar_bookings_status_check
    check (status in ('active', 'cancelled', 'ignored'));
