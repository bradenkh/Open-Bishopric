import { toZonedTime } from "date-fns-tz";
import type { Interview, InterviewType } from "@/types";
import { INTERVIEW_DURATION_MINS } from "@/types";

/**
 * Ward-local time and interview-duration helpers.
 *
 * The app no longer computes availability or slots — members self-book through
 * Google booking pages and those appointments are read back from the bishop's
 * calendar subscription (see lib/calendar/*). What remains here are the small,
 * timezone-safe date helpers the rest of the app still relies on.
 */

/**
 * The ward's canonical timezone. All "today"/"now" reasoning is anchored here so
 * it behaves identically no matter where the server runs (Vercel is UTC) or which
 * timezone the viewer's browser is in.
 */
export const APP_TIME_ZONE = "America/New_York";

/**
 * The current instant expressed as ward wall-clock. The returned Date's local
 * getters (getFullYear/getMonth/getDate/getHours/…) yield ward values, so
 * downstream helpers like `toDateStr` produce the correct ward-local date even
 * on a UTC server.
 */
export function nowInAppTz(): Date {
  return toZonedTime(new Date(), APP_TIME_ZONE);
}

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

/** The appointment length for an interview, defaulting to its type's length. */
export function durationOf(i: Pick<Interview, "durationMins" | "type">): number {
  return i.durationMins ?? INTERVIEW_DURATION_MINS[i.type];
}

/** The default appointment length for an interview type. */
export function durationForType(type: InterviewType): number {
  return INTERVIEW_DURATION_MINS[type];
}
