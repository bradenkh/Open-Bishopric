import type { Announcement } from "@/types";

/**
 * The weekly email that goes out to the ward with the bulletin PDF attached.
 *
 * Like the task reminder, it's a template the bishopric can edit in
 * Settings → Email. `{ward}` is the ward name, `{date}` the Sunday ("November
 * 8th, 2026") and `{announcements}` the bulletin's announcements as plain text,
 * one block per announcement. When the template hasn't been customized these
 * defaults are used. Framework-free so the settings UI and the MCP tool can
 * both import it.
 *
 * The ward's email tool (LCR) turns every line into its own paragraph, with a
 * paragraph's worth of space after it, so the text uses single line breaks
 * only: a blank line would come through as a double gap.
 */

/** Just the message body; the subject is left to whoever sends it. */
export interface BulletinEmailTemplate {
  body: string;
}

export const DEFAULT_BULLETIN_EMAIL: BulletinEmailTemplate = {
  body: [
    "Hello {ward} Members,",
    "Please see the attached Ward Bulletin. A few reminders for the coming weeks:",
    "{announcements}",
  ].join("\n"),
};

/** The placeholders the bulletin email may use, for help text. */
export const BULLETIN_EMAIL_PLACEHOLDERS = ["{ward}", "{date}", "{announcements}"] as const;

/** Drop the bulletin's **bold** / *italic* markup for a plain-text email. */
function plain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").trim();
}

/**
 * Announcements as email text, one after another with no blank lines. A one-line
 * announcement reads "Title: description"; a longer one (a schedule, a list of
 * times) puts its title on a line of its own above the description's lines.
 */
export function announcementsAsText(list: Pick<Announcement, "title" | "description">[]): string {
  return list
    .map((a) => {
      const title = plain(a.title ?? "");
      const lines = plain(a.description ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      if (!title) return lines.join("\n");
      if (lines.length === 0) return title;
      if (lines.length === 1) return `${title}: ${lines[0]}`;
      return [title, ...lines].join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

/** A blank stored template falls back to the default. */
export function withBulletinEmailDefaults(
  partial?: Partial<BulletinEmailTemplate> | null,
): BulletinEmailTemplate {
  return {
    body: partial?.body?.trim() ? partial.body : DEFAULT_BULLETIN_EMAIL.body,
  };
}

export interface BulletinEmailVars {
  ward: string;
  date: string;
  announcements: Pick<Announcement, "title" | "description">[];
}

/** Fill in a bulletin email template for one Sunday. */
export function renderBulletinEmail(
  template: BulletinEmailTemplate,
  vars: BulletinEmailVars,
): BulletinEmailTemplate {
  const map: Record<string, string> = {
    "{ward}": vars.ward,
    "{date}": vars.date,
    "{announcements}": announcementsAsText(vars.announcements),
  };
  const fill = (s: string) => s.replace(/\{(ward|date|announcements)\}/g, (m) => map[m] ?? "");
  return {
    // A line holding only {announcements} is dropped on a week with none.
    body: template.body
      .split("\n")
      .filter((line) => line.trim() !== "{announcements}" || map["{announcements}"] !== "")
      .map(fill)
      .join("\n")
      .trim(),
  };
}
