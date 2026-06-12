-- ============================================================================
-- Open Bishopric — initial schema
--
-- A private, invite-only tool for a ward bishopric. Every authenticated user
-- is a trusted bishopric member with full read/write access to ward data;
-- access control is therefore "authenticated = full access" enforced by RLS,
-- with per-user identity tracked in `profiles`.
--
-- Conventions:
--   * snake_case columns; the app's data layer maps to camelCase TS types.
--   * Domain rows use text primary keys (ids are supplied by the app/seed) so
--     cross-references (e.g. tasks.context.callingId) stay stable.
--   * Nested/variable structures (agenda items, bulletin rows, ward leadership,
--     roster entries, task context) are stored as jsonb.
--   * Dates/times are stored as text in the same ISO/HH:MM shapes the UI uses.
-- ============================================================================

-- ── Idempotent teardown ─────────────────────────────────────────────────────
-- This migration is destructive: it drops our objects first, then recreates
-- them, so re-applying it gives a clean schema. It is only run via the manual
-- `npm run db:reset` (never on deploy), so it will wipe data wherever you point
-- it. Note this only touches the `public` schema — auth.users is left intact,
-- aside from our trigger on it.
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.tasks,
  public.roster_groups,
  public.availability_exceptions,
  public.availability_blocks,
  public.interviews,
  public.announcements,
  public.meetings,
  public.callings,
  public.members,
  public.ward_info,
  public.app_settings,
  public.agent_notes,
  public.profiles
  cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;

-- Auto-maintain updated_at on UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Profiles (one per auth user) ───────────────────────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text not null,
  role         text not null default 'counselor'
                 check (role in ('bishop', 'counselor', 'clerk', 'exec_secretary')),
  photo_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row automatically whenever an auth user is created
-- (e.g. via the Supabase dashboard invite flow). display_name/role can be
-- supplied through the invite's user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'counselor')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any auth users that already exist. The trigger only
-- fires for NEW users, but `profiles` is dropped and recreated on every reset
-- while auth.users persists — without this, existing users would lose their
-- profile (and be locked out) after each deploy. Role/display_name are read
-- from the user's metadata so they survive resets; set them once in
-- Authentication → Users (User Metadata: {"role":"bishop","display_name":"..."}).
insert into public.profiles (id, email, display_name, role)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1)),
  coalesce(raw_user_meta_data ->> 'role', 'counselor')
from auth.users
on conflict (id) do nothing;

-- The bishopric roster is NOT a separate table — it is derived from `profiles`
-- (the people with bishopric roles who can sign in). See src/contexts/DataContext.

-- ── Ward members ────────────────────────────────────────────────────────────
create table public.members (
  id           text primary key,
  first_name   text not null,
  last_name    text not null,
  email        text,
  phone        text,
  address      text,
  household_id text,
  is_active    boolean not null default true,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger members_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

-- ── Callings (the full release → recorded pipeline) ─────────────────────────
create table public.callings (
  id                     text primary key,
  member_id              text,
  member_name            text,
  position               text not null,
  organization           text,
  stage                  text not null
                           check (stage in (
                             'needs_calling', 'needs_release', 'extending',
                             'sustaining', 'set_apart', 'lcr_update',
                             'recorded')),
  notes                  text,
  suggested_replacements jsonb,
  replacement_name       text,
  released_name          text,
  released_by            text,
  extended_by            text,
  extended_at            text,
  decline_reason         text,
  declined_at            text,
  sustained_in           text check (sustained_in in ('sacrament_meeting', 'class')),
  sustained_date         text,
  business_item_added    boolean,
  set_apart_by           text,
  set_apart_date         text,
  lcr_updated            boolean,
  lcr_updated_at         text,
  lcr_updated_by         text,
  created_by             text not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger callings_updated_at
  before update on public.callings
  for each row execute function public.set_updated_at();

-- ── Meetings & agendas ───────────────────────────────────────────────────────
create table public.meetings (
  id         text primary key,
  title      text not null,
  type       text not null check (type in ('bishopric', 'sacrament_meeting', 'ward_council')),
  date       text not null,
  time       text,
  location   text,
  status     text not null check (status in ('upcoming', 'completed', 'cancelled')),
  agenda     jsonb not null default '[]'::jsonb,
  program    jsonb,
  notes      text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger meetings_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- ── Announcements ────────────────────────────────────────────────────────────
create table public.announcements (
  id          text primary key,
  title       text not null,
  description text,
  date        text,
  time        text,
  location    text,
  archived    boolean not null default false,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

-- ── Interviews (scheduling pipeline) ──────────────────────────────────────────
create table public.interviews (
  id                    text primary key,
  member_name           text not null,
  member_id             text,
  type                  text not null check (type in (
                          'temple_recommend', 'temple_recommend_youth', 'calling',
                          'ministering', 'tithing_settlement', 'youth',
                          'worthiness', 'other')),
  stage                 text not null check (stage in (
                          'schedule_any', 'schedule_bishop', 'pending_confirmation',
                          'scheduled', 'date_passed', 'completed')),
  requires_bishop       boolean,
  interviewer           text,
  attendee_confirmed    boolean,
  interviewer_confirmed boolean,
  scheduled_date        text,
  scheduled_time        text,
  duration_mins         integer,
  notes                 text,
  created_by            text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger interviews_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();

-- ── Interview availability ────────────────────────────────────────────────────
create table public.availability_blocks (
  id          text primary key,
  member_id   text not null,
  member_name text not null,
  weekday     integer not null check (weekday between 0 and 6),
  start_time  text not null,
  end_time    text not null,
  created_at  timestamptz not null default now()
);

create table public.availability_exceptions (
  id          text primary key,
  member_id   text not null,
  member_name text not null,
  start_date  text not null,
  end_date    text not null,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ── Calling roster (standing org chart, mirrors LCR) ─────────────────────────
create table public.roster_groups (
  id         text primary key,
  org        text not null,
  sub_org    text,
  entries    jsonb not null default '[]'::jsonb,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger roster_groups_updated_at
  before update on public.roster_groups
  for each row execute function public.set_updated_at();

-- ── Tasks ─────────────────────────────────────────────────────────────────────
create table public.tasks (
  id            text primary key,
  title         text not null,
  description   text,
  type          text not null check (type in (
                  'interview', 'follow_up', 'contact', 'todo', 'calling',
                  'agenda_item', 'announcement', 'general')),
  status        text not null check (status in (
                  'active', 'in_progress', 'waiting', 'completed', 'cancelled')),
  assignee_id   text,
  assignee_name text,
  member_id     text,
  member_name   text,
  due_date      text,
  context       jsonb,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ── Ward identity (bulletin letterhead) — singleton row ──────────────────────
create table public.ward_info (
  id              text primary key default 'default',
  ward_name       text not null,
  church_name     text not null,
  stake           text not null,
  address         text not null,
  meeting_title   text not null,
  meeting_time    text not null,
  leadership      jsonb not null default '[]'::jsonb,
  submission_note text not null default '',
  updated_at      timestamptz not null default now()
);

create trigger ward_info_updated_at
  before update on public.ward_info
  for each row execute function public.set_updated_at();

-- ── App settings (AI assistant config) — singleton row, server-only ──────────
-- Holds the AI agent's provider config, including its API key. Unlike the rest
-- of the schema this row is NEVER exposed to the browser: RLS is enabled with no
-- policy, so the anon/authenticated clients can't read it. It is read and
-- written only through the service-role client in the AI settings Route Handler
-- and the agent, keeping the API key off the client entirely.
create table public.app_settings (
  id          text primary key default 'default',
  ai_provider text not null default 'openai-compat'
                check (ai_provider in ('openai-compat', 'deepseek')),
  ai_model    text not null default 'openai/gpt-4o-mini',
  ai_base_url text not null default 'https://openrouter.ai/api/v1',
  ai_api_key  text,
  updated_at  timestamptz not null default now()
);

create trigger app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Seed the singleton row so the settings screen always has a row to update.
insert into public.app_settings (id) values ('default') on conflict (id) do nothing;

-- ── Agent notes (the assistant's durable memory) ─────────────────────────────
-- Standing preferences / facts the bishopric asks the AI assistant to remember
-- across conversations (e.g. "don't add the conference talk to the bulletin
-- agenda"). They're injected into the agent's system prompt on every request.
-- Not sensitive, so they use the normal authenticated-full-access policy below.
create table public.agent_notes (
  id         text primary key,
  content    text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger agent_notes_updated_at
  before update on public.agent_notes
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

-- Enable RLS on every table.
alter table public.profiles               enable row level security;
alter table public.members                enable row level security;
alter table public.callings               enable row level security;
alter table public.meetings               enable row level security;
alter table public.announcements          enable row level security;
alter table public.interviews             enable row level security;
alter table public.availability_blocks    enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.roster_groups          enable row level security;
alter table public.tasks                  enable row level security;
alter table public.ward_info              enable row level security;
alter table public.agent_notes            enable row level security;
-- app_settings: RLS enabled with NO policy — only the service role (which
-- bypasses RLS) may read or write it, so the AI API key never reaches a client.
alter table public.app_settings           enable row level security;

-- Profiles: any authenticated user can read the roster of leaders; a user may
-- only update their own profile. Inserts happen via the handle_new_user trigger
-- (security definer) or the service role.
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- All domain tables: full access for any authenticated bishopric member.
do $$
declare
  t text;
  domain_tables text[] := array[
    'members', 'callings', 'meetings', 'announcements',
    'interviews', 'availability_blocks', 'availability_exceptions',
    'roster_groups', 'tasks', 'ward_info', 'agent_notes'
  ];
begin
  foreach t in array domain_tables loop
    execute format(
      'create policy "authenticated full access" on public.%I
         for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end;
$$;

-- Ensure the Supabase API roles have table privileges (RLS still applies).
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
