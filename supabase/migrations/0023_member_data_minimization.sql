-- ============================================================================
-- Open Bishopric — member data minimization
--
-- Brings the stored member data closer to the Church's privacy guidance
-- (General Handbook 38.8.31 and 38.8.47) by keeping only what the app needs:
--
--   * members.age → members.is_minor. The app only ever needed to know whether
--     someone is a youth or an adult; it no longer keeps their age.
--   * members.email, members.phone and members.address are dropped. Members are
--     contacted through LCR and Member Tools, so the app keeps names only.
--   * calendar_bookings no longer keeps attendee emails, and email addresses and
--     phone numbers are scrubbed out of stored booking titles/descriptions.
--   * settlement_records.declared_status is dropped. A member's tithing
--     declaration is recorded by the bishop in LCR, not here.
--   * The in-app AI assistant is gone (Claude reaches the app through the MCP
--     server instead), so the saved AI provider configs and API keys are dropped.
--
-- Forward-only and idempotent.
-- ============================================================================

-- ── Members: age → is_minor, drop address ───────────────────────────────────
alter table public.members
  add column if not exists is_minor boolean not null default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'members' and column_name = 'age'
  ) then
    execute 'update public.members set is_minor = (age < 18) where age is not null';
  end if;
end $$;

alter table public.members drop column if exists age;
alter table public.members drop column if exists address;
alter table public.members drop column if exists email;
alter table public.members drop column if exists phone;

-- ── Calendar bookings: no member contact details ────────────────────────────
update public.calendar_bookings set attendee_emails = '[]'::jsonb
 where attendee_emails <> '[]'::jsonb;

update public.calendar_bookings
   set summary = nullif(btrim(regexp_replace(regexp_replace(summary,
         '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '', 'g'),
         '\+?1?[ .-]?\(?[0-9]{3}\)?[ .-]?[0-9]{3}[ .-]?[0-9]{4}', '', 'g')), ''),
       description = nullif(btrim(regexp_replace(regexp_replace(description,
         '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '', 'g'),
         '\+?1?[ .-]?\(?[0-9]{3}\)?[ .-]?[0-9]{3}[ .-]?[0-9]{4}', '', 'g')), '');

-- ── Tithing settlement: drop the declared status ────────────────────────────
alter table public.settlement_records drop column if exists declared_status;

-- ── In-app AI assistant removed: drop its provider configs and API keys ─────
-- The app's only AI integration is now the MCP server (Claude connects to it),
-- so no model provider or key is stored here any more.
alter table public.app_settings drop column if exists active_ai_config_id;
drop table if exists public.ai_configs;
alter table public.app_settings drop constraint if exists app_settings_ai_provider_check;
alter table public.app_settings
  drop column if exists ai_provider,
  drop column if exists ai_model,
  drop column if exists ai_base_url,
  drop column if exists ai_api_key;
