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
--   * DeepSeek is no longer an allowed AI provider. Saved DeepSeek configs are
--     deleted (their API keys with them), and a legacy DeepSeek setting on
--     app_settings is reset so the assistant reports "not set up" until a new
--     provider is chosen.
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

-- ── AI providers: remove DeepSeek ───────────────────────────────────────────
-- Deleting the config clears app_settings.active_ai_config_id (on delete set null).
delete from public.ai_configs where provider = 'deepseek';

update public.app_settings
   set ai_provider = 'openai-compat',
       ai_model    = 'openai/gpt-4o-mini',
       ai_base_url = 'https://openrouter.ai/api/v1',
       ai_api_key  = null
 where ai_provider = 'deepseek';

alter table public.ai_configs drop constraint if exists ai_configs_provider_check;
alter table public.ai_configs add constraint ai_configs_provider_check
  check (provider in ('openai-compat', 'cerebras'));

alter table public.app_settings drop constraint if exists app_settings_ai_provider_check;
alter table public.app_settings add constraint app_settings_ai_provider_check
  check (ai_provider in ('openai-compat', 'cerebras'));
