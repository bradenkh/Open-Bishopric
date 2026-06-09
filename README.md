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
| `SUPABASE_DB_URL` | Settings → Database → Connection string (URI, port 5432) | Used only by `db:reset` (deploy/CI). |
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

## Rebuilding the database on deploy

While we iterate on the backend (and have no production users yet), each deploy
**rebuilds the database from scratch** rather than migrating existing data:

```bash
SUPABASE_DB_URL=postgresql://... npm run db:reset
```

This applies every migration (which tears down + recreates) and then the seed.
It is safe to run anywhere: if `SUPABASE_DB_URL` is unset it logs a warning and
exits without touching anything.

To run it automatically on deploy (e.g. **Vercel**), set the Build Command to:

```bash
npm run db:reset && npm run build
```

and add `SUPABASE_DB_URL` (the direct connection string, port 5432) to the
deploy environment. Local `npm run build` is never affected unless
`SUPABASE_DB_URL` is set.

> ⚠️ `db:reset` is destructive by design — it drops all app tables. Remove the
> deploy step (and rely on regular migrations) once real data needs preserving.
