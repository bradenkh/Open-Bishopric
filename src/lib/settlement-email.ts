/**
 * The email that delivers a member's tithing-settlement booking link.
 *
 * The subject and body are a template: `{name}` and `{link}` are substituted per
 * recipient at send time (the link is that member's personal /book/<token> URL).
 * The bishopric can override the copy in Settings → Email; when they haven't,
 * these defaults are used. Kept framework-free so both the settings UI and the
 * settlement tab's compose dialog can import it.
 */

export interface SettlementEmailTemplate {
  subject: string;
  body: string;
}

export const DEFAULT_SETTLEMENT_EMAIL: SettlementEmailTemplate = {
  subject: "Your tithing settlement sign-up",
  body: [
    "Hi {name},",
    "",
    "It's time to schedule your household's tithing settlement with the bishopric. You can pick a time that works using the link below:",
    "",
    "{link}",
    "",
    "One time covers your whole household — just choose an open slot, no sign-in needed. If someone in your household has already booked, the link will show your scheduled time. Thank you!",
  ].join("\n"),
};

/** The placeholders callers may use in a template, for help text / previews. */
export const SETTLEMENT_EMAIL_PLACEHOLDERS = ["{name}", "{link}"] as const;

export interface SettlementEmailVars {
  /** The member's first name (or a preview stand-in). */
  name: string;
  /** The member's personal booking URL. */
  link: string;
}

/** Substitute {name}/{link} throughout a template's subject and body. */
export function renderSettlementEmail(
  template: SettlementEmailTemplate,
  vars: SettlementEmailVars,
): SettlementEmailTemplate {
  const fill = (s: string) =>
    s.replaceAll("{name}", vars.name).replaceAll("{link}", vars.link);
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
    "Hi {name},",
    "",
    "Your household's tithing settlement is scheduled for {date} at {time} with {interviewer}.",
    "",
    "One appointment covers your whole household. If you need to change the time, just reply to this email and we'll help you reschedule. Thank you!",
  ].join("\n"),
};

/** The placeholders a confirmation template may use, for help text / previews. */
export const SETTLEMENT_CONFIRMATION_PLACEHOLDERS = ["{name}", "{date}", "{time}", "{interviewer}"] as const;

export interface SettlementConfirmationVars {
  /** The member's first name (or a preview stand-in). */
  name: string;
  /** The booked date, already formatted for display (e.g. "Dec 3, 2026"). */
  date: string;
  /** The booked time, already formatted for display (e.g. "4:30 PM"). */
  time: string;
  /** Who the appointment is with. */
  interviewer: string;
}

/** Substitute {name}/{date}/{time}/{interviewer} throughout a template. */
export function renderSettlementConfirmation(
  template: SettlementEmailTemplate,
  vars: SettlementConfirmationVars,
): SettlementEmailTemplate {
  const fill = (s: string) =>
    s
      .replaceAll("{name}", vars.name)
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
