/**
 * The email that delivers a member's tithing-settlement booking link.
 *
 * The subject and body are a template: `{title}`, `{name}`, `{lastName}`, and
 * `{link}` are substituted per recipient at send time (the link is that member's
 * personal /book/<token> URL). Because parents are addressed individually, one
 * copy can read "Dear Brother Smith," and the other "Dear Sister Smith,".
 * The bishopric can override the copy in Settings → Email; when they haven't,
 * these defaults are used. Kept framework-free so both the settings UI and the
 * settlement tab's compose dialog can import it.
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
    "One time covers your whole household — just choose an open slot, no sign-in needed. If someone in your household has already booked, the link will show your scheduled time. Thank you!",
  ].join("\n"),
};

/** The placeholders callers may use in a template, for help text / previews. */
export const SETTLEMENT_EMAIL_PLACEHOLDERS = ["{title}", "{name}", "{lastName}", "{link}"] as const;

export interface SettlementEmailVars {
  /** The member's first name (or a preview stand-in). */
  name: string;
  /** The member's personal booking URL. */
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

// ── Booking confirmation ──────────────────────────────────────────────────────

/**
 * The confirmation sent after a member self-books their household's settlement
 * appointment through their link. Uses the same template shape as the invite,
 * with `{name}`, `{date}`, `{time}`, and `{interviewer}` substituted at send
 * time. The bishopric can override the copy in Settings → Email; when they
 * haven't, this default is used.
 */
export const DEFAULT_SETTLEMENT_CONFIRMATION: SettlementEmailTemplate = {
  subject: "Your tithing settlement is booked",
  body: [
    "Dear {title} {lastName},",
    "",
    "Your household's tithing settlement is scheduled for {date} at {time} with {interviewer}.",
    "",
    "One appointment covers your whole household. If you need to change the time, just reply to this email and we'll help you reschedule. Thank you!",
  ].join("\n"),
};

/** The placeholders a confirmation template may use, for help text / previews. */
export const SETTLEMENT_CONFIRMATION_PLACEHOLDERS = ["{title}", "{name}", "{lastName}", "{date}", "{time}", "{interviewer}"] as const;

export interface SettlementConfirmationVars {
  /** The member's first name (or a preview stand-in). */
  name: string;
  /** The booked date, already formatted for display (e.g. "Dec 3, 2026"). */
  date: string;
  /** The booked time, already formatted for display (e.g. "4:30 PM"). */
  time: string;
  /** Who the appointment is with. */
  interviewer: string;
  /** Courtesy title (Brother/Sister); "" or omitted when gender is unknown. */
  title?: string;
  /** The member's last name, for a "{title} {lastName}" salutation. */
  lastName?: string;
}

/** Substitute {title}/{name}/{lastName}/{date}/{time}/{interviewer} throughout a template. */
export function renderSettlementConfirmation(
  template: SettlementEmailTemplate,
  vars: SettlementConfirmationVars,
): SettlementEmailTemplate {
  const fill = (s: string) =>
    fillTitle(s, vars.title ?? "")
      .replaceAll("{name}", vars.name)
      .replaceAll("{lastName}", vars.lastName ?? "")
      .replaceAll("{date}", vars.date)
      .replaceAll("{time}", vars.time)
      .replaceAll("{interviewer}", vars.interviewer);
  return { subject: fill(template.subject), body: fill(template.body) };
}

/** A stored confirmation template with blank fields falls back to the defaults. */
export function withConfirmationDefaults(
  partial?: Partial<SettlementEmailTemplate> | null,
): SettlementEmailTemplate {
  return {
    subject: partial?.subject?.trim() ? partial.subject : DEFAULT_SETTLEMENT_CONFIRMATION.subject,
    body: partial?.body?.trim() ? partial.body : DEFAULT_SETTLEMENT_CONFIRMATION.body,
  };
}
