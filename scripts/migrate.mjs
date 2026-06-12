/**
 * Forward-only migration runner — tracks which migrations have been applied in a
 * `schema_migrations` table and runs only the pending ones, in order. Safe to
 * run on every deploy: already-applied migrations are skipped.
 *
 *   SUPABASE_DB_URL=postgresql://... node scripts/migrate.mjs
 *   npm run db:migrate
 *
 * Unlike `db:reset`, this never drops data. It applies each new file in
 * `supabase/migrations` exactly once (each inside a transaction) and records it.
 *
 * Safe by omission: if SUPABASE_DB_URL is not set it logs a notice and exits 0,
 * so builds/deploys without a database configured are a no-op. Wire it into a
 * deploy by setting SUPABASE_DB_URL in the (production) environment — see the
 * `prebuild` script in package.json.
 *
 * SUPABASE_DB_URL is the project's Postgres connection string (Settings →
 * Database → Connection string; use the Session pooler URI on IPv4-only hosts).
 *
 * ── Adopting an existing database ────────────────────────────────────────────
 * The two original schema migrations (0001, 0002) build the initial schema with
 * destructive `drop ... / create ...` statements and were applied via
 * `db:reset` before this runner existed. When the runner first sees a database
 * that already HAS the app schema but no `schema_migrations` table, it records
 * those baseline migrations as applied WITHOUT re-running them (which would wipe
 * data). A brand-new empty database instead runs every migration from scratch.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ROOT = process.cwd();
const connectionString = process.env.SUPABASE_DB_URL;

// Destructive initial-schema migrations that predate this runner. On an existing
// database these are assumed already applied and are baselined, never re-run.
const BASELINE = ["0001_initial_schema.sql", "0002_meeting_agendas.sql"];

if (!connectionString) {
  console.log(
    "[db:migrate] SUPABASE_DB_URL is not set — skipping migrations.\n" +
      "             Set it in your deploy environment to run migrations automatically.",
  );
  process.exit(0);
}

const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);

async function main() {
  const migrationsDir = join(ROOT, "supabase/migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new pg.Client({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("[db:migrate] Connected.");

  try {
    // Tracking table.
    await client.query(
      `create table if not exists public.schema_migrations (
         version    text primary key,
         applied_at timestamptz not null default now()
       )`,
    );

    // Adopt an existing (pre-runner) database: if nothing is recorded yet but
    // the schema already exists, mark the baseline migrations as applied so we
    // don't re-run their destructive teardown.
    const { rows: appliedRows } = await client.query(
      "select version from public.schema_migrations",
    );
    const applied = new Set(appliedRows.map((r) => r.version));

    if (applied.size === 0) {
      const { rows } = await client.query(
        "select to_regclass('public.callings') is not null as has_schema",
      );
      if (rows[0]?.has_schema) {
        for (const version of BASELINE) {
          await client.query(
            "insert into public.schema_migrations (version) values ($1) on conflict do nothing",
            [version],
          );
          applied.add(version);
          console.log(`[db:migrate] Baselined ${version} (already applied)`);
        }
      }
    }

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log("[db:migrate] Up to date — no pending migrations.");
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      console.log(`[db:migrate] Applying ${file}…`);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          "insert into public.schema_migrations (version) values ($1)",
          [file],
        );
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
      }
    }
    console.log(`[db:migrate] Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[db:migrate] Failed:", err);
  process.exit(1);
});
