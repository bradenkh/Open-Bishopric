import { toZonedTime } from "date-fns-tz";
import type {
  AvailabilityBlock, AvailabilityException, Interview, InterviewType,
} from "@/types";
import { INTERVIEW_DURATION_MINS } from "@/types";

/**
 * The ward's canonical timezone. All scheduling ("today", "now", past-slot
 * filtering) is anchored here so it behaves identically no matter where the
 * server runs (Vercel is UTC) or which timezone the viewer's browser is in.
 */
export const APP_TIME_ZONE = "America/New_York";

/**
 * The current instant expressed as NYC wall-clock. The returned Date's local
 * getters (getFullYear/getMonth/getDate/getHours/…) yield New York values, so
 * downstream helpers like `toDateStr` produce the correct ward-local date even
 * on a UTC server.
 */
export function nowInAppTz(): Date {
  return toZonedTime(new Date(), APP_TIME_ZONE);
}

// ── Time helpers ───────────────────────────────────────────────────────────────

/** "HH:MM" → minutes since midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** minutes since midnight → "HH:MM". */
export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Local YYYY-MM-DD for a Date (avoids UTC off-by-one from toISOString). */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse a YYYY-MM-DD string as a local date. */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ── Recurrence ───────────────────────────────────────────────────────────────

/** A fixed Sunday epoch used to phase interval recurrences when no anchor is set. */
const RECURRENCE_EPOCH = "2020-01-05"; // Sunday

/** Whole weeks between two local dates (a ≤ b assumed for a non-negative result). */
function weeksBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
}

/**
 * The 1-indexed occurrence of `date`'s weekday within its month (e.g. the 2nd
 * Tuesday → 2), and whether it is the last such weekday in the month.
 */
function weekdayOccurrence(date: Date): { nth: number; isLast: boolean } {
  const nth = Math.floor((date.getDate() - 1) / 7) + 1;
  const next = new Date(date);
  next.setDate(date.getDate() + 7);
  return { nth, isLast: next.getMonth() !== date.getMonth() };
}

/**
 * Whether a recurring availability block is active on a given local date.
 * The weekday must match first; then the recurrence pattern is applied.
 * Blocks with no recurrence set behave as plain weekly (backward compatible).
 */
export function blockAppliesOn(block: AvailabilityBlock, date: Date): boolean {
  if (block.weekday !== date.getDay()) return false;

  const recurrence = block.recurrence ?? "weekly";
  if (recurrence === "weekly") return true;

  if (recurrence === "nth_weekday") {
    const target = block.nth ?? 1;
    const { nth, isLast } = weekdayOccurrence(date);
    return target === -1 ? isLast : nth === target;
  }

  // biweekly / every_n_weeks: count matching weeks from the phase anchor.
  const interval = recurrence === "biweekly" ? 2 : Math.max(1, block.intervalWeeks ?? 2);
  const anchor = parseDate(block.anchorDate ?? RECURRENCE_EPOCH);
  return weeksBetween(anchor, date) % interval === 0;
}

export function durationOf(i: Pick<Interview, "durationMins" | "type">): number {
  return i.durationMins ?? INTERVIEW_DURATION_MINS[i.type];
}

export function durationForType(type: InterviewType): number {
  return INTERVIEW_DURATION_MINS[type];
}

// ── Slot generation ────────────────────────────────────────────────────────────

export interface Slot {
  /** YYYY-MM-DD */
  date: string;
  /** "HH:MM" start */
  time: string;
  /** "HH:MM" end */
  endTime: string;
  memberId: string;
  memberName: string;
  /** True when this is the window's preferred time (see AvailabilityBlock.preferredTime). */
  preferred?: boolean;
}

/**
 * The start (in minutes) of the slot a window prefers to fill first. When the
 * block sets a `preferredTime`, the grid is phased so that time is a bookable
 * boundary and this returns it (clamped to a slot that actually fits inside the
 * window). Without a preference it falls back to `gridStart` — the window's
 * first slot — preserving the original earliest-first behaviour.
 */
function preferredSlotStart(
  block: AvailabilityBlock,
  gridStart: number,
  blockEnd: number,
  durationMins: number,
): number {
  if (!block.preferredTime) return gridStart;
  const pref = toMinutes(block.preferredTime);
  // The last boundary on the phased grid that still fits a full slot.
  const span = blockEnd - durationMins - gridStart;
  if (span < 0) return gridStart;
  const lastStart = gridStart + Math.floor(span / durationMins) * durationMins;
  return Math.min(Math.max(pref, gridStart), lastStart);
}

interface GenerateArgs {
  /** Restrict to a single member; omit to combine every member's availability. */
  memberName?: string;
  durationMins: number;
  blocks: AvailabilityBlock[];
  exceptions: AvailabilityException[];
  /** Existing interviews — booked times are removed from the open slots. */
  interviews: Interview[];
  /** How many days ahead to look (default 28). */
  days?: number;
  /** Exclude a booked interview from the conflict check (so editing keeps its slot). */
  ignoreInterviewId?: string;
  /**
   * Keep each interviewer's day contiguous. Once a day has any booking, only
   * offer slots flush against an existing booking (or the first slot of a still
   * -empty availability block) — so self-bookings pack together instead of
   * leaving unusable gaps. The first booking of a day is still free to land
   * anywhere. Off by default (the bishopric picker shows the full grid).
   */
  packAdjacent?: boolean;
  /**
   * Order each day's slots so every window's preferred time comes first, then
   * the rest chronologically — so callers that consume slots in order (the
   * self-signup page, the agent's suggestions) offer the preferred time first.
   * Off by default: the bishopric picker keeps a plain chronological grid.
   */
  preferredFirst?: boolean;
  /**
   * The bishop's member id. His availability additionally treats every
   * must-be-bishop interview as busy (only he conducts those), so a self-booked
   * settlement slot never collides with a temple-recommend / worthiness he
   * already has on the calendar — even if that interview's interviewer label
   * differs from his availability name.
   */
  bishopMemberId?: string;
  /**
   * Extra busy windows keyed by member id, merged with each member's interview
   * bookings before slots are cut. Reserved for the upcoming meetings feature:
   * when a member is assigned to a ward/stake council (or any meeting) that sits
   * on their calendar, pass it here and their slots during it close — no change
   * to slot generation needed. Empty today.
   */
  busyByMember?: Record<string, BusyRange[]>;
}

function isWithinException(
  exceptions: AvailabilityException[],
  memberId: string,
  dateStr: string,
): boolean {
  return exceptions.some(
    (e) => e.memberId === memberId && dateStr >= e.startDate && dateStr <= e.endDate,
  );
}

/** A busy window on a specific date, in minutes since midnight. */
export interface BusyRange {
  /** YYYY-MM-DD */
  date: string;
  /** minutes since midnight */
  start: number;
  /** minutes since midnight */
  end: number;
}

/** Normalize a person's name for tolerant comparison (trim, collapse inner
 *  whitespace, case-fold) so "Bishop  Phillips" and "bishop phillips" match. */
function normalizeName(name?: string): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Whether a scheduled interview occupies a block owner's calendar. Coupled by
 * person rather than exact string, so an interview reliably closes the slot it
 * sits in:
 *   - the interviewer label matches the block's member (case/spacing tolerant), or
 *   - the interview must be conducted by the bishop and this block is the
 *     bishop's — only he holds those, so it occupies his calendar even if the
 *     interviewer label is phrased differently (or left blank).
 *
 * This is the single choke point for "is this member busy then". When meetings
 * (ward/stake council, etc.) land on a member's calendar, feed them through
 * `busyByMember` on generateSlots rather than widening this function.
 */
function interviewOccupies(
  interview: Interview,
  block: Pick<AvailabilityBlock, "memberId" | "memberName">,
  bishopMemberId?: string,
): boolean {
  const who = normalizeName(interview.interviewer);
  if (who && who === normalizeName(block.memberName)) return true;
  if (bishopMemberId && block.memberId === bishopMemberId && interview.requiresBishop) return true;
  return false;
}

/** Booked [start, end) ranges, in minutes, that fill the block owner's calendar
 *  on a given date. */
function bookedRanges(
  interviews: Interview[],
  block: Pick<AvailabilityBlock, "memberId" | "memberName">,
  dateStr: string,
  ignoreId: string | undefined,
  bishopMemberId: string | undefined,
): [number, number][] {
  return interviews
    .filter(
      (i) =>
        i.id !== ignoreId &&
        i.scheduledDate === dateStr &&
        i.scheduledTime &&
        i.stage !== "completed" &&
        interviewOccupies(i, block, bishopMemberId),
    )
    .map((i) => {
      const start = toMinutes(i.scheduledTime!);
      return [start, start + durationOf(i)] as [number, number];
    });
}

/**
 * Build the list of open appointment slots across the next `days` days, sliced
 * to `durationMins`. Past slots, time-off exceptions, and already-booked times
 * are excluded. Results are sorted chronologically.
 */
export function generateSlots({
  memberName,
  durationMins,
  blocks,
  exceptions,
  interviews,
  days = 28,
  ignoreInterviewId,
  packAdjacent = false,
  preferredFirst = false,
  bishopMemberId,
  busyByMember,
}: GenerateArgs): Slot[] {
  if (durationMins <= 0) return [];

  const now = nowInAppTz();
  const todayStr = toDateStr(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const relevantBlocks = memberName
    ? blocks.filter((b) => b.memberName === memberName)
    : blocks;

  const slots: Slot[] = [];

  for (let offset = 0; offset < days; offset++) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const dateStr = toDateStr(date);

    for (const block of relevantBlocks) {
      if (!blockAppliesOn(block, date)) continue;
      if (isWithinException(exceptions, block.memberId, dateStr)) continue;

      // Everything filling this member's calendar on this date: their interview
      // bookings (coupled by person) plus any extra busy windows a caller supplies
      // (future meetings). Slots overlapping any of these are dropped.
      const booked = [
        ...bookedRanges(interviews, block, dateStr, ignoreInterviewId, bishopMemberId),
        ...(busyByMember?.[block.memberId] ?? [])
          .filter((r) => r.date === dateStr)
          .map((r) => [r.start, r.end] as [number, number]),
      ];
      const blockStart = toMinutes(block.startTime);
      const blockEnd = toMinutes(block.endTime);

      // Phase the slot grid to the window's preferred time so that time — and
      // its neighbours (e.g. 18:45 / 19:15 around a 19:00 preference) — land on
      // bookable boundaries. Absent a preference the grid starts at blockStart,
      // exactly as before.
      const phase = block.preferredTime
        ? ((toMinutes(block.preferredTime) - blockStart) % durationMins + durationMins) % durationMins
        : 0;
      const gridStart = blockStart + phase;
      const preferredStart = preferredSlotStart(block, gridStart, blockEnd, durationMins);

      // The interviewer's bookings that fall inside this block (adjacency test).
      const blockBookings = booked.filter(([bs]) => bs >= blockStart && bs < blockEnd);

      for (let start = gridStart; start + durationMins <= blockEnd; start += durationMins) {
        const end = start + durationMins;
        // Skip slots already in the past today.
        if (dateStr === todayStr && start < nowMins) continue;
        // Skip slots that overlap an existing booking.
        const conflict = booked.some(([bs, be]) => start < be && end > bs);
        if (conflict) continue;

        // Smart packing: expose only one bookable slot per block at a time,
        // growing outward as it fills. While the block is empty, only the
        // window's preferred slot is offered; once something is booked, only
        // the slots flush against a booking open up — so members book the
        // preferred time first and the rest pack contiguously around it.
        if (packAdjacent) {
          const ok = blockBookings.length > 0
            ? blockBookings.some(([bs, be]) => end === bs || start === be)
            : start === preferredStart;
          if (!ok) continue;
        }

        slots.push({
          date: dateStr,
          time: fromMinutes(start),
          endTime: fromMinutes(end),
          memberId: block.memberId,
          memberName: block.memberName,
          preferred: start === preferredStart && !!block.preferredTime,
        });
      }
    }
  }

  slots.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    // Within a day, float preferred slots ahead of the rest when asked.
    if (preferredFirst && !!a.preferred !== !!b.preferred) return a.preferred ? -1 : 1;
    if (a.time !== b.time) return a.time.localeCompare(b.time);
    return a.memberName.localeCompare(b.memberName);
  });
  return slots;
}

/** Group slots by date for display. */
export function groupSlotsByDate(slots: Slot[]): { date: string; slots: Slot[] }[] {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    if (!map.has(s.date)) map.set(s.date, []);
    map.get(s.date)!.push(s);
  }
  return [...map.entries()].map(([date, slots]) => ({ date, slots }));
}
