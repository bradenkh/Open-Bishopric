/**
 * Minimal iCalendar (.ics) builder for settlement-appointment confirmations.
 *
 * The app stores appointment times as ward-local wall-clock ("YYYY-MM-DD" +
 * "HH:MM" in APP_TIME_ZONE). Calendar clients need an absolute instant, so we
 * convert that wall-clock time to UTC (DST-aware, via date-fns-tz) and emit
 * DTSTART/DTEND in UTC "…Z" form — unambiguous in every recipient's timezone.
 *
 * METHOD:PUBLISH (not REQUEST) means "here is an event to add", not a meeting
 * invitation that expects an RSVP — so clients offer a plain "add to calendar".
 * Framework-free so it can be used from any server route.
 */

import { fromZonedTime } from "date-fns-tz";
import { APP_TIME_ZONE } from "@/lib/availability";

export interface IcsEvent {
  /** Globally-unique, stable id for the event (e.g. the interview id). */
  uid: string;
  /** Short event title, e.g. "Tithing Settlement". */
  title: string;
  description?: string;
  location?: string;
  /** Ward-local date, "YYYY-MM-DD". */
  date: string;
  /** Ward-local 24-hour time, "HH:MM". */
  time: string;
  /** Appointment length in minutes. */
  durationMins: number;
}

/** Format a Date as an iCalendar UTC timestamp: "YYYYMMDDTHHMMSSZ". */
function toIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Escape a text value per RFC 5545 (backslash, semicolon, comma, newlines). */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line to 75 octets max, per RFC 5545 (continuation = CRLF + space). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

/** Build a single-event VCALENDAR document (CRLF-terminated) from an event. */
export function buildIcs(ev: IcsEvent): string {
  const start = fromZonedTime(`${ev.date}T${ev.time}:00`, APP_TIME_ZONE);
  const end = new Date(start.getTime() + ev.durationMins * 60_000);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Open Bishopric//Tithing Settlement//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeText(ev.title)}`,
    ...(ev.description ? [`DESCRIPTION:${escapeText(ev.description)}`] : []),
    ...(ev.location ? [`LOCATION:${escapeText(ev.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
