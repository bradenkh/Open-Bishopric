-- ============================================================================
-- Open Bishopric — track when a settlement booking link was emailed
--
-- Generating a link (status link_created) doesn't mean it was ever delivered —
-- historically the bishopric copied the link out by hand. Now they can email a
-- member their link from the Tithing Settlement tab; record that send so the UI
-- can show "Emailed 2d ago" and so a re-send is a deliberate choice.
--
--   * link_sent_at         — last time the link was emailed (null = never).
--   * link_email_message_id — Gmail Message-ID of that send, for reference.
--
-- Stamped by the client after a successful POST /api/email/send.
--
-- Forward-only + idempotent, mirroring prior migrations. Never destructive.
-- ============================================================================

alter table public.settlement_records
  add column if not exists link_sent_at          timestamptz,
  add column if not exists link_email_message_id text;
