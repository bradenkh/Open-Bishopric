/**
 * Google booking-page URLs, keyed by interview type.
 *
 * Members self-book through Google Calendar appointment pages; each interview
 * type has its own page (a Google appointment schedule is one type with one
 * duration). Outreach emails link members to the page for their interview type.
 * Framework-free so both the settings Route Handler and the client can use it.
 */

import { INTERVIEW_TYPE_LABELS } from "@/types";
import type { InterviewType } from "@/types";

export type BookingPageUrls = Partial<Record<InterviewType, string>>;

/** The interview types a booking page can be set for. */
export const BOOKING_PAGE_TYPES = Object.keys(INTERVIEW_TYPE_LABELS) as InterviewType[];

/**
 * Coerce arbitrary input into a clean map: only known interview types, only
 * non-empty trimmed string URLs. Anything else is dropped, so a bad payload
 * can never write junk keys or non-string values.
 */
export function normalizeBookingPageUrls(input: unknown): BookingPageUrls {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const out: BookingPageUrls = {};
  for (const type of BOOKING_PAGE_TYPES) {
    const value = source[type];
    if (typeof value === "string" && value.trim()) out[type] = value.trim();
  }
  return out;
}

/** The booking-page URL for an interview type, or undefined when unset. */
export function bookingLinkFor(
  type: InterviewType,
  urls?: BookingPageUrls | null,
): string | undefined {
  return urls?.[type]?.trim() || undefined;
}
