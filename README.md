# Open Bishopric

A private, invite-only tool for an LDS ward bishopric — callings pipeline,
interview scheduling, meeting agendas & bulletins, tasks, and an AI assistant.
Built with Next.js 16 (App Router) and Supabase (Postgres + Auth).

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

See `.env.example`. The Supabase values come from your project's
**Settings → API**:

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key | Safe to expose — protected by RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **Server-only.** Bypasses RLS; used by the AI agent. |
| `SUPABASE_DB_URL` | Settings → Database → Connection string → **Session pooler** URI | Used only by the manual `db:reset` — not by builds/deploys. Use the Session pooler (IPv4) on IPv4-only hosts. |
| `AI_*` | — | AI assistant provider config. |

## Backend & data layer

- **Supabase clients** live in `src/lib/supabase/` — `client.ts` (browser),
  `server.ts` (Server Components / Route Handlers), `admin.ts` (service-role,
  server-only), and `proxy.ts` (session refresh used by `src/proxy.ts`).
- **Data access** is in `src/lib/db/` — typed repositories that map snake_case
  rows ↔ the camelCase types in `src/types`. The browser uses these through the
  `DataProvider` (`src/contexts/DataContext.tsx`), the single client-side source
  of truth with optimistic CRUD; the AI agent uses them server-side.
- **Auth** is in `src/contexts/AuthContext.tsx` (Supabase email/password) with
  route gating in `src/proxy.ts`.

### Database schema

The schema, RLS policies, and seed data are in `supabase/`:

- `supabase/migrations/0001_initial_schema.sql` — all tables, RLS, and the
  `profiles` trigger. It is **idempotent**: it drops and recreates our objects,
  so it can be applied repeatedly to get a fresh schema.
- `supabase/seed.sql` — demo ward data. Generated from `src/lib/mock-data.ts`
  via `npm run db:seed:gen`; edit the mock data and regenerate to change it.

### Auth model (invite-only)

There is no public sign-up. Provision bishopric members from the Supabase
dashboard (**Authentication → Users → Invite**, or Add user). A matching
`profiles` row — with their role — is created automatically by the
`handle_new_user` trigger. You can set `display_name` and `role`
(`bishop` | `counselor` | `clerk` | `exec_secretary`) via the invite's user
metadata; otherwise role defaults to `counselor`.

## Database setup & schema changes

Migrations are tracked and applied automatically. A `schema_migrations` table
records which files in `supabase/migrations` have run, and the runner
(`scripts/migrate.mjs`) applies only the pending ones, each in a transaction —
it never drops data. It runs as the `prebuild` step, so **every deploy applies
any new migrations before the app builds**, as long as `SUPABASE_DB_URL` is set
in that environment. Without `SUPABASE_DB_URL` it is a no-op, so local builds and
previews are unaffected.

```bash
npm run db:migrate   # apply pending migrations (what prebuild runs)
```

**First-time setup** (or any disposable dev database): point `SUPABASE_DB_URL`
at the database and run `npm run db:reset`. This applies the migrations and the
demo seed. ⚠️ It is destructive — it drops and recreates all app tables — so
only run it against a database you're willing to wipe, **never** production once
it holds real data.

**Evolving the schema:** add a new, forward-only migration — give it the next
number (`000N_*.sql`) and use idempotent, non-destructive statements (`alter
table ... add column if not exists`, `create table if not exists`, swap a
constraint with `drop constraint if exists` then `add constraint`, etc.). It
will be applied on the next deploy. The two original migrations (`0001`, `0002`)
contain destructive teardown for the dev `db:reset` flow; the runner **baselines**
them on an already-provisioned database (records them as applied without
re-running) so production data is never wiped.

### Deploying on Vercel

1. Import the repo into Vercel (Framework preset: Next.js — no Build Command
   override needed; the default `npm run build` runs migrations then builds).
2. **Settings → Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the `AI_*`
   vars → **All Environments**.
3. Add `SUPABASE_DB_URL` (Session pooler URI) → **Production only**. The
   `prebuild` step uses it to apply pending migrations on each deploy. ⚠️ Keep it
   off Preview/Development so feature-branch deploys don't migrate your
   production database — without the var the migration step is a harmless no-op.
4. Before your first deploy, run `npm run db:reset` once against your Supabase
   database (see above) to create the schema and seed demo data. After that,
   schema changes ride along automatically on each production deploy.
5. Deploy, then invite yourself under **Authentication → Users** in Supabase and
   sign in.
