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
| `SUPABASE_DB_URL` | Settings → Database → Connection string → **Session pooler** URI | Used by the migration runner, which runs as `prebuild` on every build/deploy. Set it in Production only. Use the Session pooler (IPv4) on IPv4-only hosts. |
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

The schema and RLS policies are in `supabase/`:

- `supabase/migrations/0001_initial_schema.sql` — all tables, RLS, and the
  `profiles` trigger. It is **idempotent**: it drops and recreates our objects,
  so it can be applied repeatedly to get a fresh schema.

### Auth model (invite-only)

There is no public sign-up. Provision bishopric members from the Supabase
dashboard (**Authentication → Users → Invite**, or Add user). A matching
`profiles` row — with their role — is created automatically by the
`handle_new_user` trigger. You can set `display_name` and `role`
(`bishop` | `counselor` | `clerk` | `exec_secretary`) via the invite's user
metadata; otherwise role defaults to `counselor`.

## Email (send & receive)

The app can really send agenda-item requests, to-do reminders, and interview
times — and read the replies — using a **Gmail account over an app password**.
This needs **no custom domain and no OAuth** (so no 7-day token expiry): Gmail
sends from its own address and already receives mail there, so there are no MX
records or provider verification to set up. It's free and fine for ward volume.

**One-time setup** (do this on a Gmail account — ideally a dedicated ward one like
`firstwardbishopric@gmail.com`, so mail doesn't come from a personal address):

1. Turn on **2-Step Verification** (https://myaccount.google.com/security).
2. Create an **App Password** (https://myaccount.google.com/apppasswords) — a
   16-character code.
3. In the app, go to **Settings → Email**, enter the Gmail address and app
   password, **Save**, then **Send test email** to confirm it works.

No new environment variables are required — the address and app password are
stored server-side in the RLS-locked `app_settings` table (the same place the AI
key lives), never exposed to the browser.

**How it works** (`src/lib/email/gmail.ts`):

- **Sending** goes out over SMTP (`smtp.gmail.com:465`) via `nodemailer`. Each
  outbound request stores the message's `Message-ID` on its record
  (`agenda_solicitations` / `interviews`).
- **Receiving** reads the INBOX over IMAP (`imap.gmail.com:993`) via `imapflow` /
  `mailparser`. `POST /api/email/poll` matches each reply's `In-Reply-To` /
  `References` headers back to the stored `Message-ID`, then records agenda
  replies (`status='replied'`) and interview replies (appended to the interview's
  notes for the assistant to parse). Trigger it with **Check for replies** in the
  Collect-agenda-items dialog, or wire it to a cron.
- **Searching & reading** the inbox is available to the AI assistant via
  `searchInbox` (Gmail search over the INBOX — filter by sender, subject,
  free text, recency, or unread — returning per-message summaries keyed by a
  stable IMAP `uid`) and `readEmail` (open one message's full body by `uid`).
  Both read only; messages are never marked seen.
- The AI assistant also has `sendTaskReminder` and `emailInterviewTimes` tools.
- If email isn't configured, sending an agenda request **falls back to a
  `mailto:` link**, so nothing breaks before setup.

## Calendar feed (Google Calendar)

The interview board can be mirrored into Google Calendar — or any calendar app —
as a **read-only iCalendar feed**. It's **one-way** (app → calendar): scheduled
interviews flow to the calendar automatically; edits made in the calendar never
touch the app. This keeps the same no-OAuth simplicity as email — the feed is
protected by an unguessable token in its URL rather than a Google login.

**Enable it:** go to **Settings → Calendar** and click **Generate feed link**.
Then in Google Calendar (web) → next to **Other calendars** click **+** → **From
URL**, paste the link, and **Add calendar**. Google polls subscribed calendars
every few hours, so new appointments take a little while to appear.

- The token *is* the credential — anyone with the link can read the ward's
  scheduled appointments, so share it only within the bishopric. **Regenerate**
  rotates it (invalidating the old link); **Disable feed** turns it off entirely.
- The token lives in the server-only, RLS-locked `app_settings` table (same home
  as the Gmail and AI credentials) and is served by
  `src/app/api/calendar/[token]/route.ts`. Feed rendering (RFC 5545, with a
  `America/New_York` `VTIMEZONE`) is in `src/lib/calendar/ics.ts`.

## Database setup & schema changes

Migrations are tracked and applied automatically. A `schema_migrations` table
records which files in `supabase/migrations` have run, and the runner
(`scripts/migrate.mjs`) applies only the pending ones, each in a transaction —
it never drops data. It runs as the `prebuild` step, so **every deploy applies
any new migrations before the app builds**, as long as `SUPABASE_DB_URL` is set
in that environment. Without `SUPABASE_DB_URL` it is a no-op, so local builds and
previews are unaffected. A migration that fails exits non-zero and fails the
build, so the app is never deployed against a half-migrated schema.

```bash
npm run db:migrate   # apply pending migrations by hand (what prebuild runs)
```

**First-time setup** (or any disposable dev database): point `SUPABASE_DB_URL`
at the database and run the migration script. This applies all migrations
against a fresh database.

**Evolving the schema:** add a new, forward-only migration — give it the next
number (`000N_*.sql`) and use idempotent, non-destructive statements (`alter
table ... add column if not exists`, `create table if not exists`, swap a
constraint with `drop constraint if exists` then `add constraint`, etc.). It
will be applied on the next deploy. The two original migrations (`0001`, `0002`)
contain destructive teardown from the original dev schema-reset flow; the runner
**baselines** them on an already-provisioned database (records them as applied
without re-running) so production data is never wiped.

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
4. Before your first deploy, run `npm run db:migrate` once against your Supabase
   database (see above) to create the schema. After that, schema changes ride
   along automatically on each production deploy.
5. Deploy, then invite yourself under **Authentication → Users** in Supabase and
   sign in.
