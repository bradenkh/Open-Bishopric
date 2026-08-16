"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Meeting } from "@/types";
import {
  extractAssignments,
  groupBySunday,
  groupByPerson,
  ASSIGNMENT_ROLE_LABELS,
  PRAYER_ROLES,
  SPEAKER_ROLES,
  type AssignmentRole,
} from "@/lib/assignment-history";
import { formatDate, cn } from "@/lib/utils";

/** Prayers and speakers are always viewed separately, never mixed. */
type Kind = "prayers" | "speakers";

const KIND_ROLES: Record<Kind, readonly AssignmentRole[]> = {
  prayers: PRAYER_ROLES,
  speakers: SPEAKER_ROLES,
};

const KIND_LABELS: Record<Kind, string> = {
  prayers: "Prayers",
  speakers: "Speakers",
};

interface Props {
  meetings: Meeting[];
}

/**
 * Read-only, ward-wide record of who has prayed and who has spoken, derived from
 * every sacrament meeting's bulletin rows — no separate data entry required.
 * Prayers and speakers are shown one kind at a time. Each can be read by person
 * (sorted by most recently served, so it's easy to see who hasn't been asked in
 * a while) or chronologically by Sunday.
 */
export function AssignmentHistory({ meetings }: Props) {
  const [kind, setKind] = useState<Kind>("prayers");
  const [view, setView] = useState<"person" | "sunday">("person");
  const [query, setQuery] = useState("");

  const assignments = useMemo(() => extractAssignments(meetings), [meetings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const roles = KIND_ROLES[kind];
    return assignments.filter((a) => {
      if (!roles.includes(a.role)) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assignments, kind, query]);

  const sundays = useMemo(() => groupBySunday(filtered), [filtered]);
  const people = useMemo(() => groupByPerson(filtered), [filtered]);

  const recorded = filtered.filter((a) => !a.scheduled).length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">{KIND_LABELS[kind]} history</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {recorded} recorded across {sundays.filter((s) => !s.scheduled).length} Sundays
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
          {(["prayers", "speakers"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                kind === k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {(["person", "sunday"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v === "person" ? "By person" : "By Sunday"}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="h-8 pl-7 text-sm"
            />
          </div>
        </div>

        {view === "person" ? (
          <PersonView people={people} roles={KIND_ROLES[kind]} kind={kind} />
        ) : (
          <SundayView sundays={sundays} kind={kind} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ kind }: { kind: Kind }) {
  return (
    <p className="text-sm text-muted-foreground py-10 text-center">
      No {kind === "prayers" ? "prayers" : "talks"} recorded yet. They&apos;re picked up
      automatically from the {kind === "prayers" ? "prayer" : "speaker"} rows on each bulletin.
    </p>
  );
}

function PersonView({
  people,
  roles,
  kind,
}: {
  people: ReturnType<typeof groupByPerson>;
  roles: readonly AssignmentRole[];
  kind: Kind;
}) {
  if (people.length === 0) return <EmptyState kind={kind} />;
  return (
    <ul className="space-y-1">
      {people.map((p) => (
        <li key={p.name} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{p.name}</p>
            <p className="text-xs text-muted-foreground">Last served {formatDate(p.lastDate)}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {roles
              .filter((r) => p.counts[r] > 0)
              .map((r) => (
                <span key={r} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {ASSIGNMENT_ROLE_LABELS[r]} ×{p.counts[r]}
                </span>
              ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SundayView({
  sundays,
  kind,
}: {
  sundays: ReturnType<typeof groupBySunday>;
  kind: Kind;
}) {
  if (sundays.length === 0) return <EmptyState kind={kind} />;
  return (
    <ul className="space-y-1">
      {sundays.map((s) => (
        <li key={s.date} className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{formatDate(s.date)}</p>
            {s.scheduled && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                scheduled
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
            {s.assignments.map((a) => (
              <span key={`${a.meetingId}-${a.role}-${a.raw}`} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{ASSIGNMENT_ROLE_LABELS[a.role]}:</span> {a.name}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
