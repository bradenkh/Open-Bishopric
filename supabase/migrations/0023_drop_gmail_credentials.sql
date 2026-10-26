-- ============================================================================
-- Open Bishopric — drop the stored Gmail connection
--
-- The app no longer sends or reads email itself; email now goes through the
-- client's own email connector (e.g. Claude's Gmail connector). Removes the
-- Gmail address and app password added in 0006 so the credential isn't left
-- sitting in app_settings.
--
-- Kept: the email template columns (0011/0013/0018), which still prefill the
-- mail-app drafts opened from the Tasks and Tithing Settlement pages, and the
-- message-id / reminder_sent_at columns, which only hold history. Idempotent.
-- ============================================================================

alter table public.app_settings drop column if exists gmail_address;
alter table public.app_settings drop column if exists gmail_app_password;
