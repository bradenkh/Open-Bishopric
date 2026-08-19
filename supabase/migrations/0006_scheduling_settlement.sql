-- ============================================================================
-- Open Bishopric — scheduling hub: tithing-settlement tracking + public booking
--
-- Grows the interview board into a ward-wide scheduling hub:
--   * settlement_records — one row per member per year tracking whether each
--     ward member's tithing settlement has been booked/held, plus the declared
--     status (full/partial/non/exempt) recorded at the interview.
--   * booking_tokens — personalized, unguessable links a member follows to book
--     their own settlement slot. The token IS the credential; the public booking
--     API (service role) is the only thing that reads/writes these, so RLS stays
--     closed and the app stays invite-only.
--   * availability_blocks recurrence — beyond simple weekly windows: biweekly,
--     "every N weeks", and nth-weekday ("first Sunday of the month") patterns.
--
-- Forward-only + idempotent (create ... if not exists / add column if not exists
-- / drop policy if exists then create), mirroring the conventions in
-- 0001_initial_schema.sql. Never destructive.
-- ============================================================================

-- ── Availability recurrence (extends 0001's weekly-only blocks) ──────────────
alter table public.availability_blocks
  add column if not exists recurrence    text not null default 'weekly',
  add column if not exists interval_weeks integer,
  add column if not exists nth           integer,
  add column if not exists anchor_date   text;

alter table public.availability_blocks
  drop constraint if exists availability_blocks_recurrence_check;
alter table public.availability_blocks
  add constraint availability_blocks_recurrence_check
  check (recurrence in ('weekly', 'biweekly', 'nth_weekday', 'every_n_weeks'));

-- ── Settlement records (one per member per year) ─────────────────────────────
create table if not exists public.settlement_records (
  id              text primary key,
  member_id       text,
  member_name     text not null,
  year            integer not null,
  status          text not null default 'not_started' check (status in (
                    'not_started', 'invited', 'scheduled',
                    'completed', 'declined', 'exempt')),
  interview_id    text,
  -- The member's self-declared tithing status, recorded at/after the interview.
  declared_status text check (declared_status in ('full', 'partial', 'non', 'exempt')),
  notes           text,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One settlement record per member per year.
create unique index if not exists settlement_records_member_year_idx
  on public.settlement_records (member_id, year);

drop trigger if exists settlement_records_updated_at on public.settlement_records;
create trigger settlement_records_updated_at
  before update on public.settlement_records
  for each row execute function public.set_updated_at();

-- ── Booking tokens (personalized self-signup links) ──────────────────────────
create table if not exists public.booking_tokens (
  id                   text primary key,
  token                text not null unique,
  member_id            text,
  member_name          text not null,
  purpose              text not null default 'tithing_settlement',
  year                 integer,
  settlement_record_id text,
  expires_at           timestamptz,
  used_at              timestamptz,
  interview_id         text,
  created_by           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists booking_tokens_member_idx
  on public.booking_tokens (member_id);

drop trigger if exists booking_tokens_updated_at on public.booking_tokens;
create trigger booking_tokens_updated_at
  before update on public.booking_tokens
  for each row execute function public.set_updated_at();

-- ── RLS: authenticated-only, mirroring 0001's domain-table policy ────────────
-- No anon policy: public booking never touches these tables directly — it goes
-- through the service-role booking API, which bypasses RLS in a trusted server
-- context. The anon/authenticated Supabase clients can read nothing here.
alter table public.settlement_records enable row level security;
alter table public.booking_tokens     enable row level security;

do $$
declare
  t text;
  new_tables text[] := array['settlement_records', 'booking_tokens'];
begin
  foreach t in array new_tables loop
    execute format('drop policy if exists "authenticated full access" on public.%I;', t);
    execute format(
      'create policy "authenticated full access" on public.%I
         for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end;
$$;

-- Ensure the Supabase API roles have table privileges (RLS still applies).
grant all on public.settlement_records to anon, authenticated, service_role;
grant all on public.booking_tokens     to anon, authenticated, service_role;
