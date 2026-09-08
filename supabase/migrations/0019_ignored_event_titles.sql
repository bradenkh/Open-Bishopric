-- ============================================================================
-- Open Bishopric — standing "always ignore" rules for calendar event titles
--
-- Dismissing a booking (migration 0018) hides one event. For recurring non-
-- interview events (a weekly "Ward Council", say), the bishopric can instead
-- ignore every event of that name: the ingest skips any event whose title
-- matches, so it never re-enters the queue.
--
--   * app_settings.ignored_event_titles — a JSON array of normalized event
--        titles to skip at ingest (matched case-insensitively, whitespace-
--        collapsed).
--
-- Forward-only + idempotent. Never destructive.
-- ============================================================================

alter table public.app_settings
  add column if not exists ignored_event_titles jsonb not null default '[]'::jsonb;
