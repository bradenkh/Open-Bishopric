"use client";

/**
 * Full-screen "run the meeting" view for a single agenda.
 *
 * Three panes:
 *   • Left half         — the agenda itself, edited visually (MDXEditor).
 *   • Right, top half    — a working to-do list built for capturing assignments
 *                          in real time: a persistent quick-add row (task +
 *                          optional assignee) sits on top of the running list.
 *   • Right, bottom half — free-form meeting notes, also edited visually.
 *
 * The agenda and notes are stored as markdown; every pane autosaves (debounced)
 * back to the `meeting_agendas` row through the DataContext.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, Check, User, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/meetings/markdown-editor";
import { useData, newId } from "@/contexts/DataContext";
import type { AgendaTodo, MeetingAgenda } from "@/types";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved";

export function MeetingMode({
  agenda,
  onClose,
}: {
  agenda: MeetingAgenda;
  onClose: () => void;
}) {
  const { agendas } = useData();

  // Local working copies. The agenda is opened fresh (this component is keyed by
  // id), so seeding from props on mount is safe.
  const [title, setTitle] = useState(agenda.title);
  const [todos, setTodos] = useState<AgendaTodo[]>(agenda.todos ?? []);
  const [newText, setNewText] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDue, setNewDue] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const todayISO = new Date().toISOString().slice(0, 10);

  // MDXEditor is uncontrolled: pin the starting markdown once so our own
  // autosaves (which re-render the parent with new content) never re-feed the
  // editors and jump the cursor. The component is keyed by id, so opening a
  // different agenda remounts with fresh content.
  const [initialContent] = useState(agenda.content ?? "");
  const [initialNotes] = useState(agenda.notes ?? "");

  const newTextRef = useRef<HTMLInputElement>(null);

  // ── Debounced persistence ───────────────────────────────────────────────────
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

  // Flush pending saves on unmount so nothing in flight is lost.
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

  // ── Handlers ────────────────────────────────────────────────────────────────
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

  function persistTodos(next: AgendaTodo[], immediate = false) {
    setTodos(next);
    save({ todos: next }, "todos", immediate ? 0 : 600);
  }

  function addTodo() {
    const text = newText.trim();
    if (!text) return;
    persistTodos(
      [
        ...todos,
        {
          id: newId(),
          text,
          done: false,
          assignee: newAssignee.trim() || undefined,
          dueDate: newDue || undefined,
        },
      ],
      true,
    );
    setNewText("");
    setNewAssignee("");
    setNewDue("");
    // Keep focus on the task field for rapid-fire capture during the meeting.
    newTextRef.current?.focus();
  }

  function toggleTodo(id: string) {
    persistTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)), true);
  }

  function editTodo(id: string, patch: Partial<AgendaTodo>) {
    persistTodos(todos.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function removeTodo(id: string) {
    persistTodos(todos.filter((t) => t.id !== id), true);
  }

  const openCount = todos.filter((t) => !t.done).length;

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
          {/* To-dos / assignments */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-border">
            <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Assignments &amp; to-dos
              </h2>
              {todos.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {openCount} open · {todos.length - openCount} done
                </span>
              )}
            </div>

            {/* Quick-add — the primary action during a meeting. */}
            <div className="shrink-0 px-4 pb-3">
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2 sm:flex-row sm:items-center">
                <Input
                  ref={newTextRef}
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTodo();
                    }
                  }}
                  placeholder="New assignment or to-do…"
                  className="h-9 flex-1 bg-background"
                />
                <div className="flex items-center gap-2">
                  <Input
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTodo();
                      }
                    }}
                    placeholder="Assign to (optional)"
                    className="h-9 w-full bg-background sm:w-36"
                  />
                  <Input
                    type="date"
                    value={newDue}
                    onChange={(e) => setNewDue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTodo();
                      }
                    }}
                    title="Due date (optional)"
                    className={cn("h-9 w-[8.5rem] bg-background", !newDue && "text-muted-foreground")}
                  />
                  <Button
                    className="h-9 shrink-0"
                    onClick={addTodo}
                    disabled={!newText.trim()}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-3">
              {todos.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  Assignments you add during the meeting show up here.
                </li>
              )}
              {todos.map((todo) => (
                <li
                  key={todo.id}
                  className="group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-1 hover:bg-accent/40"
                >
                  <button
                    type="button"
                    onClick={() => toggleTodo(todo.id)}
                    aria-label={todo.done ? "Mark not done" : "Mark done"}
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                      todo.done
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/40 hover:border-primary",
                    )}
                  >
                    {todo.done && <Check className="h-3.5 w-3.5" />}
                  </button>
                  <input
                    value={todo.text}
                    onChange={(e) => editTodo(todo.id, { text: e.target.value })}
                    className={cn(
                      "min-w-[6rem] flex-1 bg-transparent py-1 text-sm outline-none",
                      todo.done && "text-muted-foreground line-through",
                    )}
                  />
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <input
                      value={todo.assignee ?? ""}
                      onChange={(e) =>
                        editTodo(todo.id, { assignee: e.target.value || undefined })
                      }
                      placeholder="Unassigned"
                      className="w-24 bg-transparent py-1 text-xs outline-none placeholder:text-muted-foreground/60 focus:w-28"
                    />
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-1",
                      todo.dueDate && !todo.done && todo.dueDate < todayISO
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                    <input
                      type="date"
                      value={todo.dueDate ?? ""}
                      onChange={(e) =>
                        editTodo(todo.id, { dueDate: e.target.value || undefined })
                      }
                      title="Due date"
                      className={cn(
                        "w-[7.5rem] bg-transparent py-1 text-xs outline-none",
                        !todo.dueDate && "text-muted-foreground/60",
                      )}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTodo(todo.id)}
                    aria-label="Delete to-do"
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
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
