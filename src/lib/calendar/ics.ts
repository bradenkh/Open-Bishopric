import { durationOf } from "@/lib/availability";
import { APP_TIME_ZONE } from "@/lib/availability";
import { INTERVIEW_TYPE_LABELS, INTERVIEW_STAGES } from "@/types";
import type { Interview } from "@/types";

/**
 * Build a subscribable iCalendar (RFC 5545) feed of the ward's scheduled
 * interviews, for pulling into Google Calendar (or any calendar client) via a
 * "subscribe by URL" — a one-way, read-only mirror of the interview board.
 *
 * Times are written as local wall-clock under `TZID=America/New_York` and paired
 * with a VTIMEZONE block carrying the US-Eastern DST rules, so the client places
 * each appointment at the correct instant no matter the viewer's own timezone —
 * and without any DST conversion in our code. (`scheduledDate`/`scheduledTime`
 * are already ward-local; see APP_TIME_ZONE in lib/availability.)
 */

const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  INTERVIEW_STAGES.map((s) => [s.stage, s.label]),
);

/**
 * The America/New_York VTIMEZONE. Hardcoded to match APP_TIME_ZONE — the US
 * Eastern rules in force since 2007 (DST: 2nd Sunday of March → 1st Sunday of
 * November). If APP_TIME_ZONE ever changes, this block must change with it.
 */
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${APP_TIME_ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Escape a text value per RFC 5545 §3.3.11 (backslash, comma, semicolon, newline). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** "2026-09-04" + "16:30" → "20260904T163000" (local, paired with TZID). */
function localStamp(dateStr: string, timeStr: string): string {
  const date = dateStr.replace(/-/g, "");
  const [h = "0", m = "0"] = timeStr.split(":");
  return `${date}T${h.padStart(2, "0")}${m.padStart(2, "0")}00`;
}

/** A Date → UTC "20260904T163000Z", used for DTSTAMP. */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Add `mins` to a "20260904T163000" local stamp, staying on the wall clock. */
function addMinutesToLocalStamp(stamp: string, mins: number): string {
  const y = Number(stamp.slice(0, 4));
  const mo = Number(stamp.slice(4, 6));
  const d = Number(stamp.slice(6, 8));
  const h = Number(stamp.slice(9, 11));
  const mi = Number(stamp.slice(11, 13));
  // A UTC Date is just a calendar-arithmetic vehicle here; we read it back with
  // the UTC getters, so no timezone shift is introduced.
  const base = new Date(Date.UTC(y, mo - 1, d, h, mi));
  base.setUTCMinutes(base.getUTCMinutes() + mins);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${base.getUTCFullYear()}${p(base.getUTCMonth() + 1)}${p(base.getUTCDate())}` +
    `T${p(base.getUTCHours())}${p(base.getUTCMinutes())}00`
  );
}

/** CONFIRMED once both sides confirm / it's held; TENTATIVE while pending. */
function icsStatus(interview: Interview): "CONFIRMED" | "TENTATIVE" {
  return interview.stage === "pending_confirmation" ? "TENTATIVE" : "CONFIRMED";
}

/** Fold a content line to ≤75 octets with CRLF + single-space continuation (RFC 5545 §3.1). */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const chunks: string[] = [];
  let start = 0;
  // First line: 75 octets; continuations: 74 (one octet spent on the leading space).
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Don't split a multi-byte UTF-8 sequence: back off to a lead-byte boundary.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74;
  }
  return chunks.join("\r\n ");
}

export interface FeedOptions {
  /** Host used to form globally-unique UIDs, e.g. "openbishopric.example.com". */
  uidHost: string;
  /** Calendar display name (X-WR-CALNAME). */
  calendarName?: string;
}

/**
 * Render the interviews that have a booked date and time as a VCALENDAR string.
 * Interviews still awaiting scheduling (no date/time) are skipped. Output uses
 * CRLF line endings as required by RFC 5545.
 */
export function buildInterviewFeed(interviews: Interview[], opts: FeedOptions): string {
  const dtstamp = utcStamp(new Date());
  const host = opts.uidHost.replace(/[^A-Za-z0-9.-]/g, "") || "open-bishopric";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Open Bishopric//Interviews//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName ?? "Bishopric Interviews")}`,
    `X-WR-TIMEZONE:${APP_TIME_ZONE}`,
    ...VTIMEZONE,
  ];

  for (const iv of interviews) {
    if (!iv.scheduledDate || !iv.scheduledTime) continue;

    const start = localStamp(iv.scheduledDate, iv.scheduledTime);
    const end = addMinutesToLocalStamp(start, durationOf(iv));
    const typeLabel = INTERVIEW_TYPE_LABELS[iv.type] ?? "Interview";

    const descriptionParts: string[] = [];
    if (iv.interviewer) descriptionParts.push(`Interviewer: ${iv.interviewer}`);
    descriptionParts.push(`Status: ${STAGE_LABEL[iv.stage] ?? iv.stage}`);
    if (iv.notes?.trim()) descriptionParts.push(iv.notes.trim());

    lines.push(
      "BEGIN:VEVENT",
      `UID:interview-${iv.id}@${host}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${APP_TIME_ZONE}:${start}`,
      `DTEND;TZID=${APP_TIME_ZONE}:${end}`,
      `SUMMARY:${escapeText(`${typeLabel} — ${iv.memberName}`)}`,
      `DESCRIPTION:${escapeText(descriptionParts.join("\n"))}`,
      `STATUS:${icsStatus(iv)}`,
      `LAST-MODIFIED:${utcStamp(new Date(iv.updatedAt))}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
