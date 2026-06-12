"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  X, CheckCircle2, ArrowRightCircle, Circle, Flag, User, Clock, Plus, Trash2, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useData, newId } from "@/contexts/DataContext";
import {
  groupBySection, templateSections, seedCarriedItems, carriedItems, OTHER_SECTION,
} from "@/lib/agenda";
import { MEETING_TYPE_LABELS } from "@/types";
import type { AgendaItem } from "@/types";

/** Sentinel "section" for the whole-meeting notes document. */
const MEETING_NOTES = "__meeting_notes";

/**
 * Full-screen "run the meeting" view. The left pane is a slim outline (sections
 * and items) for navigation; the right pane is an editable, document-style view
 * of the selected section — each item is a heading with its notes flowing
 * beneath, which suits long lists (e.g. ministering) far better than one card at
 * a time. Items are marked Complete or Carry forward inline; finishing the
 * meeting marks it completed and carries the carried-forward items into the next
 * meeting of the same type.
 */
export function MeetingMode({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const { meetings } = useData();
  const meeting = meetings.items.find((m) => m.id === meetingId) ?? null;
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  if (!meeting) return null;

  const sections = meeting.sections?.length ? meeting.sections : templateSections(meeting.type);
  const groups = groupBySection(meeting.agenda, sections);
  const items = meeting.agenda;
  const decided = items.filter((i) => i.outcome).length;
  const carriedCount = items.filter((i) => i.outcome === "carried").length;

  // The section currently shown in the document pane: an explicit choice, the
  // first section with items, or the first section.
  const effectiveSection =
    activeSection ??
    groups.find((g) => g.items.length > 0)?.section ??
    sections[0] ??
    OTHER_SECTION;
  const activeGroup = groups.find((g) => g.section === effectiveSection) ?? null;

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

  function deleteItem(itemId: string) {
    if (!meeting) return;
    void meetings.update(meeting.id, {
      agenda: meeting.agenda.filter((a) => a.id !== itemId),
      updatedAt: new Date().toISOString(),
    });
  }

  function addItem() {
    if (!meeting) return;
    const id = newId();
    const section = effectiveSection === OTHER_SECTION ? undefined : effectiveSection;
    void meetings.update(meeting.id, {
      agenda: [...meeting.agenda, { id, title: "", section }],
      updatedAt: new Date().toISOString(),
    });
    setSelectedId(id);
    setFocusId(id);
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
        await meetings.update(next.id, { agenda: [...next.agenda, ...seeded], updatedAt: now });
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

      {/* Two panes: outline + document */}
      <div className="flex-1 min-h-0 grid md:grid-cols-[18rem_1fr]">
        {/* Left: outline */}
        <div className="min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r border-border p-3 space-y-3">
          {groups.map((group) => (
            <div key={group.section} className="space-y-0.5">
              <button
                onClick={() => { setActiveSection(group.section); setSelectedId(null); }}
                className={cn(
                  "w-full text-left text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded",
                  effectiveSection === group.section ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {group.section}
                {group.items.length > 0 && <span className="ml-1 font-normal opacity-60">{group.items.length}</span>}
              </button>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setActiveSection(group.section); setSelectedId(item.id); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-left transition-colors",
                    selectedId === item.id ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <span className="shrink-0">
                    {item.outcome === "completed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    ) : item.outcome === "carried" ? (
                      <ArrowRightCircle className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
                    )}
                  </span>
                  <span className={cn("truncate", item.outcome === "completed" && "line-through text-muted-foreground")}>
                    {item.title || "Untitled item"}
                  </span>
                </button>
              ))}
            </div>
          ))}

          {/* Whole-meeting notes */}
          <button
            onClick={() => { setActiveSection(MEETING_NOTES); setSelectedId(null); }}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1 rounded text-xs font-semibold uppercase tracking-wide border-t border-border mt-2 pt-3",
              effectiveSection === MEETING_NOTES ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileText className="h-3.5 w-3.5" /> Meeting Notes
          </button>
        </div>

        {/* Right: document */}
        <div className="min-h-0 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 py-6">
            {effectiveSection === MEETING_NOTES ? (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Meeting Notes</h2>
                <NotesDoc
                  value={meeting.notes ?? ""}
                  placeholder="General notes for the whole meeting…"
                  onCommit={(v) => meetings.update(meeting.id, { notes: v || undefined })}
                />
              </div>
            ) : (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold">{effectiveSection}</h2>
                {activeGroup && activeGroup.items.length > 0 ? (
                  activeGroup.items.map((item) => (
                    <ItemDoc
                      key={item.id}
                      item={item}
                      autoFocus={item.id === focusId}
                      onCommit={patchItem}
                      onOutcome={setOutcome}
                      onDelete={deleteItem}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No items in this section yet.</p>
                )}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={addItem}>
                  <Plus className="h-4 w-4" /> Add item
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Document-style editors ───────────────────────────────────────────────────

/** A borderless textarea that grows to fit its content (document feel). */
function AutoGrowTextarea({
  value, onChange, onBlur, placeholder, className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      className={cn(
        "w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/50",
        className,
      )}
    />
  );
}

/**
 * One item rendered as a document block: an editable title (heading), inline
 * complete/carry/delete controls, and flowing notes. Keeps its own draft state
 * so typing in a long list never re-renders its siblings; persists on blur.
 */
function ItemDoc({
  item, autoFocus, onCommit, onOutcome, onDelete,
}: {
  item: AgendaItem;
  autoFocus: boolean;
  onCommit: (id: string, patch: Partial<AgendaItem>) => void;
  onOutcome: (item: AgendaItem, outcome: "completed" | "carried") => void;
  onDelete: (id: string) => void;
}) {
  // Draft state initialized from props; the parent keys each ItemDoc by item id
  // so a different item always remounts fresh, and there's a single editor, so
  // we never need to sync prop → state after mount. Persisted on blur.
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");

  const completed = item.outcome === "completed";
  const carried = item.outcome === "carried";
  const hasMeta = item.presenter || item.durationMins || item.source || carried;

  return (
    <article className="group border-b border-border/60 pb-4">
      <div className="flex items-start gap-2">
        <input
          value={title}
          autoFocus={autoFocus}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title !== item.title) onCommit(item.id, { title }); }}
          placeholder="Untitled item"
          className={cn(
            "flex-1 min-w-0 bg-transparent outline-none text-base font-semibold placeholder:text-muted-foreground/50",
            completed && "line-through text-muted-foreground",
          )}
        />
        <div className="flex items-center gap-0.5 shrink-0 opacity-50 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            title="Complete"
            onClick={() => onOutcome(item, "completed")}
            className={cn("p-1 rounded hover:bg-accent", completed ? "text-green-600" : "text-muted-foreground")}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button
            title="Carry forward"
            onClick={() => onOutcome(item, "carried")}
            className={cn("p-1 rounded hover:bg-accent", carried ? "text-amber-600" : "text-muted-foreground")}
          >
            <ArrowRightCircle className="h-4 w-4" />
          </button>
          <button
            title="Remove item"
            onClick={() => onDelete(item.id)}
            className="p-1 rounded hover:bg-accent text-muted-foreground/50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {hasMeta && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 mb-1">
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
          {item.source && <span className="text-xs text-muted-foreground italic">from {item.source}</span>}
          {carried && <span className="text-xs text-amber-700 dark:text-amber-300">carrying forward</span>}
        </div>
      )}

      <AutoGrowTextarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => { const v = notes || undefined; if (v !== item.notes) onCommit(item.id, { notes: v }); }}
        placeholder="Add notes…"
        className="mt-1 text-sm leading-relaxed text-foreground/90"
      />
    </article>
  );
}

/** Whole-meeting notes as a flowing document; persists on blur. */
function NotesDoc({
  value, placeholder, onCommit,
}: {
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [v, setV] = useState(value);
  return (
    <AutoGrowTextarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== value) onCommit(v); }}
      placeholder={placeholder}
      className="text-sm leading-relaxed text-foreground/90 min-h-[12rem]"
    />
  );
}
