import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromRow } from "@/lib/db/mappers";
import {
  availabilityRepo,
  availabilityExceptionsRepo,
  interviewsRepo,
  settlementRepo,
} from "@/lib/db";
import { generateSlots, groupSlotsByDate, nowInAppTz } from "@/lib/availability";
import { INTERVIEW_DURATION_MINS } from "@/types";
import type { BookingToken, Interview, SettlementRecord } from "@/types";

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
    return NextResponse.json({
      memberName: record.memberName,
      purpose: record.purpose,
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

  const [blocks, exceptions, interviews] = await Promise.all([
    availabilityRepo.list(admin),
    availabilityExceptionsRepo.list(admin),
    interviewsRepo.list(admin),
  ]);

  const slots = generateSlots({
    durationMins: SETTLEMENT_MINS,
    blocks,
    exceptions,
    interviews,
    // Keep each interviewer's day contiguous as members self-book.
    packAdjacent: true,
  });

  return NextResponse.json({
    memberName: record.memberName,
    purpose: record.purpose,
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
  const slots = generateSlots({
    durationMins: SETTLEMENT_MINS,
    blocks,
    exceptions,
    interviews,
    // Keep each interviewer's day contiguous as members self-book.
    packAdjacent: true,
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

  return NextResponse.json({
    ok: true,
    memberName: record.memberName,
    date,
    time,
    interviewer,
    durationMins: SETTLEMENT_MINS,
  });
}

/** Flip the member's settlement record to `scheduled`, creating it if needed. */
async function upsertSettlementScheduled(
  admin: ReturnType<typeof createAdminClient>,
  record: BookingToken,
  interviewId: string,
): Promise<void> {
  // Prefer the record the token points at; else match member + year.
  let existing: SettlementRecord | null = null;
  if (record.settlementRecordId) {
    const { data } = await admin
      .from("settlement_records")
      .select("*")
      .eq("id", record.settlementRecordId)
      .maybeSingle();
    existing = data ? fromRow<SettlementRecord>(data as Record<string, unknown>) : null;
  }
  if (!existing && record.memberId && record.year != null) {
    const { data } = await admin
      .from("settlement_records")
      .select("*")
      .eq("member_id", record.memberId)
      .eq("year", record.year)
      .maybeSingle();
    existing = data ? fromRow<SettlementRecord>(data as Record<string, unknown>) : null;
  }

  if (existing) {
    await settlementRepo.update(admin, existing.id, {
      status: "scheduled",
      interviewId,
    });
    return;
  }

  const now = new Date().toISOString();
  await settlementRepo.create(admin, {
    id: newId(),
    memberId: record.memberId,
    memberName: record.memberName,
    year: record.year ?? nowInAppTz().getFullYear(),
    status: "scheduled",
    interviewId,
    createdBy: "self-signup",
    createdAt: now,
    updatedAt: now,
  });
}
