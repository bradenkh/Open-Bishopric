"use client";

import { useState } from "react";
import {
  Plus, Filter, CalendarClock, Clock, User, Pencil, CheckCircle2,
  CalendarPlus, MessageSquareWarning,
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
import type { Interview, InterviewType, InterviewStatus } from "@/types";
import { INTERVIEW_TYPE_LABELS, INTERVIEW_STATUS_COLORS } from "@/types";
import { MOCK_INTERVIEWS, MOCK_BISHOPRIC_MEMBERS } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPES: InterviewType[] = [
  "temple_recommend", "temple_recommend_youth", "calling", "ministering",
  "tithing_settlement", "youth", "worthiness", "other",
];
const STATUSES: InterviewStatus[] = ["needs_scheduling", "scheduled", "completed", "cancelled"];

const EMPTY_FORM = {
  memberName: "", type: "temple_recommend" as InterviewType,
  status: "needs_scheduling" as InterviewStatus, interviewer: "",
  scheduledDate: "", scheduledTime: "", notes: "",
};

function formatTime(time?: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InterviewsPage() {
  const { user } = useAuth();
  const [interviews,   setInterviews]   = useState<Interview[]>([...MOCK_INTERVIEWS]);
  const [filterStatus, setFilterStatus] = useState<InterviewStatus | "all">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<Interview | null>(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);

  const needsScheduling = interviews.filter((i) => i.status === "needs_scheduling");
  const upcoming        = interviews
    .filter((i) => i.status === "scheduled" && i.scheduledDate)
    .sort((a, b) =>
      new Date(`${a.scheduledDate}T${a.scheduledTime ?? "00:00"}`).getTime()
    - new Date(`${b.scheduledDate}T${b.scheduledTime ?? "00:00"}`).getTime());

  const filtered =
    filterStatus === "all" ? interviews : interviews.filter((i) => i.status === filterStatus);

  // Sort: needs_scheduling first, then scheduled by date, then the rest by recency
  const sorted = [...filtered].sort((a, b) => {
    const rank = (s: InterviewStatus) =>
      s === "needs_scheduling" ? 0 : s === "scheduled" ? 1 : 2;
    if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
    if (a.status === "scheduled" && b.status === "scheduled") {
      return new Date(`${a.scheduledDate}T${a.scheduledTime ?? "00:00"}`).getTime()
           - new Date(`${b.scheduledDate}T${b.scheduledTime ?? "00:00"}`).getTime();
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  // ── CRUD ─────────────────────────────────────────────────────────────────

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(i: Interview) {
    setEditing(i);
    setForm({
      memberName: i.memberName, type: i.type, status: i.status,
      interviewer: i.interviewer ?? "", scheduledDate: i.scheduledDate ?? "",
      scheduledTime: i.scheduledTime ?? "", notes: i.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.memberName.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 150));
    const now = new Date().toISOString();
    // If a date is set and still marked needs_scheduling, promote to scheduled.
    const status: InterviewStatus =
      form.status === "needs_scheduling" && form.scheduledDate ? "scheduled" : form.status;
    if (editing) {
      setInterviews((prev) => prev.map((i) => i.id === editing.id ? { ...i, ...form, status, updatedAt: now } : i));
    } else {
      const newInterview: Interview = {
        id: `int-${Date.now()}`,
        ...form,
        status,
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      };
      setInterviews((prev) => [newInterview, ...prev]);
    }
    setDialogOpen(false);
    setSaving(false);
  }

  function markComplete(id: string) {
    const now = new Date().toISOString();
    setInterviews((prev) => prev.map((i) =>
      i.id === id ? { ...i, status: "completed" as const, updatedAt: now } : i));
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-8 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interviews</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {needsScheduling.length} to schedule · {upcoming.length} upcoming
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Interview
        </Button>
      </div>

      {/* Needs-scheduling banner */}
      {needsScheduling.length > 0 && filterStatus === "all" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-4 py-3">
          <MessageSquareWarning className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            <span className="font-semibold">{needsScheduling.length}</span> interview{needsScheduling.length === 1 ? "" : "s"} need{needsScheduling.length === 1 ? "s" : ""} scheduling:{" "}
            {needsScheduling.map((i) => i.memberName).join(", ")}
          </p>
        </div>
      )}

      {/* Status filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {(["all", ...STATUSES] as (InterviewStatus | "all")[]).map((s) => (
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

      {/* Interview list */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CalendarClock className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            {filterStatus === "all" ? "No interviews yet" : `No ${filterStatus.replace("_", " ")} interviews`}
          </p>
          <Button onClick={openNew} variant="outline" size="sm">Add an interview</Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((i) => {
            const needsSched = i.status === "needs_scheduling";
            return (
              <li
                key={i.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow cursor-pointer",
                  needsSched ? "border-l-4 border-l-amber-400 border-border" : "border-border"
                )}
                onClick={() => openEdit(i)}
              >
                {/* Avatar initials */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary uppercase">
                  {i.memberName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{i.memberName}</p>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {INTERVIEW_TYPE_LABELS[i.type]}
                    </span>
                  </div>

                  {/* Schedule info */}
                  {i.status === "scheduled" || i.status === "completed" ? (
                    i.scheduledDate ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="h-3 w-3" /> {formatDate(i.scheduledDate)}
                        </span>
                        {i.scheduledTime && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" /> {formatTime(i.scheduledTime)}
                          </span>
                        )}
                        {i.interviewer && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" /> {i.interviewer}
                          </span>
                        )}
                      </div>
                    ) : null
                  ) : (
                    <p className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 mt-1 font-medium">
                      <CalendarPlus className="h-3 w-3" /> Needs scheduling
                    </p>
                  )}

                  {i.notes && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{i.notes}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full capitalize",
                    INTERVIEW_STATUS_COLORS[i.status]
                  )}>
                    {i.status.replace("_", " ")}
                  </span>
                  {i.status !== "completed" && i.status !== "cancelled" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Mark complete"
                      onClick={(e) => { e.stopPropagation(); markComplete(i.id); }}
                    >
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground/60 hover:text-green-600" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openEdit(i); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Interview dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Interview" : "New Interview"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="memberName">Member *</Label>
              <Input
                id="memberName"
                value={form.memberName}
                onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))}
                placeholder="Member name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as InterviewType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{INTERVIEW_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as InterviewStatus }))}>
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
              <Label>Interviewer</Label>
              <Select value={form.interviewer || "unassigned"} onValueChange={(v) => setForm((f) => ({ ...f, interviewer: v === "unassigned" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {MOCK_BISHOPRIC_MEMBERS.filter((m) => m.role === "bishop" || m.role === "counselor").map((m) => (
                    <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="scheduledDate">Date</Label>
                <Input id="scheduledDate" type="date" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scheduledTime">Time</Label>
                <Input id="scheduledTime" type="time" value={form.scheduledTime} onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.memberName.trim()}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Interview"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
