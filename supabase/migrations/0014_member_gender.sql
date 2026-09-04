-- ============================================================================
-- Open Bishopric — member gender (courtesy title in settlement emails)
--
-- Tithing-settlement emails go to a household's two parents individually, so
-- each copy can be addressed by courtesy title: "Dear Brother Smith," to one
-- and "Dear Sister Smith," to the other. That requires knowing each member's
-- gender, which the roster import now captures.
--
--   * members.gender — 'male' | 'female'. Nullable: members imported before
--     gender was captured have none, and are addressed without a title (the
--     "{title} {lastName}" salutation collapses to just the last name).
--
-- Forward-only + idempotent (add column if not exists), mirroring prior
-- migrations. Never destructive.
-- ============================================================================

alter table public.members
  add column if not exists gender text check (gender in ('male', 'female'));
