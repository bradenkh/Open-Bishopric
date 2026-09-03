/**
 * Update household-related fields (age, is_head_of_household, is_household_parent)
 * in the members table from the parsed roster.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/update-household-fields.mjs [roster.local.json]
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
  console.error(`Could not read ${path}.`);
  process.exit(1);
}
if (!Array.isArray(members)) {
  console.error(`${path} is not an array.`);
  process.exit(1);
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  let updated = 0;
  for (let i = 0; i < members.length; i += 200) {
    const batch = members.slice(i, i + 200);
    for (const member of batch) {
      if (!member.id) continue;
      const { error } = await db
        .from("members")
        .update({
          is_household_parent: member.isHouseholdParent,
        })
        .eq("id", member.id);
      if (error) {
        console.error(`Failed to update ${member.id}:`, error.message);
        process.exit(1);
      }
      updated++;
    }
  }
  console.log(`Updated ${updated} members with household fields.`);
}

main();
