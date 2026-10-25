import type { Calling, WardBusiness, WardBusinessEntry } from "@/types";

/**
 * The ward-business categories read during sacrament meeting, in the order they
 * appear on the document. Mirrors the fixed-section pattern of AGENDA_SECTIONS.
 */
export const WARD_BUSINESS_CATEGORIES = [
  "Stake Visitors",
  "Announcements",
  "Release",
  "Sustainings",
  "Callings to Announce",
  "New Members",
  "8-Year Olds",
  "Convert Confirmations",
  "Ordinations",
  "Baby Blessings",
  "Other",
  "Stake Business",
  "Setting Aparts",
] as const;

export type WardBusinessCategory = (typeof WARD_BUSINESS_CATEGORIES)[number];

// ── Callings-derived lines ────────────────────────────────────────────────────
// Three categories are seeded from the calling pipeline so the bishopric doesn't
// retype what the app already tracks. Each returns plain "{name} — {position}"
// lines; they seed the editor on first open and back the "Pull from callings"
// action thereafter.

/** Holders currently marked for release (needs_release stage). */
export function deriveReleases(callings: Calling[]): string[] {
  return callings
    .filter((c) => c.stage === "needs_release" && c.releasedName)
    .map((c) => `${c.releasedName} — ${c.position}`);
}

/** Callings accepted and slated to be sustained in sacrament meeting. */
export function deriveSustainings(callings: Calling[]): string[] {
  return callings
    .filter((c) => c.stage === "sustaining" && c.sustainedIn === "sacrament_meeting" && c.memberName)
    .map((c) => `${c.memberName} — ${c.position}`);
}

/** Sustained callings awaiting / ready for setting apart. */
export function deriveSettingAparts(callings: Calling[]): string[] {
  return callings
    .filter((c) => c.stage === "set_apart" && c.memberName)
    .map((c) => `${c.memberName} — ${c.position}`);
}

/** Categories auto-seeded from the callings pipeline, mapped to their derive fn. */
export const AUTO_SEEDED_CATEGORIES: Partial<Record<WardBusinessCategory, (callings: Calling[]) => string[]>> = {
  Release: deriveReleases,
  Sustainings: deriveSustainings,
  "Setting Aparts": deriveSettingAparts,
};

/** Wrap a line of text as a business entry. Portable id so this runs in the
 *  browser editor and in the server-side agent tools alike. */
export function makeEntry(text: string): WardBusinessEntry {
  return { id: crypto.randomUUID(), text };
}

/**
 * Build a full ward-business object with every category present and the three
 * auto-seeded categories pre-filled from callings. Used to initialize the editor
 * (and the agent's view) the first time a meeting's business is opened.
 */
export function seedBusiness(callings: Calling[]): WardBusiness {
  const business: WardBusiness = {};
  for (const category of WARD_BUSINESS_CATEGORIES) {
    const derive = AUTO_SEEDED_CATEGORIES[category];
    business[category] = derive ? derive(callings).map(makeEntry) : [];
  }
  return business;
}
