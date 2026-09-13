"use client";

import { useMemo, useState } from "react";
import {
  Plus, Filter, CheckCircle2, RotateCcw, Pencil, Trash2, User, CalendarDays,
  Mail, ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useData, useTasks, newId } from "@/contexts/DataContext";
import type { Task, TaskType, TaskStatus } from "@/types";
import { TASK_TYPE_LABELS, TASK_STATUS_COLORS } from "@/types";
import { formatDate, cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPES: TaskType[] = [
  "todo", "follow_up", "contact", "interview", "calling", "announcement", "general",
];
const STATUSES: TaskStatus[] = ["active", "in_progress", "waiting", "completed", "cancelled"];
const OPEN_STATUSES: TaskStatus[] = ["active", "in_progress", "waiting"];

const STATUS_LABELS: Record<TaskStatus, string> = {
  active:      "Active",
  in_progress: "In progress",
  waiting:     "Waiting",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

const EMPTY_FORM = {
  title: "",
  description: "",
  type: "todo" as TaskType,
  status: "active" as TaskStatus,
  ownerId: "",
  dueDate: "",
};
type TaskForm = typeof EMPTY_FORM;

// ── Page ────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { appUser } = useAuth();
  const members = useData().members;
  const { tasks, addTask, updateTask, completeTask } = useTasks();

  // Any active ward member can own a task, sorted by name for the picker.
  const owners = useMemo(
    () => [...members]
      .filter((m) => m.isActive)
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)),
    [members],
  );

  const [filterStatus, setFilterStatus] = useState<TaskStatus | "open" | "all">("open");
  const [filterType, setFilterType] = useState<TaskType | "all">("all");

  // Task dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Reminder compose dialog: prefilled from the task, editable before sending.
  const [reminder, setReminder] = useState<
    { taskId: string; to: string; subject: string; body: string } | null
  >(null);
  const [sendingReminder, setSendingReminder] = useState(false);

  const openCount = tasks.filter((t) => OPEN_STATUSES.includes(t.status)).length;

  const filtered = useMemo(() => {
    let list = tasks;
    if (filterStatus === "open") list = list.filter((t) => OPEN_STATUSES.includes(t.status));
    else if (filterStatus !== "all") list = list.filter((t) => t.status === filterStatus);
    if (filterType !== "all") list = list.filter((t) => t.type === filterType);

    // Open tasks first, then by due date (soonest first, undated last), then newest.
    return [...list].sort((a, b) => {
      const openA = OPEN_STATUSES.includes(a.status);
      const openB = OPEN_STATUSES.includes(b.status);
      if (openA !== openB) return openA ? -1 : 1;
      const dueA = a.dueDate || "9999-12-31";
      const dueB = b.dueDate || "9999-12-31";
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [tasks, filterStatus, filterType]);

  // ── CRUD ───────────────────────────────────────────────────────────────────

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(t: Task) {
    setEditing(t);
    // Reflect the stored owner in the picker: match on id, then fall back to the
    // name (calling-workflow tasks record an owner name but no id).
    const owner = t.assigneeId
      ? members.find((m) => m.id === t.assigneeId)
      : members.find((m) => `${m.firstName} ${m.lastName}` === t.assigneeName);
    setForm({
      title: t.title,
      description: t.description ?? "",
      type: t.type,
      status: t.status,
      ownerId: owner?.id ?? "",
      dueDate: t.dueDate ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const owner = form.ownerId ? members.find((m) => m.id === form.ownerId) : undefined;
    const patch = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      status: form.status,
      assigneeId: form.ownerId || undefined,
      assigneeName: owner ? `${owner.firstName} ${owner.lastName}` : undefined,
      dueDate: form.dueDate || undefined,
    };
    if (editing) {
      await updateTask(editing.id, { ...patch, updatedAt: new Date().toISOString() });
    } else {
      const now = new Date().toISOString();
      const task: Task = {
        id: newId(),
        ...patch,
        createdBy: appUser?.uid ?? "unknown",
        createdAt: now,
        updatedAt: now,
      };
      await addTask(task);
    }
    setSaving(false);
    setDialogOpen(false);
  }

  async function reopenTask(t: Task) {
    await updateTask(t.id, { status: "active", updatedAt: new Date().toISOString() });
  }

  async function deleteTask(t: Task) {
    // Soft cancel keeps history; completed/cancelled rows are filtered out of the
    // default "open" view.
    await updateTask(t.id, { status: "cancelled", updatedAt: new Date().toISOString() });
  }

  // ── Email reminder ───────────────────────────────────────────────────────────
  // Open a compose dialog prefilled with a reminder to the task's owner. The
  // recipient, subject and body can all be edited before anything is sent.
  function openReminder(t: Task) {
    const owner = t.assigneeId ? members.find((m) => m.id === t.assigneeId) : undefined;
    const firstName = owner?.firstName || t.assigneeName?.split(" ")[0] || "there";
    const subject = `Reminder: ${t.title}`;
    const body = [
      `Hi ${firstName},`,
      "",
      `This is a reminder about a task assigned to you: ${t.title}.`,
      t.description ? `\n${t.description}` : "",
      t.dueDate ? `\nDue: ${formatDate(t.dueDate)}` : "",
      "",
      "Thank you,",
      "The Bishopric",
    ].join("\n");
    setReminder({ taskId: t.id, to: owner?.email ?? "", subject, body });
  }

  // Send the edited reminder via the shared endpoint, falling back to a mailto:
  // link if Gmail isn't configured (409 notConfigured).
  async function submitReminder() {
    if (!reminder || !reminder.to.trim()) return;
    const { taskId, to, subject, body } = reminder;
    setSendingReminder(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject, body }),
      });
      if (res.status === 409) {
        // Email not configured — hand off to the user's own mail client. We
        // don't mark it "sent" since we can't confirm they actually send it.
        window.location.href =
          `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        setReminder(null);
        return;
      }
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Failed to send" }));
        alert(`Couldn't send the reminder: ${error}`);
        return;
      }
      await updateTask(taskId, { reminderSentAt: new Date().toISOString() });
      setReminder(null);
    } catch {
      alert("Couldn't reach the email service. Check your connection and try again.");
    } finally {
      setSendingReminder(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-8 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {openCount} open task{openCount === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          {(["open", "all", ...STATUSES] as (TaskStatus | "open" | "all")[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filterStatus === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              {s === "open" ? "Open" : s === "all" ? "All" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Select value={filterType} onValueChange={(v) => setFilterType(v as TaskType | "all")}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>{TASK_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ListTodo className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            No {filterStatus === "open" ? "open " : filterStatus === "all" ? "" : `${STATUS_LABELS[filterStatus].toLowerCase()} `}tasks
          </p>
          <Button onClick={openNew} variant="outline" size="sm">Add a task</Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => {
            const done = t.status === "completed";
            const closed = done || t.status === "cancelled";
            return (
              <li
                key={t.id}
                className="rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex items-start gap-2">
                  {done && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn("text-sm font-medium", closed && "line-through text-muted-foreground")}>
                        {t.title}
                      </p>
                      <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        {TASK_TYPE_LABELS[t.type]}
                      </span>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full", TASK_STATUS_COLORS[t.status])}>
                        {STATUS_LABELS[t.status]}
                      </span>
                    </div>
                    {t.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {t.assigneeName && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" /> {t.assigneeName}
                        </span>
                      )}
                      {t.dueDate && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarDays className="h-3 w-3" /> {formatDate(t.dueDate)}
                        </span>
                      )}
                      {t.reminderSentAt && (
                        <span className="text-xs text-green-700 dark:text-green-400">reminder sent</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {closed ? (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => reopenTask(t)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Reopen
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => completeTask(t.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                    </Button>
                  )}
                  {!closed && (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openReminder(t)}>
                      <Mail className="h-3.5 w-3.5" /> Send reminder
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  {t.status !== "cancelled" && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 gap-1.5 text-muted-foreground hover:text-red-600"
                      onClick={() => deleteTask(t)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Task dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Follow up with the Elders Quorum president"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as TaskType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{TASK_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as TaskStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select
                  value={form.ownerId || "__none"}
                  onValueChange={(v) => setForm((f) => ({ ...f, ownerId: v === "__none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Unassigned</SelectItem>
                    {owners.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-due">Due date</Label>
                <Input
                  id="task-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              The owner is the ward member responsible for the task. Assigning one whose record has an email enables reminders.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="task-notes">Notes</Label>
              <Textarea
                id="task-notes"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional details"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reminder compose dialog ── */}
      <Dialog open={!!reminder} onOpenChange={(o) => !o && setReminder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send reminder</DialogTitle>
          </DialogHeader>
          {reminder && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reminder-to">To</Label>
                <Input
                  id="reminder-to"
                  type="email"
                  value={reminder.to}
                  onChange={(e) => setReminder((r) => (r ? { ...r, to: e.target.value } : r))}
                  placeholder="owner@example.com"
                />
                {!reminder.to.trim() && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    This owner has no email on file — enter a recipient to send.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-subject">Subject</Label>
                <Input
                  id="reminder-subject"
                  value={reminder.subject}
                  onChange={(e) => setReminder((r) => (r ? { ...r, subject: e.target.value } : r))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-body">Message</Label>
                <Textarea
                  id="reminder-body"
                  value={reminder.body}
                  onChange={(e) => setReminder((r) => (r ? { ...r, body: e.target.value } : r))}
                  rows={9}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReminder(null)}>Cancel</Button>
            <Button onClick={submitReminder} disabled={sendingReminder || !reminder?.to.trim()}>
              {sendingReminder ? "Sending…" : "Send reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
