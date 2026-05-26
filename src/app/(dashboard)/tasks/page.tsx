"use client";

import { useState } from "react";
import { Plus, Filter, CheckCircle2, ClipboardList, Church, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import type { Task, TaskType, TaskStatus } from "@/types";
import { TASK_TYPE_LABELS, TASK_STATUS_COLORS } from "@/types";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES: TaskStatus[] = ["active", "in_progress", "waiting", "completed", "cancelled"];
const TYPES: TaskType[] = [
  "interview", "follow_up", "contact", "todo", "calling",
  "agenda_item", "announcement", "general",
];

const EMPTY_FORM = {
  title: "", description: "", type: "general" as TaskType,
  status: "active" as TaskStatus, memberName: "", dueDate: "",
};

// ── Task type badge colors ─────────────────────────────────────────────────────

const CALLING_TASK_COLORS: Record<string, { badge: string; border: string }> = {
  extend:     { badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",   border: "border-l-blue-400" },
  set_apart:  { badge: "bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200", border: "border-l-violet-400" },
  lcr_update: { badge: "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200",   border: "border-l-teal-400" },
};

const CALLING_TASK_LABELS: Record<string, string> = {
  extend:     "Extend Calling",
  set_apart:  "Set Apart",
  lcr_update: "Update LCR",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const { user }  = useAuth();
  const { tasks, addTask, updateTask, completeTask } = useTasks();

  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("active");
  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [editingTask,  setEditingTask]  = useState<Task | null>(null);
  const [form,         setForm]         = useState(EMPTY_FORM);
  const [saving,       setSaving]       = useState(false);

  const filtered =
    filterStatus === "all"
      ? tasks
      : tasks.filter((t) => t.status === filterStatus);

  // Sort: calling tasks first (within the filter), then by createdAt desc
  const sorted = [...filtered].sort((a, b) => {
    const aIsCalling = a.type === "calling" && a.context?.taskType;
    const bIsCalling = b.type === "calling" && b.context?.taskType;
    if (aIsCalling && !bIsCalling) return -1;
    if (!aIsCalling && bIsCalling) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  function openNew() {
    setEditingTask(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(t: Task) {
    setEditingTask(t);
    setForm({
      title:       t.title,
      description: t.description ?? "",
      type:        t.type,
      status:      t.status,
      memberName:  t.memberName ?? "",
      dueDate:     t.dueDate ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 150));
    const now = new Date().toISOString();
    if (editingTask) {
      updateTask(editingTask.id, { ...form, updatedAt: now });
    } else {
      const newTask: Task = {
        id:        `t-${Date.now()}`,
        ...form,
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      };
      addTask(newTask);
    }
    setDialogOpen(false);
    setSaving(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-8 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {tasks.filter((t) => t.status === "active" || t.status === "in_progress").length} open
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {(["all", ...STATUSES] as (TaskStatus | "all")[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize",
              filterStatus === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Task list */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {filterStatus === "all" ? "No tasks yet" : `No ${filterStatus.replace("_", " ")} tasks`}
          </p>
          <Button onClick={openNew} variant="outline" size="sm">Create a task</Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((t) => {
            const callingTaskType = t.context?.taskType as string | undefined;
            const callingColors   = callingTaskType ? CALLING_TASK_COLORS[callingTaskType] : null;
            const isCallingTask   = t.type === "calling" && callingTaskType;

            return (
              <li
                key={t.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border bg-card p-4",
                  "hover:shadow-sm transition-shadow cursor-pointer",
                  isCallingTask
                    ? cn("border-l-4", callingColors?.border ?? "border-l-primary")
                    : "border-border"
                )}
                onClick={() => openEdit(t)}
              >
                {/* Check button */}
                <button
                  className="mt-0.5 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (t.status !== "completed") completeTask(t.id);
                  }}
                  title="Mark complete"
                >
                  <CheckCircle2
                    className={cn(
                      "h-5 w-5 transition-colors",
                      t.status === "completed"
                        ? "text-green-600"
                        : "text-muted-foreground/40 hover:text-primary"
                    )}
                  />
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Title row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn(
                      "text-sm font-medium",
                      t.status === "completed" && "line-through text-muted-foreground"
                    )}>
                      {t.title}
                    </p>

                    {/* Type badge — calling tasks get a special badge */}
                    {isCallingTask ? (
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium",
                        callingColors?.badge
                      )}>
                        <Church className="h-3 w-3" />
                        {CALLING_TASK_LABELS[callingTaskType!] ?? "Calling"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {TASK_TYPE_LABELS[t.type]}
                      </span>
                    )}
                  </div>

                  {/* Assignee — prominently shown for calling tasks */}
                  {t.assigneeName && (
                    <div className="flex items-center gap-1 mt-1">
                      <User className="h-3 w-3 text-muted-foreground shrink-0" />
                      <p className={cn(
                        "text-xs",
                        isCallingTask ? "text-foreground font-medium" : "text-muted-foreground"
                      )}>
                        {t.assigneeName}
                      </p>
                    </div>
                  )}

                  {/* Related member */}
                  {t.memberName && t.memberName !== t.assigneeName && (
                    <p className="text-xs text-muted-foreground mt-0.5">Re: {t.memberName}</p>
                  )}

                  {/* Description */}
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                  )}

                  {/* Due date */}
                  {t.dueDate && (
                    <p className="text-xs text-muted-foreground mt-1">Due {formatDate(t.dueDate)}</p>
                  )}

                  {/* LCR update prompt */}
                  {callingTaskType === "lcr_update" && t.status !== "completed" && (
                    <p className="text-xs text-teal-700 dark:text-teal-300 mt-1 font-medium">
                      ⚠ Update in LCR → Leader &amp; Clerk Resources
                    </p>
                  )}
                </div>

                {/* Status badge */}
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full shrink-0 capitalize",
                  TASK_STATUS_COLORS[t.status]
                )}>
                  {t.status.replace("_", " ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Task dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Task title"
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
                      <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memberName">Related Member</Label>
              <Input
                id="memberName"
                value={form.memberName}
                onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))}
                placeholder="Name (optional)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional notes"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
              {saving ? "Saving…" : editingTask ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
