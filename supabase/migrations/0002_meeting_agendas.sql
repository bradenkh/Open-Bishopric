-- ============================================================================
-- Open Bishopric — meeting agendas: sectioned agendas + pre-meeting collection
--
-- Adds:
--   * meetings.sections   — ordered section headings for an agenda (jsonb).
--                           (Agenda items themselves live in the existing
--                           `agenda` jsonb column; their new sub-fields —
--                           section/outcome/source/carriedInto — need no DDL.)
--   * agenda_solicitations — one row per (meeting, organization) request asking
--                           a leader to keep/dismiss prior items and add new ones
--                           before a meeting.
--
-- Idempotent (re-applied by the manual `npm run db:reset`, never on deploy),
-- mirroring the conventions in 0001_initial_schema.sql.
-- ============================================================================

-- ── meetings.sections ───────────────────────────────────────────────────────
alter table public.meetings add column if not exists sections jsonb;

-- ── Pre-meeting agenda collection ───────────────────────────────────────────
drop table if exists public.agenda_solicitations cascade;

create table public.agenda_solicitations (
  id            text primary key,
  meeting_id    text not null references public.meetings (id) on delete cascade,
  org           text not null,
  leader_name   text not null,
  leader_email  text,
  status        text not null default 'draft'
                  check (status in ('draft', 'sent', 'replied')),
  carried_items jsonb not null default '[]'::jsonb,
  message       text,
  reply_text    text,
  sent_at       timestamptz,
  created_by    text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger agenda_solicitations_updated_at
  before update on public.agenda_solicitations
  for each row execute function public.set_updated_at();

-- ── Row Level Security: authenticated bishopric members have full access ─────
alter table public.agenda_solicitations enable row level security;

drop policy if exists "authenticated full access" on public.agenda_solicitations;
create policy "authenticated full access"
  on public.agenda_solicitations
  for all to authenticated using (true) with check (true);

grant all on public.agenda_solicitations to anon, authenticated, service_role;
