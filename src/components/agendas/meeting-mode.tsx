"use client";

import { useState } from "react";
import {
  X, CheckCircle2, ArrowRightCircle, Circle, Flag, User, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useData } from "@/contexts/DataContext";
import { groupBySection, templateSections, seedCarriedItems, carriedItems } from "@/lib/agenda";
import { MEETING_TYPE_LABELS } from "@/types";
import type { AgendaItem } from "@/types";

/**
 * Full-screen "run the meeting" view: agenda on the left (grouped by section),
 * notes for the selected item on the right. Each item is marked Complete or
 * Carry forward. Finishing the meeting marks it completed and carries the
 * carried-forward items into the next meeting of the same type.
 */
export function MeetingMode({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const { meetings } = useData();
  const meeting = meetings.items.find((m) => m.id === meetingId) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  if (!meeting) return null;

  const sections = meeting.sections?.length ? meeting.sections : templateSections(meeting.type);
  const groups = groupBySection(meeting.agenda, sections);
  const items = meeting.agenda;
  const decided = items.filter((i) => i.outcome).length;
  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;

  function patchItem(itemId: string, patch: Partial<AgendaItem>) {
    if (!meeting) return;
    const agenda = meeting.agenda.map((a) => (a.id === itemId ? { ...a, ...patch } : a));
    void meetings.update(meeting.id, { agenda, updatedAt: new Date().toISOString() });
  }

  function setOutcome(item: AgendaItem, outcome: "completed" | "carried") {
    // Toggle off when tapping the same outcome again; keep `done` in sync so the
    // build-mode checkbox matches.
    const next = item.outcome === outcome ? undefined : outcome;
    patchItem(item.id, { outcome: next, done: next === "completed" });
  }

  async function finishMeeting() {
    if (!meeting) return;
    setFinishing(true);
    const now = new Date().toISOString();

    // Carry forward into the next upcoming meeting of the same type, if one
    // exists; otherwise the items stay flagged and are pulled in when the next
    // meeting of this type is created (see the agendas page handleSave).
    const carried = carriedItems(meeting);
    if (carried.length) {
      const next = meetings.items
        .filter((m) => m.type === meeting.type && m.status === "upcoming" && m.id !== meeting.id)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (next) {
        const seeded = seedCarriedItems(meeting);
        await meetings.update(next.id, {
          agenda: [...next.agenda, ...seeded],
          updatedAt: now,
        });
        // Mark the source items so they aren't carried twice.
        const agenda = meeting.agenda.map((a) =>
          a.outcome === "carried" && !a.carriedInto ? { ...a, carriedInto: next.id } : a,
        );
        await meetings.update(meeting.id, { agenda, status: "completed", updatedAt: now });
        setFinishing(false);
        onClose();
        return;
      }
    }

    await meetings.update(meeting.id, { status: "completed", updatedAt: now });
    setFinishing(false);
    onClose();
  }

  const carriedCount = items.filter((i) => i.outcome === "carried").length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{meeting.title}</p>
          <p className="text-xs text-muted-foreground">
            {MEETING_TYPE_LABELS[meeting.type]} · {decided} of {items.length} decided
            {carriedCount > 0 ? ` · ${carriedCount} carrying forward` : ""}
          </p>
        </div>
        <Button onClick={finishMeeting} size="sm" disabled={finishing} className="gap-1.5">
          <Flag className="h-4 w-4" /> {finishing ? "Finishing…" : "Finish meeting"}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close (keep editing later)">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Two panes */}
      <div className="flex-1 min-h-0 grid md:grid-cols-2">
        {/* Left: agenda */}
        <div className="min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r border-border p-4 space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No agenda items.</p>
          ) : (
            groups.filter((g) => g.items.length > 0).map((group) => (
              <div key={group.section} className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.section}</p>
                <ul className="space-y-1.5">
                  {group.items.map((item) => {
                    const active = item.id === selectedId;
                    return (
                      <li
                        key={item.id}
                        className={cn(
                          "rounded-lg border bg-card px-3 py-2 cursor-pointer transition-colors",
                          active ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40",
                        )}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0">
                            {item.outcome === "completed" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : item.outcome === "carried" ? (
                              <ArrowRightCircle className="h-4 w-4 text-amber-600" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground/40" />
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm", item.outcome === "completed" && "line-through text-muted-foreground")}>
                              {item.title}
                            </p>
                            <div className="flex flex-wrap gap-x-3 mt-0.5">
                              {item.presenter && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <User className="h-3 w-3" /> {item.presenter}
                                </span>
                              )}
                              {item.durationMins ? (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" /> {item.durationMins}m
                                </span>
                              ) : null}
                              {item.source && (
                                <span className="text-[10px] text-muted-foreground italic">from {item.source}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 pl-6">
                          <Button
                            variant={item.outcome === "completed" ? "default" : "outline"}
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={(e) => { e.stopPropagation(); setOutcome(item, "completed"); }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                          </Button>
                          <Button
                            variant={item.outcome === "carried" ? "default" : "outline"}
                            size="sm"
                            className="h-7 gap-1.5 text-xs"
                            onClick={(e) => { e.stopPropagation(); setOutcome(item, "carried"); }}
                          >
                            <ArrowRightCircle className="h-3.5 w-3.5" /> Carry forward
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Right: notes */}
        <div className="min-h-0 overflow-y-auto p-4 space-y-4">
          {selected ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes · {selected.title}
              </p>
              <Textarea
                value={selected.notes ?? ""}
                onChange={(e) => patchItem(selected.id, { notes: e.target.value || undefined })}
                placeholder="Discussion, decisions, follow-ups for this item…"
                rows={8}
              />
              <div className="flex items-center gap-1.5">
                <Button
                  variant={selected.outcome === "completed" ? "default" : "outline"}
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setOutcome(selected, "completed")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                </Button>
                <Button
                  variant={selected.outcome === "carried" ? "default" : "outline"}
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setOutcome(selected, "carried")}
                >
                  <ArrowRightCircle className="h-3.5 w-3.5" /> Carry forward
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Select an agenda item to take notes.
            </p>
          )}

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meeting notes</p>
            <Textarea
              value={meeting.notes ?? ""}
              onChange={(e) => meetings.update(meeting.id, { notes: e.target.value })}
              placeholder="General notes for the whole meeting…"
              rows={4}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
