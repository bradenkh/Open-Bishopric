-- ============================================================================
-- Open Bishopric — Meetings: markdown agenda documents
--
-- The previous meeting-agenda builder (sectioned agenda items, pre-meeting
-- item collection) proved too rigid and was removed. This replaces it with a
-- much simpler model: each meeting is a single editable markdown document,
-- plus a free-form notes field used while the meeting is run in "meeting mode".
-- Assignments and to-dos captured during a meeting are stored as regular rows
-- in the existing `tasks` table, linked back to the agenda via
-- context.agendaId, so they also surface on the Tasks screen.
--
--   meeting_agendas
--     id         — app-supplied text id
--     title      — display name of the agenda
--     content    — the agenda itself, as markdown
--     notes      — free-form meeting notes (markdown/plain text)
--     meeting_date — optional date the meeting is for (YYYY-MM-DD)
--
-- Idempotent, mirroring the conventions in 0001_initial_schema.sql.
-- ============================================================================

create table if not exists public.meeting_agendas (
  id           text primary key,
  title        text not null,
  content      text not null default '',
  notes        text not null default '',
  meeting_date text,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- A previous revision of this migration created a `todos` jsonb column; to-dos
-- are now Task rows, so drop it where it already exists.
alter table public.meeting_agendas drop column if exists todos;

drop trigger if exists meeting_agendas_updated_at on public.meeting_agendas;
create trigger meeting_agendas_updated_at
  before update on public.meeting_agendas
  for each row execute function public.set_updated_at();

-- ── Row Level Security: authenticated bishopric members have full access ─────
alter table public.meeting_agendas enable row level security;

drop policy if exists "authenticated full access" on public.meeting_agendas;
create policy "authenticated full access"
  on public.meeting_agendas
  for all to authenticated using (true) with check (true);

grant all on public.meeting_agendas to anon, authenticated, service_role;
