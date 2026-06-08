import type { Announcement } from "@/types";

/** YYYY-MM-DD for "today" — kept as a helper so it's easy to stub in tests. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * An announcement is active (auto-included on the bulletin) when it has not
 * been archived and its event date (if any) has not yet passed. Announcements
 * with no date are standing and stay until archived.
 */
export function isAnnouncementActive(a: Announcement, today = todayISO()): boolean {
  if (a.archived) return false;
  if (a.date && a.date < today) return false;
  return true;
}

/** Active announcements first (soonest date first, standing last), then inactive. */
export function sortAnnouncements(list: Announcement[], today = todayISO()): Announcement[] {
  return [...list].sort((a, b) => {
    const aActive = isAnnouncementActive(a, today);
    const bActive = isAnnouncementActive(b, today);
    if (aActive !== bActive) return aActive ? -1 : 1;
    // Within a group, sort by date (no date sorts last), then by title.
    const aDate = a.date ?? "9999-12-31";
    const bDate = b.date ?? "9999-12-31";
    if (aDate !== bDate) return aDate < bDate ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}
