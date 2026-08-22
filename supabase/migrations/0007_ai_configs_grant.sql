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
-- 0006 has been corrected to include this grant for fresh installs; this separate
-- migration re-applies it to databases where 0006 already ran without it. The
-- grant is idempotent, so running it twice is harmless.
--
-- RLS (enabled in 0006, with no policy) still blocks anon/authenticated from
-- every row; only the service role, which bypasses RLS, can read or write here.
-- ============================================================================

grant all on public.ai_configs to anon, authenticated, service_role;
