import type { AgendaItem, Meeting, MeetingType } from "@/types";
import { AGENDA_SECTIONS } from "./agenda-templates";

/** Section heading used for items whose `section` isn't in the template list. */
export const OTHER_SECTION = "Other";

/** The ordered template section headings for a meeting type. */
export function templateSections(type: MeetingType): string[] {
  return AGENDA_SECTIONS[type] ?? [];
}

export interface AgendaSection {
  section: string;
  items: AgendaItem[];
}

/**
 * Group agenda items under the given ordered section headings, preserving the
 * heading order. Items whose `section` isn't in `sections` (or is empty) fall
 * into a trailing "Other" group, which is omitted when empty.
 */
export function groupBySection(agenda: AgendaItem[], sections: string[]): AgendaSection[] {
  const known = new Set(sections);
  const groups: AgendaSection[] = sections.map((section) => ({ section, items: [] }));
  const byName = new Map(groups.map((g) => [g.section, g]));
  const other: AgendaItem[] = [];

  for (const item of agenda) {
    const group = item.section ? byName.get(item.section) : undefined;
    if (item.section && known.has(item.section) && group) group.items.push(item);
    else other.push(item);
  }

  if (other.length) groups.push({ section: OTHER_SECTION, items: other });
  return groups;
}

/** Items the bishopric chose to carry forward during the meeting. */
export function carriedItems(meeting: Meeting): AgendaItem[] {
  return meeting.agenda.filter((i) => i.outcome === "carried" && !i.carriedInto);
}

/** A fresh id for a cloned item — works in the browser and on the server. */
function freshId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Clone the carried-forward items of a meeting into fresh agenda items for the
 * next meeting: new ids, cleared outcome/done, `source: "carried"`, preserving
 * title/presenter/notes/section. Returns an empty array when nothing is carried.
 */
export function seedCarriedItems(prev: Meeting): AgendaItem[] {
  return carriedItems(prev).map((i) => ({
    id: freshId(),
    title: i.title,
    presenter: i.presenter,
    durationMins: i.durationMins,
    notes: i.notes,
    section: i.section,
    source: "carried",
  }));
}
