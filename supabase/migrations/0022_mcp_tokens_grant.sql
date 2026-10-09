-- ============================================================================
-- Open Bishopric — grant table privileges on mcp_tokens
--
-- Repair migration. 0021 created public.mcp_tokens without the table-level
-- GRANT every table added after 0001 needs (see 0007), so the service-role
-- client hit "permission denied" and Settings → Claude connector couldn't
-- create a token.
--
-- Granted to service_role only: this table holds token hashes and is never
-- read through the anon or authenticated clients. RLS (enabled in 0021, no
-- policies) stays as a second lock. Idempotent.
-- ============================================================================

grant all on public.mcp_tokens to service_role;
