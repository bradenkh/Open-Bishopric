"use client";

import { useMemo, useState } from "react";
import {
  Plus, NotebookPen, Trash2, Pencil, CalendarDays, ListChecks, PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useData, newId } from "@/contexts/DataContext";
import type { MeetingAgenda } from "@/types";
import { MeetingMode } from "@/components/meetings/meeting-mode";
import { formatDate, formatRelativeTime, cn } from "@/lib/utils";

/** A short plain-text preview of a markdown agenda for the list card. */
function preview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")     // fenced code
    .replace(/[#>*_`~[\]()!-]/g, " ")    // markdown punctuation
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

const STARTER = "# Agenda\n\n- \n";

export default function MeetingsPage() {
  const { user } = useAuth();
  const { agendas, tasks, loading } = useData();
  const items = agendas.items;

  // Open to-do count per agenda (tasks linked via context.agendaId).
  const openTodosByAgenda = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      const agendaId = t.context?.agendaId as string | undefined;
      if (!agendaId) continue;
      if (t.status === "completed" || t.status === "cancelled") continue;
      counts[agendaId] = (counts[agendaId] ?? 0) + 1;
    }
    return counts;
  }, [tasks]);

  // The agenda currently open in meeting mode.
  const [openId, setOpenId] = useState<string | null>(null);
  const openAgenda = useMemo(
    () => items.find((a) => a.id === openId) ?? null,
    [items, openId],
  );

  // Create / rename dialog.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MeetingAgenda | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");

  function openCreate() {
    setEditing(null);
    setFormTitle("");
    setFormDate("");
    setDialogOpen(true);
  }

  function openRename(agenda: MeetingAgenda) {
    setEditing(agenda);
    setFormTitle(agenda.title);
    setFormDate(agenda.meetingDate ?? "");
    setDialogOpen(true);
  }

  async function handleSave() {
    const title = formTitle.trim() || "Untitled agenda";
    if (editing) {
      await agendas.update(editing.id, { title, meetingDate: formDate || undefined });
      setDialogOpen(false);
      return;
    }
    const now = new Date().toISOString();
    const agenda: MeetingAgenda = {
      id: newId(),
      title,
      content: STARTER,
      notes: "",
      meetingDate: formDate || undefined,
      createdBy: user?.uid ?? "unknown",
      createdAt: now,
      updatedAt: now,
    };
    await agendas.create(agenda);
    setDialogOpen(false);
    setOpenId(agenda.id); // jump straight into the new agenda
  }

  async function handleDelete(agenda: MeetingAgenda) {
    if (!confirm(`Delete "${agenda.title}"? This can't be undone.`)) return;
    await agendas.remove(agenda.id);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Meetings</h1>
          <p className="text-sm text-muted-foreground">
            Each meeting is an editable agenda. Open one to run it with to-dos and notes.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="mr-1.5 h-4 w-4" />
          New agenda
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <NotebookPen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No agendas yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first meeting agenda to get started.
          </p>
          <Button onClick={openCreate} variant="outline" className="mt-4">
            <Plus className="mr-1.5 h-4 w-4" />
            New agenda
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((agenda) => {
            const openTodos = openTodosByAgenda[agenda.id] ?? 0;
            const snippet = preview(agenda.content ?? "");
            return (
              <li key={agenda.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenId(agenda.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenId(agenda.id);
                    }
                  }}
                  className="group flex h-full cursor-pointer flex-col rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {agenda.title}
                    </h2>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRename(agenda);
                        }}
                        aria-label="Rename"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(agenda);
                        }}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                    {snippet || "Empty agenda"}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {agenda.meetingDate && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(agenda.meetingDate)}
                      </span>
                    )}
                    {openTodos > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <ListChecks className="h-3.5 w-3.5" />
                        {openTodos} to-do{openTodos === 1 ? "" : "s"}
                      </span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                      <PlayCircle className="h-3.5 w-3.5" />
                      Open
                    </span>
                  </div>
                  <span className="mt-1 text-[11px] text-muted-foreground/70">
                    Updated {formatRelativeTime(agenda.updatedAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Meeting mode overlay */}
      {openAgenda && (
        <MeetingMode
          key={openAgenda.id}
          agenda={openAgenda}
          onClose={() => setOpenId(null)}
        />
      )}

      {/* Create / rename dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Rename agenda" : "New agenda"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="agenda-title">Title</Label>
              <Input
                id="agenda-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Bishopric Meeting"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSave();
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agenda-date">Meeting date (optional)</Label>
              <Input
                id="agenda-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className={cn(!formDate && "text-muted-foreground")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()}>
              {editing ? "Save" : "Create & open"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
