import { type ClassValue, clsx } from "clsx";
import { format, parseISO } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Coerce a Date or ISO string to a Date. Date-only strings ("YYYY-MM-DD") are
 * parsed as *local* dates via `parseISO`, avoiding the UTC-midnight off-by-one
 * that `new Date("YYYY-MM-DD")` causes in negative-offset timezones.
 */
function toDate(date: Date | string): Date {
  return typeof date === "string" ? parseISO(date) : date;
}

export function formatDate(date: Date | string): string {
  return format(toDate(date), "MMM d, yyyy");
}

/** Full weekday name and date, e.g. "Tuesday · Sep 1, 2026". */
export function formatDateWithWeekday(date: Date | string): string {
  return format(toDate(date), "EEEE · MMM d, yyyy");
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}
