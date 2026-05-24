"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, Filter, CheckCircle2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import type { Task, TaskType, TaskStatus } from "@/types";
import { TASK_TYPE_LABELS, TASK_STATUS_COLORS } from "@/types";
import { formatDate } from "@/lib/utils";

const STATUSES: TaskStatus[] = ["active", "in_progress", "waiting", "completed", "cancelled"];
const TYPES: TaskType[] = [
  "interview", "follow_up", "contact", "todo", "calling",
  "agenda_item", "announcement", "general",
];

const EMPTY_FORM = {
  title: "",
  description: "",
  type: "general" as TaskType,
  status: "active" as TaskStatus,
  memberName: "",
  dueDate: "",
};

export default function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("active");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function fetchTasks() {
    const snap = await getDocs(query(collection(db, "tasks"), orderBy("createdAt", "desc")));
    setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task)));
    setLoading(false);
  }

  useEffect(() => { fetchTasks(); }, []);

  const filtered = filterStatus === "all"
    ? tasks
    : tasks.filter((t) => t.status === filterStatus);

  function openNew() {
    setEditingTask(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(t: Task) {
    setEditingTask(t);
    setForm({
      title: t.title,
      description: t.description ?? "",
      type: t.type,
      status: t.status,
      memberName: t.memberName ?? "",
      dueDate: t.dueDate ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    try {
      if (editingTask) {
        await updateDoc(doc(db, "tasks", editingTask.id), {
          ...form,
          updatedAt: now,
        });
      } else {
        await addDoc(collection(db, "tasks"), {
          ...form,
          createdBy: user?.uid ?? "",
          createdAt: now,
          updatedAt: now,
        });
      }
      await fetchTasks();
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function markComplete(t: Task) {
    await updateDoc(doc(db, "tasks", t.id), {
      status: "completed",
      updatedAt: new Date().toISOString(),
    });
    await fetchTasks();
  }

  return (
    <div className="p-4 lg:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {(["all", ...STATUSES] as (TaskStatus | "all")[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
              filterStatus === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ClipboardList className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {filterStatus === "all" ? "No tasks yet" : `No ${filterStatus.replace("_", " ")} tasks`}
          </p>
          <Button onClick={openNew} variant="outline" size="sm">
            Create a task
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => openEdit(t)}
            >
              <button
                className="mt-0.5 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  if (t.status !== "completed") markComplete(t);
                }}
                title="Mark complete"
              >
                <CheckCircle2
                  className={`h-5 w-5 ${
                    t.status === "completed"
                      ? "text-green-600"
                      : "text-muted-foreground/40 hover:text-primary"
                  }`}
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-sm font-medium ${t.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                    {t.title}
                  </p>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {TASK_TYPE_LABELS[t.type]}
                  </span>
                </div>
                {t.memberName && (
                  <p className="text-xs text-muted-foreground mt-0.5">{t.memberName}</p>
                )}
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                )}
                {t.dueDate && (
                  <p className="text-xs text-muted-foreground mt-1">Due {formatDate(t.dueDate)}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 capitalize ${TASK_STATUS_COLORS[t.status]}`}>
                {t.status.replace("_", " ")}
              </span>
            </li>
          ))}
        </ul>
      )}

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
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as TaskType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TASK_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as TaskStatus }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s.replace("_", " ")}
                      </SelectItem>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
              {saving ? "Saving…" : editingTask ? "Save Changes" : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
