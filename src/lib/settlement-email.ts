/**
 * The tithing-settlement invitation, copied from the Tithing Settlement tab and
 * sent through LCR or Member Tools (the app itself sends no email).
 *
 * The subject and body are a template: `{title}`, `{name}`, `{lastName}`, and
 * `{link}` are substituted when the message is copied (the link is the ward's
 * Google Calendar booking page for tithing settlement). The bishopric can
 * override the copy in Settings → Message templates; when they haven't, these
 * defaults are used. Kept framework-free so both the settings UI and the
 * settlement tab can import it.
 */

export interface SettlementEmailTemplate {
  subject: string;
  body: string;
}

/**
 * The courtesy title used to address a member — "Brother" or "Sister" — from
 * their recorded gender. Returns "" when gender is unknown, so a
 * "{title} {lastName}" salutation degrades cleanly to just the last name.
 */
export function settlementTitle(gender?: string | null): string {
  if (gender === "male") return "Brother";
  if (gender === "female") return "Sister";
  return "";
}

export const DEFAULT_SETTLEMENT_EMAIL: SettlementEmailTemplate = {
  subject: "Your tithing settlement sign-up",
  body: [
    "Dear {title} {lastName},",
    "",
    "It's time to schedule your household's tithing settlement with the bishopric. You can pick a time that works using the link below:",
    "",
    "{link}",
    "",
    "One appointment covers your whole household — just choose an open time on the booking page. Thank you!",
  ].join("\n"),
};

/** The placeholders callers may use in a template, for help text / previews. */
export const SETTLEMENT_EMAIL_PLACEHOLDERS = ["{title}", "{name}", "{lastName}", "{link}"] as const;

export interface SettlementEmailVars {
  /** The member's first name (or a preview stand-in). */
  name: string;
  /** The ward's Google Calendar settlement booking-page URL. */
  link: string;
  /** Courtesy title (Brother/Sister); "" or omitted when gender is unknown. */
  title?: string;
  /** The member's last name, for a "{title} {lastName}" salutation. */
  lastName?: string;
}

/**
 * Replace a `{title}` placeholder, dropping the trailing space too when the
 * title is empty (unknown gender) so "Dear {title} {lastName}," collapses to
 * "Dear {lastName}," rather than leaving a double space. The bare "{title}"
 * form is handled after, for templates that don't follow it with a space.
 */
function fillTitle(s: string, title: string): string {
  return s.replaceAll("{title} ", title ? `${title} ` : "").replaceAll("{title}", title);
}

/** Substitute {title}/{name}/{lastName}/{link} throughout a template. */
export function renderSettlementEmail(
  template: SettlementEmailTemplate,
  vars: SettlementEmailVars,
): SettlementEmailTemplate {
  const fill = (s: string) =>
    fillTitle(s, vars.title ?? "")
      .replaceAll("{name}", vars.name)
      .replaceAll("{lastName}", vars.lastName ?? "")
      .replaceAll("{link}", vars.link);
  return { subject: fill(template.subject), body: fill(template.body) };
}

/** A stored template with blank fields falls back to the defaults, field by field. */
export function withDefaults(partial?: Partial<SettlementEmailTemplate> | null): SettlementEmailTemplate {
  return {
    subject: partial?.subject?.trim() ? partial.subject : DEFAULT_SETTLEMENT_EMAIL.subject,
    body: partial?.body?.trim() ? partial.body : DEFAULT_SETTLEMENT_EMAIL.body,
  };
}
