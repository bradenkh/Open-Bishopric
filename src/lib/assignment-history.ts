import type { Meeting } from "@/types";

export type AssignmentRole = "invocation" | "benediction" | "speaker";

export const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  invocation: "Invocation",
  benediction: "Benediction",
  speaker: "Speaker",
};

/** Prayers and speakers are always browsed separately — never mixed in one list. */
export const PRAYER_ROLES = ["invocation", "benediction"] as const satisfies readonly AssignmentRole[];
export const SPEAKER_ROLES = ["speaker"] as const satisfies readonly AssignmentRole[];

export interface Assignment {
  meetingId: string;
  date: string;
  role: AssignmentRole;
  /** Name with any trailing topic (e.g. "— Faith") stripped, used for grouping. */
  name: string;
  /** The row's value exactly as entered on the bulletin. */
  raw: string;
  /** True if the meeting date is in the future (scheduled, not yet given). */
  scheduled: boolean;
}

const ROLE_PATTERNS: [RegExp, AssignmentRole][] = [
  [/invocation|opening prayer/i, "invocation"],
  [/benediction|closing prayer/i, "benediction"],
  [/speaker/i, "speaker"],
];

/** Classify a bulletin row label into a tracked assignment role, or null. */
export function classifyRole(label: string): AssignmentRole | null {
  for (const [pattern, role] of ROLE_PATTERNS) {
    if (pattern.test(label)) return role;
  }
  return null;
}

/** Strip a trailing " — Topic" / " - Topic" / ", Topic" from a bulletin value. */
function stripTopic(value: string): string {
  return value.split(/\s+[—-]\s+|,\s*/)[0].trim();
}

/** Pull every invocation/benediction/speaker assignment out of a set of meetings. */
export function extractAssignments(meetings: Meeting[]): Assignment[] {
  const today = new Date().toISOString().slice(0, 10);
  const assignments: Assignment[] = [];

  for (const meeting of meetings) {
    if (meeting.type !== "sacrament_meeting" || meeting.status === "cancelled") continue;
    const rows = meeting.program?.rows ?? [];
    for (const row of rows) {
      const raw = row.value?.trim();
      if (!raw) continue;
      const role = classifyRole(row.label);
      if (!role) continue;
      assignments.push({
        meetingId: meeting.id,
        date: meeting.date,
        role,
        name: stripTopic(raw),
        raw,
        scheduled: meeting.date > today,
      });
    }
  }

  return assignments;
}

export interface SundayGroup {
  date: string;
  meetingId: string;
  scheduled: boolean;
  assignments: Assignment[];
}

/** Group assignments by Sunday, most recent first. */
export function groupBySunday(assignments: Assignment[]): SundayGroup[] {
  const byDate = new Map<string, SundayGroup>();
  for (const a of assignments) {
    let group = byDate.get(a.date);
    if (!group) {
      group = { date: a.date, meetingId: a.meetingId, scheduled: a.scheduled, assignments: [] };
      byDate.set(a.date, group);
    }
    group.assignments.push(a);
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export interface PersonHistory {
  name: string;
  counts: Record<AssignmentRole, number>;
  total: number;
  lastDate: string;
  entries: Assignment[];
}

/** Group assignments by person, sorted by most-recently-served first. */
export function groupByPerson(assignments: Assignment[]): PersonHistory[] {
  const byName = new Map<string, PersonHistory>();
  for (const a of assignments) {
    if (a.scheduled) continue; // don't count future assignments toward history
    let person = byName.get(a.name);
    if (!person) {
      person = {
        name: a.name,
        counts: { invocation: 0, benediction: 0, speaker: 0 },
        total: 0,
        lastDate: a.date,
        entries: [],
      };
      byName.set(a.name, person);
    }
    person.counts[a.role] += 1;
    person.total += 1;
    person.entries.push(a);
    if (a.date > person.lastDate) person.lastDate = a.date;
  }
  return Array.from(byName.values()).sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
}
