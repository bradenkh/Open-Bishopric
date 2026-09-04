import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromRow } from "@/lib/db/mappers";
import {
  availabilityRepo,
  availabilityExceptionsRepo,
  interviewsRepo,
  settlementRepo,
  listProfiles,
} from "@/lib/db";
import { generateSlots, groupSlotsByDate, nowInAppTz } from "@/lib/availability";
import { isEmailConfigured, sendEmail } from "@/lib/email/gmail";
import {
  renderSettlementConfirmation,
  settlementTitle,
  withConfirmationDefaults,
} from "@/lib/settlement-email";
import { formatDate } from "@/lib/utils";
import { INTERVIEW_DURATION_MINS } from "@/types";
import type { AvailabilityBlock, BookingToken, Interview, Member, SettlementRecord } from "@/types";

/**
 * Public, token-authenticated booking endpoint. NO login required — the
 * unguessable token in the URL is the credential. It runs with the service-role
 * client (bypassing RLS) in a trusted server context, and returns/writes ONLY
 * the data tied to this one token, never the wider ward.
 */

const SETTLEMENT_MINS = INTERVIEW_DURATION_MINS.tithing_settlement;

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Load a token row by its token value, or null. */
async function loadToken(
  admin: ReturnType<typeof createAdminClient>,
  token: string,
): Promise<BookingToken | null> {
  const { data, error } = await admin
    .from("booking_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow<BookingToken>(data as Record<string, unknown>) : null;
}

/** Terminal state a token can be in, if any (drives the page's messaging). */
function tokenState(t: BookingToken): "used" | "expired" | null {
  if (t.usedAt) return "used";
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return "expired";
  return null;
}

/**
 * The members this link's single appointment covers. Newer tokens carry the
 * household directly; older per-member tokens fall back to their one member.
 */
function householdMembers(t: BookingToken): { id: string; name: string }[] {
  if (t.householdMembers?.length) return t.householdMembers;
  if (t.memberId) return [{ id: t.memberId, name: t.memberName }];
  return [];
}

/** Whether this link books for a household of more than one. */
function isHousehold(t: BookingToken): boolean {
  return householdMembers(t).length > 1;
}

/**
 * Restrict settlement availability to the bishop. Tithing settlement is held by
 * the bishop, so members self-booking should only ever see his open windows —
 * never a counselor's. Falls back to every block when no bishop profile exists
 * (a misconfiguration) so the page isn't silently empty.
 */
async function bishopBlocks(
  admin: ReturnType<typeof createAdminClient>,
  blocks: AvailabilityBlock[],
): Promise<{ blocks: AvailabilityBlock[]; bishopId?: string }> {
  const profiles = await listProfiles(admin);
  const bishop = profiles.find((p) => p.role === "bishop");
  return {
    blocks: bishop ? blocks.filter((b) => b.memberId === bishop.uid) : blocks,
    bishopId: bishop?.uid,
  };
}

/** Load a single interview row by id, or null. */
async function loadInterview(
  admin: ReturnType<typeof createAdminClient>,
  interviewId?: string,
): Promise<Interview | null> {
  if (!interviewId) return null;
  const { data } = await admin
    .from("interviews")
    .select("*")
    .eq("id", interviewId)
    .maybeSingle();
  return data ? fromRow<Interview>(data as Record<string, unknown>) : null;
}

// ── GET: token details + open slots ──────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const admin = createAdminClient();

  let record: BookingToken | null;
  try {
    record = await loadToken(admin, token);
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  // Possessing an unknown token reveals nothing — generic 404.
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const state = tokenState(record);
  if (state) {
    // On a used link, surface the booked slot so a household member who opens it
    // afterward sees they're already scheduled, with the details.
    let scheduled: { date: string; time: string; interviewer: string } | undefined;
    if (state === "used") {
      const interview = await loadInterview(admin, record.interviewId);
      if (interview?.scheduledDate && interview.scheduledTime) {
        scheduled = {
          date: interview.scheduledDate,
          time: interview.scheduledTime,
          interviewer: interview.interviewer ?? "",
        };
      }
    }
    return NextResponse.json({
      memberName: record.memberName,
      purpose: record.purpose,
      household: isHousehold(record),
      scheduled,
      state, // "used" | "expired"
    });
  }

  // Record the open: first-open timestamp + a running count. Best-effort — a
  // tracking failure must not block the member from seeing their slots.
  const nowIso = new Date().toISOString();
  try {
    await admin
      .from("booking_tokens")
      .update({ opened_at: record.openedAt ?? nowIso, open_count: (record.openCount ?? 0) + 1 })
      .eq("id", record.id);
  } catch {
    // tracking is non-critical
  }

  // Jump the settlement record straight to `link_opened` the moment the member
  // follows their link — no manual "invited" step in between. Best-effort and
  // forward-only: it never downgrades a record that's already scheduled/done.
  try {
    await markSettlementOpened(admin, record);
  } catch {
    // status tracking is non-critical
  }

  const [blocks, exceptions, interviews] = await Promise.all([
    availabilityRepo.list(admin),
    availabilityExceptionsRepo.list(admin),
    interviewsRepo.list(admin),
  ]);

  const bishop = await bishopBlocks(admin, blocks);
  const slots = generateSlots({
    durationMins: SETTLEMENT_MINS,
    // Members only ever see the bishop's openings for settlement.
    blocks: bishop.blocks,
    exceptions,
    interviews,
    // Anything on the bishop's calendar (incl. must-be-bishop interviews) closes
    // the slot it sits in.
    bishopMemberId: bishop.bishopId,
    // Keep each interviewer's day contiguous as members self-book.
    packAdjacent: true,
    // Offer each window's preferred time first.
    preferredFirst: true,
  });

  return NextResponse.json({
    memberName: record.memberName,
    purpose: record.purpose,
    household: isHousehold(record),
    year: record.year,
    durationMins: SETTLEMENT_MINS,
    days: groupSlotsByDate(slots),
    state: null,
  });
}

// ── POST: book the chosen slot ───────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.json().catch(() => null);
  const date = body?.date as string | undefined;
  const time = body?.time as string | undefined;
  const interviewer = body?.interviewer as string | undefined;
  if (!date || !time || !interviewer) {
    return NextResponse.json({ error: "Missing date, time, or interviewer" }, { status: 400 });
  }

  const admin = createAdminClient();

  let record: BookingToken | null;
  try {
    record = await loadToken(admin, token);
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tokenState(record)) {
    return NextResponse.json({ error: "This link has already been used." }, { status: 409 });
  }

  // Re-validate the slot is still open (guards against a double-book race).
  const [blocks, exceptions, interviews] = await Promise.all([
    availabilityRepo.list(admin),
    availabilityExceptionsRepo.list(admin),
    interviewsRepo.list(admin),
  ]);
  const bishop = await bishopBlocks(admin, blocks);
  const slots = generateSlots({
    durationMins: SETTLEMENT_MINS,
    // Same bishop-only windows the GET offered, so the re-check matches.
    blocks: bishop.blocks,
    exceptions,
    interviews,
    bishopMemberId: bishop.bishopId,
    // Keep each interviewer's day contiguous as members self-book.
    packAdjacent: true,
    // Offer each window's preferred time first.
    preferredFirst: true,
  });
  const stillOpen = slots.some(
    (s) => s.date === date && s.time === time && s.memberName === interviewer,
  );
  if (!stillOpen) {
    return NextResponse.json(
      { error: "That time was just taken. Please pick another slot." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const interviewId = newId();

  // The member self-selected the time, so both sides count as confirmed.
  const interview: Interview = {
    id: interviewId,
    memberName: record.memberName,
    memberId: record.memberId,
    type: "tithing_settlement",
    stage: "scheduled",
    requiresBishop: false,
    interviewer,
    attendeeConfirmed: true,
    interviewerConfirmed: true,
    scheduledDate: date,
    scheduledTime: time,
    durationMins: SETTLEMENT_MINS,
    createdBy: "self-signup",
    createdAt: now,
    updatedAt: now,
  };

  try {
    await interviewsRepo.create(admin, interview);
    await admin
      .from("booking_tokens")
      .update({ used_at: now, interview_id: interviewId })
      .eq("id", record.id);
    await upsertSettlementScheduled(admin, record, interviewId);
  } catch {
    return NextResponse.json({ error: "Booking failed. Please try again." }, { status: 500 });
  }

  // Email the household a confirmation of the slot they just chose. Best-effort:
  // the booking is already committed, so a failure here (email not configured, a
  // send error, no address on file) must never fail the request.
  try {
    await sendBookingConfirmation(admin, record, { date, time, interviewer });
  } catch {
    // confirmation is non-critical
  }

  return NextResponse.json({
    ok: true,
    memberName: record.memberName,
    date,
    time,
    interviewer,
    durationMins: SETTLEMENT_MINS,
  });
}

/** Format a "HH:MM" 24-hour time as "4:30 PM" for display in the email. */
function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Send the household a confirmation email for the appointment just booked.
 *
 * The link is emailed to the household's parents, so the confirmation goes back
 * to the same people: every household parent with an email on file, addressed
 * individually by courtesy title (Brother/Sister). Falls back to any household
 * member with an email when none are
 * flagged as parents (older data). Silent no-op when email isn't configured or
 * no member has an address. Uses the bishopric's saved confirmation template,
 * or the built-in default when they haven't customized it.
 */
async function sendBookingConfirmation(
  admin: ReturnType<typeof createAdminClient>,
  record: BookingToken,
  slot: { date: string; time: string; interviewer: string },
): Promise<void> {
  if (!(await isEmailConfigured())) return;

  const ids = householdMembers(record).map((p) => p.id);
  if (ids.length === 0) return;

  const { data } = await admin.from("members").select("*").in("id", ids);
  const members = (data ?? []).map((r) => fromRow<Member>(r as Record<string, unknown>));

  // Prefer the household's parents (who receive the invite); fall back to anyone
  // in the household with an address so a confirmation still goes out.
  const withEmail = members.filter((m) => m.email?.trim());
  const parents = withEmail.filter((m) => m.isHouseholdParent);
  const recipients = parents.length ? parents : withEmail;
  if (recipients.length === 0) return;

  const { data: settings } = await admin
    .from("app_settings")
    .select("settlement_confirmation_subject, settlement_confirmation_body")
    .eq("id", "default")
    .maybeSingle();
  const template = withConfirmationDefaults({
    subject: settings?.settlement_confirmation_subject,
    body: settings?.settlement_confirmation_body,
  });

  const date = formatDate(slot.date);
  const time = formatTime(slot.time);

  // De-dupe by address in case two parents share one email.
  const sent = new Set<string>();
  for (const m of recipients) {
    const to = m.email!.trim();
    if (sent.has(to.toLowerCase())) continue;
    sent.add(to.toLowerCase());
    const { subject, body } = renderSettlementConfirmation(template, {
      name: m.firstName,
      lastName: m.lastName,
      title: settlementTitle(m.gender),
      date,
      time,
      interviewer: slot.interviewer,
    });
    await sendEmail({ to, subject, body });
  }
}

/** Find a household member's settlement record for the token's year, or null. */
async function findRecord(
  admin: ReturnType<typeof createAdminClient>,
  memberId: string,
  year: number,
): Promise<SettlementRecord | null> {
  const { data } = await admin
    .from("settlement_records")
    .select("*")
    .eq("member_id", memberId)
    .eq("year", year)
    .maybeSingle();
  return data ? fromRow<SettlementRecord>(data as Record<string, unknown>) : null;
}

/**
 * Advance the whole household's settlement records to `link_opened` when the
 * shared link is opened. Forward-only: only `not_started` / `link_created`
 * records move; anything already scheduled or later is left alone. A record
 * missing for a household member (link generated outside the normal flow) is
 * created so the open still reflects on the board.
 */
async function markSettlementOpened(
  admin: ReturnType<typeof createAdminClient>,
  record: BookingToken,
): Promise<void> {
  const year = record.year ?? nowInAppTz().getFullYear();
  const now = new Date().toISOString();
  for (const person of householdMembers(record)) {
    const existing = await findRecord(admin, person.id, year);
    if (existing) {
      if (existing.status === "not_started" || existing.status === "link_created") {
        await settlementRepo.update(admin, existing.id, { status: "link_opened" });
      }
      continue;
    }
    await settlementRepo.create(admin, {
      id: newId(),
      memberId: person.id,
      memberName: person.name,
      year,
      status: "link_opened",
      createdBy: "self-signup",
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Flip every household member's settlement record to `scheduled` under the one
 * appointment, creating any that are missing. This is why the link is one per
 * household: a single booking covers everyone it lists.
 */
async function upsertSettlementScheduled(
  admin: ReturnType<typeof createAdminClient>,
  record: BookingToken,
  interviewId: string,
): Promise<void> {
  const year = record.year ?? nowInAppTz().getFullYear();
  const now = new Date().toISOString();
  for (const person of householdMembers(record)) {
    const existing = await findRecord(admin, person.id, year);
    if (existing) {
      await settlementRepo.update(admin, existing.id, { status: "scheduled", interviewId });
      continue;
    }
    await settlementRepo.create(admin, {
      id: newId(),
      memberId: person.id,
      memberName: person.name,
      year,
      status: "scheduled",
      interviewId,
      createdBy: "self-signup",
      createdAt: now,
      updatedAt: now,
    });
  }
}
