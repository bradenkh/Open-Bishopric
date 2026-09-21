-- ============================================================================
-- Open Bishopric — drop meeting_agendas.todos
--
-- To-dos captured during a meeting were originally stored as a jsonb array on
-- the agenda (see 0019). They are now regular rows in the `tasks` table, linked
-- to the agenda via context.agendaId, so they also appear on the Tasks screen.
-- The embedded column is no longer used.
--
-- Idempotent, mirroring the conventions in 0001_initial_schema.sql.
-- ============================================================================

alter table public.meeting_agendas drop column if exists todos;
