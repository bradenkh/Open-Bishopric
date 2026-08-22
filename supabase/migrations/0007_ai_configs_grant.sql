-- ============================================================================
-- Open Bishopric — grant table privileges on ai_configs
--
-- Repair migration. 0006 created public.ai_configs but omitted the table-level
-- GRANT that every table added after 0001 needs (0001's blanket
-- `grant all on all tables in schema public` only covered the tables that
-- existed then — see the per-table grant in 0002). Without it the service-role
-- client — the only client meant to touch this server-only table — hits
-- "permission denied for table ai_configs", so the AI settings screen fails to
-- load.
--
-- 0006 is left as-is (forward-only: never edit an applied migration); this
-- follow-on migration adds the missing grant for every database, whether or not
-- 0006 has already run. The grant is idempotent, so re-running it is harmless.
--
-- RLS (enabled in 0006, with no policy) still blocks anon/authenticated from
-- every row; only the service role, which bypasses RLS, can read or write here.
-- ============================================================================

grant all on public.ai_configs to anon, authenticated, service_role;
