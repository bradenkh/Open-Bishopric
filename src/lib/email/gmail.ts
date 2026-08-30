import "server-only";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Gmail send + receive over a plain app password — no OAuth, no domain.
 *
 * The ward's Gmail address and a 16-character app password (Google Account →
 * Security → App passwords, 2FA required) live in the server-only `app_settings`
 * table alongside the AI key. Sending goes out via SMTP (smtp.gmail.com:465) and
 * receiving reads the same INBOX via IMAP (imap.gmail.com:993) — because Gmail
 * already accepts mail at that address, no MX records or verified domain are
 * needed. Everything here is server-only; the credentials never reach the browser.
 */

export interface GmailCreds {
  address: string;
  appPassword: string;
}

/** Read the configured Gmail credentials, or null if email isn't set up yet. */
export async function getGmailCreds(): Promise<GmailCreds | null> {
  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("gmail_address, gmail_app_password")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  const address = data?.gmail_address?.trim();
  const appPassword = data?.gmail_app_password?.trim();
  if (!address || !appPassword) return null;
  return { address, appPassword };
}

/** Whether email sending/receiving is configured. */
export async function isEmailConfigured(): Promise<boolean> {
  return (await getGmailCreds()) !== null;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain-text body. */
  body: string;
  /** The Message-ID being replied to, to thread the message (optional). */
  inReplyTo?: string;
}

export interface SendEmailResult {
  /** The RFC-2822 Message-ID Gmail assigned, stored to match future replies. */
  messageId: string;
}

/**
 * Send a plain-text email from the configured Gmail mailbox. Throws if email
 * isn't configured — callers that want a graceful fallback should check
 * `isEmailConfigured()` first.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const creds = await getGmailCreds();
  if (!creds) throw new Error("Email is not configured. Add a Gmail address and app password in Settings → Email.");

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: creds.address, pass: creds.appPassword },
  });

  const info = await transport.sendMail({
    from: creds.address,
    to: input.to,
    subject: input.subject,
    text: input.body,
    ...(input.inReplyTo
      ? { inReplyTo: input.inReplyTo, references: input.inReplyTo }
      : {}),
  });

  return { messageId: info.messageId };
}

/** Verify credentials by opening (and closing) an SMTP connection. */
export async function verifyEmailCreds(creds: GmailCreds): Promise<void> {
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: creds.address, pass: creds.appPassword },
  });
  await transport.verify();
}

export interface InboundMessage {
  from: string;
  subject: string;
  text: string;
  date?: string;
  /** The Message-ID this reply is answering, matched against stored records. */
  inReplyTo?: string;
  /** All referenced Message-IDs (the thread), a fallback when In-Reply-To is absent. */
  references: string[];
}

/**
 * Fetch recent inbound INBOX messages for reply matching. Reads (does not delete
 * or mark) messages received within `withinDays` (default 30). The caller matches
 * each message's `inReplyTo` / `references` against the Message-IDs it stored when
 * sending, so unrelated mail is simply ignored.
 */
export async function fetchNewReplies({ withinDays = 30 }: { withinDays?: number } = {}): Promise<InboundMessage[]> {
  const creds = await getGmailCreds();
  if (!creds) throw new Error("Email is not configured.");

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: creds.address, pass: creds.appPassword },
    logger: false,
  });

  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const messages: InboundMessage[] = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // `source: true` pulls the raw RFC-2822 message so mailparser can extract
      // the plain-text body and threading headers reliably.
      for await (const msg of client.fetch({ since }, { source: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const references = Array.isArray(parsed.references)
          ? parsed.references
          : parsed.references
          ? [parsed.references]
          : [];
        messages.push({
          from: parsed.from?.text ?? "",
          subject: parsed.subject ?? "",
          text: (parsed.text ?? "").trim(),
          date: parsed.date?.toISOString(),
          inReplyTo: parsed.inReplyTo,
          references,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return messages;
}
