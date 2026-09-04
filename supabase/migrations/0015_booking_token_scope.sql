-- ============================================================================
-- Open Bishopric — individual (single-member) settlement booking links
--
-- Tithing settlement is normally booked one appointment per household, but a
-- household member sometimes needs their own separate slot. An "individual"
-- booking link carries a single household member and marks only that member
-- scheduled when booked, alongside the household's shared link.
--
--   * booking_tokens.scope — 'household' | 'individual'. Nullable: links minted
--     before this existed have none and are treated as household links.
--
-- Forward-only + idempotent (add column if not exists), mirroring prior
-- migrations. Never destructive.
-- ============================================================================

alter table public.booking_tokens
  add column if not exists scope text check (scope in ('household', 'individual'));
