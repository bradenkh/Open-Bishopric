"use client";

/**
 * Full-screen "run the meeting" view for a single agenda.
 *
 * Three panes:
 *   • Left half        — the agenda itself, edited visually (MDXEditor) so the
 *                        markdown renders while you edit it, no raw syntax.
 *   • Right, top half   — a working to-do checklist.
 *   • Right, bottom half — free-form meeting notes.
 *
 * Every pane autosaves (debounced) back to the `meeting_agendas` row through the
 * DataContext, which persists optimistically to Supabase.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const [notes, setNotes] = useState(agenda.notes ?? "");
  // MDXEditor is uncontrolled: pin the starting markdown once so our own
  // autosaves (which re-render the parent with new content) never re-feed the
  // editor and jump the cursor. The component is keyed by id, so opening a
  // different agenda remounts with fresh content.
  const [initialContent] = useState(agenda.content ?? "");
  const [newTodo, setNewTodo] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

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

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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

  function onNotesChange(value: string) {
    setNotes(value);
    save({ notes: value }, "notes");
  }

  function persistTodos(next: AgendaTodo[], immediate = false) {
    setTodos(next);
    save({ todos: next }, "todos", immediate ? 0 : 600);
  }

  function addTodo() {
    const text = newTodo.trim();
    if (!text) return;
    persistTodos([...todos, { id: newId(), text, done: false }], true);
    setNewTodo("");
  }

  function toggleTodo(id: string) {
    persistTodos(
      todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      true,
    );
  }

  function editTodo(id: string, text: string) {
    persistTodos(todos.map((t) => (t.id === id ? { ...t, text } : t)));
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
          {/* To-dos */}
          <div className="flex min-h-0 flex-1 flex-col border-b border-border">
            <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                To-dos
              </h2>
              {todos.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {openCount} open · {todos.length - openCount} done
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
              <Input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTodo();
                  }
                }}
                placeholder="Add a to-do and press Enter"
                className="h-9"
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={addTodo} aria-label="Add to-do">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-3">
              {todos.length === 0 && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  No to-dos yet.
                </li>
              )}
              {todos.map((todo) => (
                <li key={todo.id} className="group flex items-center gap-2">
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
                    onChange={(e) => editTodo(todo.id, e.target.value)}
                    className={cn(
                      "flex-1 bg-transparent py-1 text-sm outline-none",
                      todo.done && "text-muted-foreground line-through",
                    )}
                  />
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

          {/* Notes */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-4 pt-3 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </h2>
            </div>
            <Textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Notes taken during the meeting…"
              className="min-h-0 flex-1 resize-none rounded-none border-0 px-4 pb-4 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
