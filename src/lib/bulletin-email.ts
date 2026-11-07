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
 */

/** Just the message body; the subject is left to whoever sends it. */
export interface BulletinEmailTemplate {
  body: string;
}

export const DEFAULT_BULLETIN_EMAIL: BulletinEmailTemplate = {
  body: [
    "Hello {ward} Members,",
    "",
    "Please see the attached Ward Bulletin. A few reminders for the coming weeks:",
    "",
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
 * Announcements as email text, a blank line between each. A one-line
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
    .join("\n\n");
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
    // Collapse the gap an empty {announcements} would leave.
    body: fill(template.body).replace(/\n{3,}/g, "\n\n").trim(),
  };
}
