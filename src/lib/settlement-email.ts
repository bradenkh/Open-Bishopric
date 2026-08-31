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
    "It's time to schedule your tithing settlement with the bishopric. You can pick a time that works for you using your personal link below:",
    "",
    "{link}",
    "",
    "Just choose an open slot — no sign-in needed. Thank you!",
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
