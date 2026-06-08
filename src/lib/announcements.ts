import type { Announcement } from "@/types";

/** YYYY-MM-DD for "today" — kept as a helper so it's easy to stub in tests. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * An announcement is active when it has not been archived and its expiry (if
 * any) is still in the future. Start dates in the future do NOT hide it from
 * the running list — leaders still want to see what's coming up.
 */
export function isAnnouncementActive(a: Announcement, today = todayISO()): boolean {
  if (a.archived) return false;
  if (a.expiresOn && a.expiresOn < today) return false;
  return true;
}

/** Active announcements first (soonest expiry first), then archived/expired. */
export function sortAnnouncements(list: Announcement[], today = todayISO()): Announcement[] {
  return [...list].sort((a, b) => {
    const aActive = isAnnouncementActive(a, today);
    const bActive = isAnnouncementActive(b, today);
    if (aActive !== bActive) return aActive ? -1 : 1;
    // Within a group, sort by expiry (no expiry sorts last), then by title.
    const aExp = a.expiresOn ?? "9999-12-31";
    const bExp = b.expiresOn ?? "9999-12-31";
    if (aExp !== bExp) return aExp < bExp ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}
