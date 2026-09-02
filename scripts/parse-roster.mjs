/**
 * Parse an LCR "Create a Report" HTML export into the app's member shape, with
 * households resolved, so scripts/import-roster.mjs can load it into Supabase.
 *
 *   node scripts/parse-roster.mjs <export.html> [out.json]
 *
 * The report must include these columns: Preferred Name, Full Name, Age, Head of
 * House, Spouse of Head of House, Individual Phone, Individual E-mail. Save the
 * report page from LCR as HTML ("Web Page, Complete" / "Single File").
 *
 * Household model (see src/lib/household.ts):
 *   - householdId          = the head of house's stable LCR person uuid; every
 *                            member of a household shares it.
 *   - isHeadOfHousehold     = this member IS the head (Preferred Name === Head of
 *                            House).
 *   - isHouseholdParent     = head of house OR spouse of head (the two get the
 *                            settlement email).
 *
 * The export carries real names, emails, and phone numbers, so BOTH the HTML and
 * the JSON this writes are PII — keep them out of git (they match .gitignore's
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

// ── Extract one raw record per data row ──────────────────────────────────────
const raw = [];
for (const tr of rows.slice(1)) {
  const tds = tr.querySelectorAll("td");
  if (tds.length < 7) continue;
  const btn = tds[0].querySelector("button");
  raw.push({
    uuid: btn?.getAttribute("data-member-card-person-uuid") || null,
    pref: cellValue(tds[0]),
    full: cellValue(tds[1]),
    age: cellValue(tds[2]),
    head: cellValue(tds[3]),
    spouse: cellValue(tds[4]),
    phone: cellValue(tds[5]),
    email: cellValue(tds[6]),
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
  const ageNum = /^\d+$/.test(r.age) ? Number(r.age) : undefined;
  return {
    id: r.uuid,
    firstName,
    lastName,
    email: r.email || undefined,
    phone: r.phone || undefined,
    householdId: uuidByPref.get(r.head) || r.uuid,
    isHeadOfHousehold: r.pref === r.head,
    isHouseholdParent: parentUuids.has(r.uuid),
    age: ageNum,
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
const parentsWithEmail = parents.filter((m) => m.email);

writeFileSync(outPath, JSON.stringify(withId, null, 1));
console.log(`Parsed ${withId.length} members in ${households.size} households.`);
console.log(`  parents: ${parents.length} (${parentsWithEmail.length} with an email)`);
console.log(`  with email: ${withId.filter((m) => m.email).length}, with phone: ${withId.filter((m) => m.phone).length}`);
console.log(`Wrote ${outPath}`);
