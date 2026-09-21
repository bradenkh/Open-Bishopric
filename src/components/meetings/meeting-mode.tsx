"use client";

/**
 * Full-screen "run the meeting" view for a single agenda.
 *
 * Three panes:
 *   • Left half         — the agenda itself, edited visually (MDXEditor).
 *   • Right, top half    — assignments & to-dos. These are real Task records
 *                          (the same `tasks` table the Tasks screen uses),
 *                          linked to this agenda via context.agendaId, so
 *                          anything captured here shows up on the Tasks screen
 *                          and can be reminded/worked from there too.
 *   • Right, bottom half — free-form meeting notes, also edited visually.
 *
 * The agenda and notes are stored as markdown on the agenda row; every pane
 * autosaves through the DataContext.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Trash2, Check, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/meetings/markdown-editor";
import { AssigneeInput, type AssigneeValue } from "@/components/meetings/assignee-input";
import { useData, newId } from "@/contexts/DataContext";
import type { MeetingAgenda, Member, Task, TaskStatus } from "@/types";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved";

const OPEN_STATUSES: TaskStatus[] = ["active", "in_progress", "waiting"];
const isOpen = (s: TaskStatus) => OPEN_STATUSES.includes(s);

/** New assignments default to a two-week turnaround. */
function defaultDue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

/** Resolve a picked/typed assignee into a canonical {id, name} for a Task. */
function resolveAssignee(
  v: AssigneeValue,
  members: Member[],
): { assigneeId?: string; assigneeName?: string } {
  const owner = v.id
    ? members.find((m) => m.id === v.id)
    : members.find(
        (m) => `${m.firstName} ${m.lastName}`.toLowerCase() === v.name.trim().toLowerCase(),
      );
  return {
    assigneeId: owner ? owner.id : undefined,
    assigneeName: owner ? `${owner.firstName} ${owner.lastName}` : v.name.trim() || undefined,
  };
}

export function MeetingMode({
  agenda,
  onClose,
}: {
  agenda: MeetingAgenda;
  onClose: () => void;
}) {
  const { agendas, members, tasks, addTask, updateTask } = useData();

  // Local working copies for the agenda row (opened fresh; keyed by id).
  const [title, setTitle] = useState(agenda.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // MDXEditor is uncontrolled: pin the starting markdown once so our own
  // autosaves (which re-render the parent) never re-feed the editors and jump
  // the cursor. Keyed by id, so a different agenda remounts with fresh content.
  const [initialContent] = useState(agenda.content ?? "");
  const [initialNotes] = useState(agenda.notes ?? "");

  // Quick-add state (the primary action while running a meeting).
  const [newText, setNewText] = useState("");
  const [newAssignee, setNewAssignee] = useState<AssigneeValue>({ name: "" });
  const [newDue, setNewDue] = useState(defaultDue);
  const newTextRef = useRef<HTMLInputElement>(null);

  const todayISO = new Date().toISOString().slice(0, 10);

  // Tasks belonging to this agenda (open first, then by due date, then newest).
  const agendaTasks = useMemo(() => {
    return tasks
      .filter((t) => t.context?.agendaId === agenda.id && t.status !== "cancelled")
      .sort((a, b) => {
        const openA = isOpen(a.status);
        const openB = isOpen(b.status);
        if (openA !== openB) return openA ? -1 : 1;
        const dueA = a.dueDate || "9999-12-31";
        const dueB = b.dueDate || "9999-12-31";
        if (dueA !== dueB) return dueA.localeCompare(dueB);
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [tasks, agenda.id]);

  const openCount = agendaTasks.filter((t) => isOpen(t.status)).length;

  // ── Debounced persistence for the agenda row (title / content / notes) ────────
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveIndicator = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flagSaved = useCallback(() => {
    setSaveState("saved");
    if (saveIndicator.current) clearTimeout(saveIndicator.current);
    saveIndicator.current = setTimeout(() => setSaveState("idle"), 1500);
  }, []);

  const save = useCallback(
    (patch: Partial<MeetingAgenda>, key: string, delay = 600) => {
      setSaveState("saving");
      if (timers.current[key]) clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => {
        void agendas.update(agenda.id, { ...patch, updatedAt: new Date().toISOString() });
        flagSaved();
      }, delay);
    },
    [agendas, agenda.id, flagSaved],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      Object.values(pending).forEach(clearTimeout);
      if (saveIndicator.current) clearTimeout(saveIndicator.current);
    };
  }, []);

  // Close on Escape (unless focus is in a text field, so Esc can cancel typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (!typing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Agenda-row handlers ───────────────────────────────────────────────────────
  function onTitleChange(value: string) {
    setTitle(value);
    save({ title: value }, "title");
  }
  function onContentChange(markdown: string) {
    save({ content: markdown }, "content");
  }
  function onNotesChange(markdown: string) {
    save({ notes: markdown }, "notes");
  }

  // ── Task handlers ─────────────────────────────────────────────────────────────
  function addTaskItem() {
    const text = newText.trim();
    if (!text) return;
    const now = new Date().toISOString();
    const task: Task = {
      id: newId(),
      title: text,
      type: "todo",
      status: "active",
      ...resolveAssignee(newAssignee, members),
      dueDate: newDue || undefined,
      context: { agendaId: agenda.id, agendaTitle: agenda.title },
      createdBy: agenda.createdBy ?? "unknown",
      createdAt: now,
      updatedAt: now,
    };
    void addTask(task);
    setNewText("");
    setNewAssignee({ name: "" });
    setNewDue(defaultDue());
    newTextRef.current?.focus(); // rapid-fire capture
  }

  function patchTask(id: string, patch: Partial<Task>) {
    void updateTask(id, { ...patch, updatedAt: new Date().toISOString() });
  }
  function toggleTask(t: Task) {
    patchTask(t.id, { status: isOpen(t.status) ? "completed" : "active" });
  }
  function removeTask(t: Task) {
    // Soft-cancel to match the Tasks screen (keeps history; filtered out here).
    patchTask(t.id, { status: "cancelled" });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
        <Button variant="ghost" size="icon" onClick={onClose} title="Close (Esc)" aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled agenda"
          className="h-9 flex-1 border-none bg-transparent px-1 text-base font-semibold shadow-none focus-visible:ring-0"
        />
        <span
          className={cn(
            "hidden shrink-0 text-xs text-muted-foreground sm:inline",
            saveState === "idle" && "opacity-0",
          )}
        >
          {saveState === "saving" ? "Saving…" : "Saved"}
        </span>
      </header>

      {/* Panes */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left: agenda (visual markdown) */}
        <section className="flex min-h-0 flex-1 flex-col lg:w-1/2 lg:flex-none lg:border-r lg:border-border">
          <div className="mdx-agenda-shell min-h-0 flex-1 overflow-y-auto">
            <MarkdownEditor
              markdown={initialContent}
              onChange={onContentChange}
              placeholder="Write the agenda…"
            />
          </div>
        </section>

        {/* Right: to-dos (top) + notes (bottom) */}
        <section className="flex min-h-0 flex-1 flex-col border-t border-border lg:w-1/2 lg:flex-none lg:border-t-0">
          {/* Assignments / to-dos */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-border">
            <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Assignments &amp; to-dos
              </h2>
              {agendaTasks.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {openCount} open · {agendaTasks.length - openCount} done
                </span>
              )}
            </div>

            {/* Quick-add — creates a real Task linked to this agenda. */}
            <div className="shrink-0 px-4 pb-3">
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2 sm:flex-row sm:items-center">
                <Input
                  ref={newTextRef}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTaskItem();
                    }
                  }}
                  placeholder="New assignment or to-do…"
                  className="h-9 flex-1 bg-background"
                />
                <div className="flex items-center gap-2">
                  <AssigneeInput
                    value={newAssignee}
                    onChange={setNewAssignee}
                    members={members}
                    onEnter={addTaskItem}
                    className="w-full sm:w-40"
                  />
                  <Input
                    type="date"
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTaskItem();
                      }
                    }}
                    title="Due date (optional)"
                    className={cn("h-9 w-[8.5rem] bg-background", !newDue && "text-muted-foreground")}
                  />
                  <Button className="h-9 shrink-0" onClick={addTaskItem} disabled={!newText.trim()}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-3">
              {agendaTasks.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  Assignments you add during the meeting show up here — and on the Tasks screen.
                </li>
              )}
              {agendaTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  members={members}
                  todayISO={todayISO}
                  onToggle={() => toggleTask(task)}
                  onPatch={(patch) => patchTask(task.id, patch)}
                  onRemove={() => removeTask(task)}
                />
              ))}
            </ul>
          </div>

          {/* Notes (visual markdown) */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-4 pt-3 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </h2>
            </div>
            <div className="mdx-agenda-shell min-h-0 flex-1 overflow-y-auto">
              <MarkdownEditor
                compact
                markdown={initialNotes}
                onChange={onNotesChange}
                placeholder="Notes taken during the meeting…"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** One task line: checkbox, editable title, assignee typeahead, due date, delete. */
function TaskRow({
  task,
  members,
  todayISO,
  onToggle,
  onPatch,
  onRemove,
}: {
  task: Task;
  members: Member[];
  todayISO: string;
  onToggle: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onRemove: () => void;
}) {
  const done = task.status === "completed";
  const overdue = !!task.dueDate && !done && task.dueDate < todayISO;
  const [title, setTitle] = useState(task.title);

  function commitTitle() {
    const next = title.trim();
    if (next && next !== task.title) onPatch({ title: next });
    else if (!next) setTitle(task.title); // don't allow empty
  }

  return (
    <li className="group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-1 hover:bg-accent/40">
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
          done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary",
        )}
      >
        {done && <Check className="h-3.5 w-3.5" />}
      </button>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn(
          "min-w-[6rem] flex-1 bg-transparent py-1 text-sm outline-none",
          done && "text-muted-foreground line-through",
        )}
      />
      <AssigneeInput
        value={{ id: task.assigneeId, name: task.assigneeName ?? "" }}
        onChange={(v) => onPatch(resolveAssignee(v, members))}
        members={members}
        placeholder="Unassigned"
        className="w-32"
      />
      <div
        className={cn(
          "flex items-center gap-1",
          overdue ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <CalendarClock className="h-3.5 w-3.5 shrink-0" />
        <input
          type="date"
          value={task.dueDate ?? ""}
          onChange={(e) => onPatch({ dueDate: e.target.value || undefined })}
          title="Due date"
          className={cn(
            "w-[7.5rem] bg-transparent py-1 text-xs outline-none",
            !task.dueDate && "text-muted-foreground/60",
          )}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Delete to-do"
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
