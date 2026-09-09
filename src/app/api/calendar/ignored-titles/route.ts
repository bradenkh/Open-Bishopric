import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTitle } from "@/lib/calendar/subscribe";

/**
 * Standing "always ignore" rules for calendar event titles. Events whose title
 * matches (case-insensitively, whitespace-collapsed) are skipped by the ingest,
 * so recurring non-interview events never re-enter the queue.
 *
 *   GET             → { titles }         the current rules
 *   POST { title }  → { titles }         add a rule; also removes bookings that
 *                                        already match, so it takes effect at once
 *   DELETE { title }→ { titles }         remove a rule
 *
 * Stored on the server-only `app_settings` singleton.
 */
type Admin = ReturnType<typeof createAdminClient>;

async function readTitles(admin: Admin): Promise<string[]> {
  const { data, error } = await admin
    .from("app_settings")
    .select("ignored_event_titles")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  return ((data?.ignored_event_titles as string[] | null) ?? []).filter((t) => typeof t === "string");
}

async function writeTitles(admin: Admin, titles: string[]): Promise<void> {
  const { error } = await admin
    .from("app_settings")
    .update({ ignored_event_titles: titles })
    .eq("id", "default");
  if (error) throw error;
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ titles: await readTitles(createAdminClient()) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to read" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const raw = body?.title;
  const title = typeof raw === "string" ? raw.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const admin = createAdminClient();
  try {
    const norm = normalizeTitle(title);
    const titles = await readTitles(admin);
    // Store the display form, de-duplicated by normalized value.
    if (!titles.some((t) => normalizeTitle(t) === norm)) {
      await writeTitles(admin, [...titles, title]);
    }

    // Purge already-ingested bookings that match, so the rule takes effect now.
    // Matching is normalized, so it's done in code over the (small) booking set.
    const { data: rows, error } = await admin.from("calendar_bookings").select("id, summary");
    if (error) throw error;
    const toDelete = (rows ?? [])
      .filter((r) => normalizeTitle(r.summary as string | null ?? undefined) === norm)
      .map((r) => r.id as string);
    if (toDelete.length) {
      const { error: delErr } = await admin.from("calendar_bookings").delete().in("id", toDelete);
      if (delErr) throw delErr;
    }

    return NextResponse.json({ titles: await readTitles(admin), removed: toDelete.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const raw = body?.title;
  const title = typeof raw === "string" ? raw.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const admin = createAdminClient();
  try {
    const norm = normalizeTitle(title);
    const titles = await readTitles(admin);
    await writeTitles(admin, titles.filter((t) => normalizeTitle(t) !== norm));
    return NextResponse.json({ titles: await readTitles(admin) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to remove" }, { status: 500 });
  }
}
