-- ============================================================================
-- Open Bishopric — subscribe to the bishop's Google Calendar (inbound)
--
-- Strategy shift: instead of the app owning scheduling and pushing an outbound
-- iCal feed (migration 0014), the bishop owns availability and bookings in
-- Google — members self-book through Google appointment/booking pages — and the
-- app SUBSCRIBES to his calendar to read the resulting appointments. This is the
-- read side (Phase 1, "ingest").
--
-- Adds:
--   * app_settings.bishop_ical_url   — the calendar's *secret* iCal address
--        (Google Calendar → Settings → "Secret address in iCal format"). The
--        URL is the credential, so it lives in the server-only, RLS-locked
--        app_settings table, read/written only through the service-role client.
--   * app_settings.calendar_synced_at — when the feed was last ingested.
--   * calendar_bookings              — one row per appointment read from the
--        feed, keyed by the event's iCalendar UID so re-syncing upserts in place
--        and matched back to a ward member where possible.
--
-- Forward-only + idempotent (add column / create table if not exists), mirroring
-- prior migrations. Never destructive.
-- ============================================================================

-- ── Inbound subscription settings (server-only, on the app_settings singleton) ─
alter table public.app_settings
  add column if not exists bishop_ical_url   text;
alter table public.app_settings
  add column if not exists calendar_synced_at timestamptz;

-- ── Ingested appointments ────────────────────────────────────────────────────
-- Read-only mirror of the bishop's calendar. The app never writes events back to
-- Google; it only records what it reads here, linking each to a roster member.
create table if not exists public.calendar_bookings (
  -- The event's iCalendar UID — stable across syncs, so the ingest upserts by it.
  id              text primary key,
  summary         text,
  description     text,
  location        text,
  -- Absolute instants (the parser resolves the feed's TZID/UTC to a timestamp).
  start_at        timestamptz not null,
  end_at          timestamptz,
  organizer_email text,
  -- Guest email addresses on the event; the booking member is usually among them.
  attendee_emails jsonb not null default '[]'::jsonb,
  -- The matched ward member (null ⇒ unmatched, needs review). FK clears if the
  -- member row is deleted, leaving the booking behind for manual re-linking.
  member_id       text references public.members(id) on delete set null,
  member_name     text,
  -- How the link was made: 'email' | 'name' | 'manual' (null when unmatched).
  match_method    text check (match_method in ('email', 'name', 'manual')),
  -- Interview type inferred from the booking page / summary, when recognizable.
  interview_type  text check (interview_type in (
                    'temple_recommend', 'temple_recommend_youth', 'calling',
                    'ministering', 'tithing_settlement', 'youth',
                    'worthiness', 'other')),
  -- 'active' | 'cancelled' (the latter set when the feed marks STATUS:CANCELLED).
  status          text not null default 'active'
                    check (status in ('active', 'cancelled')),
  -- When this event was last seen in the feed (a future removal-detection hook).
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists calendar_bookings_start_at_idx
  on public.calendar_bookings (start_at);
create index if not exists calendar_bookings_member_id_idx
  on public.calendar_bookings (member_id);

drop trigger if exists calendar_bookings_updated_at on public.calendar_bookings;
create trigger calendar_bookings_updated_at
  before update on public.calendar_bookings
  for each row execute function public.set_updated_at();

-- Same access shape as the other domain tables: any authenticated bishopric
-- member has full access (the tracking board reads it); the service role (the
-- ingest route) bypasses RLS. The secret iCal URL itself stays on app_settings,
-- which has NO policy, so it never reaches a client.
alter table public.calendar_bookings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_bookings'
      and policyname = 'authenticated full access'
  ) then
    execute 'create policy "authenticated full access" on public.calendar_bookings
               for all to authenticated using (true) with check (true);';
  end if;
end $$;

grant all on public.calendar_bookings to anon, authenticated, service_role;
