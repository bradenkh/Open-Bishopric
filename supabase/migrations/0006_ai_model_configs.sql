-- ============================================================================
-- Open Bishopric — saved AI model configurations + Cerebras provider
--
-- Adds:
--   * ai_configs — a set of named, reusable AI provider configurations (provider,
--                  model, base URL, API key). The bishopric can save several and
--                  switch the assistant between them without re-typing keys.
--   * app_settings.active_ai_config_id — points at the ai_configs row currently
--                  in use. NULL falls back to the legacy single-config columns
--                  (ai_provider/ai_model/ai_base_url/ai_api_key) still on
--                  app_settings, and then to the AI_* environment variables.
--   * 'cerebras' is now an allowed provider (an OpenAI-compatible gateway at
--                  https://api.cerebras.ai/v1).
--
-- Like app_settings, ai_configs is server-only: RLS is enabled with NO policy, so
-- only the service-role client (the AI settings Route Handlers and the agent) can
-- read or write it — keeping every stored API key off the browser.
--
-- Idempotent (never re-run on deploy — migration runner baselines earlier files),
-- mirroring the conventions in prior migrations.
-- ============================================================================

-- ── Allow the new provider on the legacy app_settings column ─────────────────
alter table public.app_settings drop constraint if exists app_settings_ai_provider_check;
alter table public.app_settings add constraint app_settings_ai_provider_check
  check (ai_provider in ('openai-compat', 'deepseek', 'cerebras'));

-- ── Saved model configurations ───────────────────────────────────────────────
create table if not exists public.ai_configs (
  id          text primary key,
  name        text not null,
  provider    text not null default 'openai-compat'
                check (provider in ('openai-compat', 'deepseek', 'cerebras')),
  model       text not null,
  base_url    text not null default '',
  api_key     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists ai_configs_updated_at on public.ai_configs;
create trigger ai_configs_updated_at
  before update on public.ai_configs
  for each row execute function public.set_updated_at();

-- Server-only, exactly like app_settings: RLS on, no policy → only the
-- service-role client can touch it, so saved API keys never reach a client.
alter table public.ai_configs enable row level security;

-- Table-level privileges. 0001's blanket `grant all on all tables` only covered
-- tables that existed then, so every later table must grant itself (see 0002).
-- RLS (enabled above, with no policy) still blocks anon/authenticated from every
-- row; only the service role, which bypasses RLS, can actually read or write.
grant all on public.ai_configs to anon, authenticated, service_role;

-- ── Pointer to the active configuration ──────────────────────────────────────
alter table public.app_settings
  add column if not exists active_ai_config_id text
    references public.ai_configs(id) on delete set null;

-- ── Adopt any existing single configuration as the first saved config ────────
-- If the app already had a working config (an API key set) and nothing has been
-- migrated yet, capture it as a named config and make it active so the assistant
-- keeps working unchanged after this migration.
do $$
declare
  s public.app_settings%rowtype;
  new_id text;
begin
  select * into s from public.app_settings where id = 'default';
  if found
     and s.active_ai_config_id is null
     and s.ai_api_key is not null
     and s.ai_api_key <> ''
     and not exists (select 1 from public.ai_configs)
  then
    new_id := gen_random_uuid()::text;
    insert into public.ai_configs (id, name, provider, model, base_url, api_key)
      values (
        new_id,
        'Current configuration',
        s.ai_provider,
        s.ai_model,
        coalesce(s.ai_base_url, ''),
        s.ai_api_key
      );
    update public.app_settings set active_ai_config_id = new_id where id = 'default';
  end if;
end $$;
