/**
 * Rebuilds the database from scratch: applies every migration in
 * `supabase/migrations` (which are idempotent — they drop and recreate our
 * objects) and then `supabase/seed.sql`.
 *
 *   SUPABASE_DB_URL=postgresql://... node scripts/db-reset.mjs
 *   npm run db:reset
 *
 * This is a *manual*, local/dev convenience for getting a fresh schema + demo
 * data — it is intentionally NOT wired into `build` or any deploy, so deploys
 * never touch your data. ⚠️ It is destructive: it drops and recreates all app
 * tables and re-seeds. Only point SUPABASE_DB_URL at a database you're willing
 * to wipe.
 *
 * SUPABASE_DB_URL is the project's Postgres connection string (Settings →
 * Database → Connection string; use the Session pooler URI on IPv4-only hosts).
 *
 * Safe by omission: if SUPABASE_DB_URL is not set it logs a warning and exits 0.
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
