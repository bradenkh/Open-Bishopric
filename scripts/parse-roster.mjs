/**
 * Parse an LCR "Create a Report" HTML export into the app's member shape, with
 * households resolved, so scripts/import-roster.mjs can load it into Supabase.
 *
 *   node scripts/parse-roster.mjs <export.html> [out.json]
 *
 * The report must include these columns: Preferred Name, Full Name, Age, Head of
 * House, Spouse of Head of House. Include a
 * Gender (or Sex) column too and the parents' settlement emails are addressed by
 * courtesy title (Brother/Sister); leave it out and members simply have no
 * gender. Columns are matched by header name, so their order doesn't matter.
 * Save the report page from LCR as HTML ("Web Page, Complete" / "Single File").
 *
 * Household model (see src/lib/household.ts):
 *   - householdId          = the head of house's stable LCR person uuid; every
 *                            member of a household shares it.
 *   - isHeadOfHousehold     = this member IS the head (Preferred Name === Head of
 *                            House).
 *   - isHouseholdParent     = head of house OR spouse of head (the two get the
 *                            settlement email).
 *   - isMinor               = under 18. Age is read only to set this flag; the
 *                            age itself is never written out.
 *
 * Phone numbers and emails in the export are ignored: the app keeps names only,
 * and members are contacted through LCR and Member Tools. The export and the
 * JSON this writes still hold names, so both are PII — keep them out of git (they match .gitignore's
 * *.local.json / roster export patterns). This script writes no PII to git; it
 * only reads the export you point it at and writes the JSON you name.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "node-html-parser";

const [, , inPath, outPath = "scripts/roster.local.json"] = process.argv;
if (!inPath) {
  console.error("Usage: node scripts/parse-roster.mjs <export.html> [out.json]");
  process.exit(1);
}

const root = parse(readFileSync(inPath, "utf8"));
const table = root.querySelector("table");
if (!table) {
  console.error("No <table> found in the export — is this the right HTML file?");
  process.exit(1);
}
const rows = table.querySelectorAll("tr");

/** A cell's value: its text with the cloned column-header label removed. */
function cellValue(td) {
  for (const label of td.querySelectorAll(".eden-table-card-view__cloned-column-header")) {
    label.remove();
  }
  return td.text.replace(/\s+/g, " ").trim();
}

// ── Locate columns by header name (order-independent) ────────────────────────
// The header row's cells label the columns; match on their normalized text so a
// Gender column (or any reordering) is handled without hard-coded positions.
const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
const headerCells = rows[0].querySelectorAll("th, td");
const headers = headerCells.map((c) => norm(c.text));
const colOf = (...names) => {
  for (const n of names) {
    const i = headers.indexOf(n);
    if (i !== -1) return i;
  }
  return -1;
};
const idx = {
  pref: colOf("preferred name"),
  full: colOf("full name"),
  age: colOf("age"),
  head: colOf("head of house"),
  spouse: colOf("spouse of head of house"),
  gender: colOf("gender", "sex"),
};
const missing = ["pref", "full", "head", "spouse"].filter((k) => idx[k] === -1);
if (missing.length) {
  console.error(`Export is missing required column(s): ${missing.join(", ")}. Header row: ${headers.join(" | ")}`);
  process.exit(1);
}

// LCR reports gender as "Male"/"Female" (or "M"/"F"); normalize to our enum.
function normGender(g) {
  const s = norm(g || "");
  if (s === "male" || s === "m") return "male";
  if (s === "female" || s === "f") return "female";
  return undefined;
}

// ── Extract one raw record per data row ──────────────────────────────────────
const at = (tds, i) => (i === -1 || !tds[i] ? "" : cellValue(tds[i]));
const raw = [];
for (const tr of rows.slice(1)) {
  const tds = tr.querySelectorAll("td");
  if (tds.length < headerCells.length) continue;
  const btn = tds[0].querySelector("button");
  raw.push({
    uuid: btn?.getAttribute("data-member-card-person-uuid") || null,
    pref: at(tds, idx.pref),
    full: at(tds, idx.full),
    age: at(tds, idx.age),
    head: at(tds, idx.head),
    spouse: at(tds, idx.spouse),
    gender: at(tds, idx.gender),
  });
}

// ── Resolve households ───────────────────────────────────────────────────────
// Head of House is the head's PREFERRED name; Spouse of Head is their FULL name.
const uuidByPref = new Map(raw.map((r) => [r.pref, r.uuid]));
const byFull = new Map();
for (const r of raw) if (!byFull.has(r.full)) byFull.set(r.full, r);

// The parents (head + spouse) of each household, by uuid.
const parentUuids = new Set();
for (const r of raw) {
  if (r.pref !== r.head) continue; // head rows only
  if (r.uuid) parentUuids.add(r.uuid);
  const spouse = r.spouse && byFull.get(r.spouse);
  if (spouse?.uuid) parentUuids.add(spouse.uuid);
}

function splitName(full) {
  // "Last, First Middle" → { firstName, lastName }
  const comma = full.indexOf(",");
  if (comma !== -1) {
    const last = full.slice(0, comma).trim();
    const first = full.slice(comma + 1).trim().split(/\s+/)[0] || "";
    return { firstName: first, lastName: last };
  }
  const parts = full.split(/\s+/);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

const now = new Date().toISOString();
const members = raw.map((r) => {
  const { firstName, lastName } = splitName(r.full);
  // Keep only whether the member is a minor, never their age.
  const isMinor = /^\d+$/.test(r.age) ? Number(r.age) < 18 : undefined;
  return {
    id: r.uuid,
    firstName,
    lastName,
    householdId: uuidByPref.get(r.head) || r.uuid,
    isHeadOfHousehold: r.pref === r.head,
    isHouseholdParent: parentUuids.has(r.uuid),
    isMinor,
    gender: normGender(r.gender),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
});

// ── Report + write ───────────────────────────────────────────────────────────
const withId = members.filter((m) => m.id);
if (withId.length !== members.length) {
  console.warn(`Warning: ${members.length - withId.length} rows had no person uuid and were dropped.`);
}
const households = new Set(withId.map((m) => m.householdId));
const parents = withId.filter((m) => m.isHouseholdParent);

writeFileSync(outPath, JSON.stringify(withId, null, 1));
console.log(`Parsed ${withId.length} members in ${households.size} households.`);
console.log(`  parents: ${parents.length}, minors: ${withId.filter((m) => m.isMinor).length}`);
console.log(`  with gender: ${withId.filter((m) => m.gender).length}${idx.gender === -1 ? " (no Gender/Sex column in the export)" : ""}`);
console.log(`Wrote ${outPath}`);
