/**
 * Load a parsed roster (scripts/roster.local.json, produced by parse-roster.mjs)
 * into the Supabase `members` table, REPLACING whatever is there.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  \
 *     node scripts/import-roster.mjs [roster.local.json]
 *
 * "Replace" means: every existing member row is deleted, then the parsed roster
 * is inserted. Other tables reference members only by loose text id (no foreign
 * keys), so this does not cascade — any demo settlement/calling rows that
 * pointed at old members simply become orphaned demo data.
 *
 * Uses the service-role key (bypasses RLS) — run it locally against your own
 * project, never expose the key. The roster file is real PII and is gitignored.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}

const path = process.argv[2] || "scripts/roster.local.json";
let members;
try {
  members = JSON.parse(readFileSync(path, "utf8"));
} catch {
  console.error(`Could not read ${path}. Run: node scripts/parse-roster.mjs <export.html> ${path}`);
  process.exit(1);
}
if (!Array.isArray(members) || members.length === 0) {
  console.error(`${path} has no members.`);
  process.exit(1);
}

const camelToSnake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toRow = (m) => {
  const row = {};
  for (const [k, v] of Object.entries(m)) if (v !== undefined) row[camelToSnake(k)] = v;
  return row;
};

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const rows = members.map(toRow);
  const bad = rows.filter((r) => !r.id || !r.first_name || !r.last_name);
  if (bad.length) {
    console.error(`${bad.length} rows are missing id/first_name/last_name — aborting.`);
    process.exit(1);
  }

  // Replace: clear the table, then insert the parsed roster.
  const { error: delErr } = await db.from("members").delete().neq("id", "");
  if (delErr) {
    console.error("Failed to clear members:", delErr.message);
    process.exit(1);
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await db.from("members").insert(batch);
    if (error) {
      console.error(`Insert failed at batch starting ${i}:`, error.message);
      process.exit(1);
    }
    inserted += batch.length;
  }
  console.log(`Replaced members with ${inserted} rows from ${path}.`);
}

main();
