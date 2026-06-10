/**
 * Rebuilds the database from scratch: applies every migration in
 * `supabase/migrations` (which are idempotent — they drop and recreate our
 * objects) and then `supabase/seed.sql`.
 *
 *   SUPABASE_DB_URL=postgresql://... node scripts/db-reset.mjs
 *   npm run db:reset
 *
 * Intended to run on each deploy so we can iterate on the backend without
 * migrating old data (there are no production users yet). Wire it into your
 * deploy/build command, e.g. on Vercel set the Build Command to:
 *
 *   npm run db:reset && npm run build
 *
 * and add SUPABASE_DB_URL (the project's *direct* Postgres connection string,
 * Settings → Database → Connection string → URI, port 5432) to the deploy env.
 *
 * Safe by design: if SUPABASE_DB_URL is not set it logs a warning and exits 0,
 * so ordinary local builds are never blocked or wiped.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ROOT = process.cwd();
const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.warn(
    "[db:reset] SUPABASE_DB_URL is not set — skipping database reset.\n" +
      "           Set it in your deploy environment to rebuild the DB on deploy.",
  );
  process.exit(0);
}

const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);

async function main() {
  const migrationsDir = join(ROOT, "supabase/migrations");
  const migrations = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const files = [
    ...migrations.map((f) => join("supabase/migrations", f)),
    "supabase/seed.sql",
  ];

  const client = new pg.Client({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("[db:reset] Connected. Rebuilding database…");

  try {
    for (const file of files) {
      const sql = readFileSync(join(ROOT, file), "utf8");
      console.log(`[db:reset] Applying ${file}`);
      await client.query(sql);
    }
    console.log("[db:reset] Database rebuilt successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[db:reset] Failed:", err);
  process.exit(1);
});
