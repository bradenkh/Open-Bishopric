import type {
  AvailabilityBlock, AvailabilityException, Interview, InterviewType,
} from "@/types";
import { INTERVIEW_DURATION_MINS } from "@/types";

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

/** Booked [start, end) ranges, in minutes, for a member on a given date. */
function bookedRanges(
  interviews: Interview[],
  memberName: string,
  dateStr: string,
  ignoreId?: string,
): [number, number][] {
  return interviews
    .filter(
      (i) =>
        i.id !== ignoreId &&
        i.interviewer === memberName &&
        i.scheduledDate === dateStr &&
        i.scheduledTime &&
        i.stage !== "completed",
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
}: GenerateArgs): Slot[] {
  if (durationMins <= 0) return [];

  const now = new Date();
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
    const weekday = date.getDay();

    for (const block of relevantBlocks) {
      if (block.weekday !== weekday) continue;
      if (isWithinException(exceptions, block.memberId, dateStr)) continue;

      const booked = bookedRanges(interviews, block.memberName, dateStr, ignoreInterviewId);
      const blockStart = toMinutes(block.startTime);
      const blockEnd = toMinutes(block.endTime);

      for (let start = blockStart; start + durationMins <= blockEnd; start += durationMins) {
        const end = start + durationMins;
        // Skip slots already in the past today.
        if (dateStr === todayStr && start < nowMins) continue;
        // Skip slots that overlap an existing booking.
        const conflict = booked.some(([bs, be]) => start < be && end > bs);
        if (conflict) continue;

        slots.push({
          date: dateStr,
          time: fromMinutes(start),
          endTime: fromMinutes(end),
          memberId: block.memberId,
          memberName: block.memberName,
        });
      }
    }
  }

  slots.sort((a, b) =>
    a.date === b.date
      ? a.time === b.time
        ? a.memberName.localeCompare(b.memberName)
        : a.time.localeCompare(b.time)
      : a.date.localeCompare(b.date),
  );
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
