-- ============================================================================
-- Open Bishopric — household-scoped tithing-settlement booking links
--
-- Tithing settlement is booked one appointment per HOUSEHOLD, not per person.
-- Everyone in a household receives the same booking link; whoever opens it
-- books the household's single slot, and anyone else who opens it afterward
-- sees that the household is already scheduled.
--
-- Households are grouped by members.household_id (shared across a household).
-- The head of household is the link/appointment's representative:
--
--   * members.is_head_of_household — marks the head of each household. Data is
--     supplied on the roster; when absent the app falls back to a deterministic
--     head so a household of one keeps working exactly as before.
--   * members.is_household_parent — marks the household's parents (head of house
--     + spouse of head). Settlement emails go to the parents, not to children.
--   * members.age — the member's age from the roster, kept for upcoming
--     age-aware features (e.g. youth vs adult handling).
--
-- Booking tokens gain the household context they need so the public booking API
-- (service role) can mark every household member scheduled without reading the
-- members table:
--
--   * booking_tokens.household_id      — the household key the link covers.
--   * booking_tokens.household_members — jsonb array of { id, name } for the
--     members the one appointment covers.
--
-- Forward-only + idempotent (add column if not exists), mirroring prior
-- migrations. Never destructive.
-- ============================================================================

-- ── Household roster fields ──────────────────────────────────────────────────
alter table public.members
  add column if not exists is_head_of_household boolean not null default false,
  add column if not exists is_household_parent  boolean not null default false,
  add column if not exists age                  integer;

-- ── Household context on the booking link ────────────────────────────────────
alter table public.booking_tokens
  add column if not exists household_id      text,
  add column if not exists household_members jsonb;

create index if not exists booking_tokens_household_idx
  on public.booking_tokens (household_id);
