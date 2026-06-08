"use client";

import { useState } from "react";
import {
  Plus, CalendarClock, Clock, User, GripVertical, CalendarPlus,
  CheckCircle2, AlertTriangle, Crown, Pencil, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import type { Interview, InterviewType, InterviewStage } from "@/types";
import {
  INTERVIEW_TYPE_LABELS, INTERVIEW_STAGES, INTERVIEW_PIPELINE, INTERVIEW_STAGE_COLORS,
} from "@/types";
import { MOCK_INTERVIEWS, MOCK_BISHOPRIC_MEMBERS } from "@/lib/mock-data";
import { formatDate, cn } from "@/lib/utils";

// ── Bishopric helpers ─────────────────────────────────────────────────────────

/** Members who can conduct interviews (bishop + counselors). */
const INTERVIEWERS = MOCK_BISHOPRIC_MEMBERS.filter(
  (m) => m.role === "bishop" || m.role === "counselor"
);
const BISHOP = MOCK_BISHOPRIC_MEMBERS.find((m) => m.role === "bishop");

const TYPES: InterviewType[] = [
  "temple_recommend", "temple_recommend_youth", "calling", "ministering",
  "tithing_settlement", "youth", "worthiness", "other",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatTime(time?: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function stageLabel(stage: InterviewStage): string {
  return INTERVIEW_STAGES.find((s) => s.stage === stage)?.label ?? stage;
}

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * The column an interview belongs in. A `scheduled` interview whose date has
 * passed automatically drops into `date_passed` so the bishopric can confirm
 * it happened or send it back to be rescheduled.
 */
function deriveStage(i: Interview): InterviewStage {
  if (i.stage === "scheduled" && i.scheduledDate && i.scheduledDate < TODAY) {
    return "date_passed";
  }
  return i.stage;
}

/** Linear step for the progress dots (the two schedule columns share step 0). */
const STEPS: { key: string; label: string }[] = [
  { key: "schedule",    label: "Schedule" },
  { key: "scheduled",   label: "Scheduled" },
  { key: "date_passed", label: "Date Passed" },
  { key: "completed",   label: "Completed" },
];
function stepIndex(stage: InterviewStage): number {
  if (stage === "schedule_any" || stage === "schedule_bishop") return 0;
  if (stage === "scheduled")   return 1;
  if (stage === "date_passed") return 2;
  return 3;
}

const NEXT_ACTION: Record<InterviewStage, string> = {
  schedule_any:    "Set a time with any member",
  schedule_bishop: "Set a time with the bishop",
  scheduled:       "Awaiting the interview",
  date_passed:     "Did it happen? Confirm or reschedule",
  completed:       "Held",
};

// Per-stage column header styling
const STAGE_COLUMN_COLORS: Record<InterviewStage, { header: string; ring: string; drop: string }> = {
  schedule_any:    { header: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",     ring: "ring-amber-400",   drop: "bg-amber-50/60 dark:bg-amber-950/20" },
  schedule_bishop: { header: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800", ring: "ring-orange-400",  drop: "bg-orange-50/60 dark:bg-orange-950/20" },
  scheduled:       { header: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",         ring: "ring-blue-400",    drop: "bg-blue-50/60 dark:bg-blue-950/20" },
  date_passed:     { header: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800", ring: "ring-purple-400",  drop: "bg-purple-50/60 dark:bg-purple-950/20" },
  completed:       { header: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",      ring: "ring-green-400",   drop: "bg-green-50/60 dark:bg-green-950/20" },
};

// ── Interview Card ────────────────────────────────────────────────────────────

interface InterviewCardProps {
  interview: Interview;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  isDragging: boolean;
}

function InterviewCard({ interview: i, onClick, onDragStart, onDragEnd, isDragging }: InterviewCardProps) {
  const derived  = deriveStage(i);
  const initials = getInitials(i.memberName);
  const needsReview = derived === "date_passed";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "rounded-lg bg-card border p-3 cursor-pointer select-none group",
        "hover:shadow-md transition-all duration-150",
        needsReview ? "border-purple-300 dark:border-purple-700" : "border-border",
        isDragging && "opacity-40 scale-[0.97] shadow-none"
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 mt-0.5 shrink-0 cursor-grab active:cursor-grabbing group-hover:text-muted-foreground/60 transition-colors" />
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 bg-primary/10 text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-tight truncate">{i.memberName}</p>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              {INTERVIEW_TYPE_LABELS[i.type]}
            </p>
          </div>
        </div>
        {i.requiresBishop && (
          <Crown className="h-3.5 w-3.5 text-orange-500 shrink-0" aria-label="Must be with the bishop" />
        )}
      </div>

      {/* Schedule info (once a date exists) */}
      {i.scheduledDate && (i.stage === "scheduled" || i.stage === "completed") && (
        <div className="mt-2 pl-5 flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <CalendarClock className="h-3 w-3" /> {formatDate(i.scheduledDate)}
          </span>
          {i.scheduledTime && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" /> {formatTime(i.scheduledTime)}
            </span>
          )}
          {i.interviewer && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
              <User className="h-3 w-3 shrink-0" /> {i.interviewer}
            </span>
          )}
        </div>
      )}

      {/* Needs-scheduling hint */}
      {(derived === "schedule_any" || derived === "schedule_bishop") && (
        <div className="mt-2 pl-5">
          <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
            <CalendarPlus className="h-3 w-3" /> Needs scheduling
          </p>
        </div>
      )}

      {/* Date-passed review hint */}
      {needsReview && (
        <div className="mt-2 pl-5 space-y-0.5">
          {i.scheduledDate && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <CalendarClock className="h-3 w-3" /> was {formatDate(i.scheduledDate)}
              {i.interviewer ? ` · ${i.interviewer}` : ""}
            </span>
          )}
          <p className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-medium">
            <AlertTriangle className="h-3 w-3" /> Did it happen?
          </p>
        </div>
      )}
    </div>
  );
}

// ── Kanban / Pipeline View ────────────────────────────────────────────────────

interface KanbanViewProps {
  interviews: Interview[];
  onSelect: (i: Interview) => void;
  onMove: (id: string, toStage: InterviewStage) => void;
}

function KanbanView({ interviews, onSelect, onMove }: KanbanViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage,  setOverStage]  = useState<InterviewStage | null>(null);

  function handleDragStart(e: React.DragEvent, i: Interview) {
    setDraggingId(i.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", i.id);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setOverStage(null);
  }
  function handleDragOver(e: React.DragEvent, stage: InterviewStage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverStage(stage);
  }
  function handleDragLeave(e: React.DragEvent) {
    const target = e.currentTarget as HTMLElement;
    if (!target.contains(e.relatedTarget as Node)) setOverStage(null);
  }
  function handleDrop(e: React.DragEvent, toStage: InterviewStage) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const i  = interviews.find((x) => x.id === id);
    if (i && deriveStage(i) !== toStage) onMove(id, toStage);
    setDraggingId(null);
    setOverStage(null);
  }

  const draggingInterview = draggingId ? interviews.find((x) => x.id === draggingId) : null;

  return (
    <div className="overflow-x-auto pb-4 -mx-4 px-4 lg:-mx-8 lg:px-8">
      <div className="flex gap-3" style={{ minWidth: "max-content" }}>
        {INTERVIEW_PIPELINE.map((stage) => {
          const stageItems  = interviews.filter((i) => deriveStage(i) === stage);
          const isOver      = overStage === stage;
          const isValidDrop = draggingInterview && deriveStage(draggingInterview) !== stage;
          const colors      = STAGE_COLUMN_COLORS[stage];

          return (
            <div key={stage} className="flex flex-col" style={{ width: 208 }}>
              <div
                className={cn(
                  "flex-1 rounded-xl border-2 transition-all duration-150",
                  colors.header,
                  isOver && isValidDrop
                    ? cn("ring-2", colors.ring, "shadow-lg border-transparent")
                    : "shadow-sm"
                )}
                style={{ minHeight: 220 }}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage)}
              >
                {/* Column header */}
                <div className="p-3 border-b border-inherit">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/70 truncate">
                      {stageLabel(stage)}
                    </p>
                    {stageItems.length > 0 && (
                      <span className={cn(
                        "text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-full",
                        INTERVIEW_STAGE_COLORS[stage]
                      )}>
                        {stageItems.length}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {NEXT_ACTION[stage]}
                  </p>
                </div>

                {/* Drop zone / cards */}
                <div className={cn(
                  "p-2 space-y-2 min-h-[140px] rounded-b-xl transition-colors duration-100",
                  isOver && isValidDrop ? colors.drop : ""
                )}>
                  {stageItems.map((i) => (
                    <InterviewCard
                      key={i.id}
                      interview={i}
                      onClick={() => onSelect(i)}
                      onDragStart={(e) => handleDragStart(e, i)}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingId === i.id}
                    />
                  ))}
                  <div className={cn(
                    "flex items-center justify-center rounded-lg border-2 border-dashed transition-all duration-100",
                    stageItems.length === 0 ? "h-20" : "h-10",
                    isOver && isValidDrop
                      ? "border-current opacity-60 text-foreground"
                      : "border-border/30 text-muted-foreground/20"
                  )}>
                    <p className="text-[10px] font-medium">
                      {isOver && isValidDrop ? "Drop here" : stageItems.length === 0 ? "Empty" : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stage Advance Panel ───────────────────────────────────────────────────────

interface AdvancePanelProps {
  interview: Interview;
  onSave: (updates: Partial<Interview> & { stage: InterviewStage }) => void;
  onClose: () => void;
  onEdit: () => void;
}

function StageAdvancePanel({ interview, onSave, onClose, onEdit }: AdvancePanelProps) {
  const derived = deriveStage(interview);
  const name    = interview.memberName;
  const backToScheduleStage: InterviewStage = interview.requiresBishop ? "schedule_bishop" : "schedule_any";

  // Scheduling form state
  const [interviewer,   setInterviewer]   = useState(
    interview.interviewer ?? (interview.requiresBishop ? BISHOP?.name ?? "" : "")
  );
  const [scheduledDate, setScheduledDate] = useState(interview.scheduledDate ?? "");
  const [scheduledTime, setScheduledTime] = useState(interview.scheduledTime ?? "");

  // ── Needs scheduling ──────────────────────────────────────────────────────
  if (derived === "schedule_any" || derived === "schedule_bishop") {
    const mustBeBishop = derived === "schedule_bishop";
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Schedule Interview</p>
        <p className="text-sm text-muted-foreground">
          Set a time for <strong>{name}</strong>&apos;s {INTERVIEW_TYPE_LABELS[interview.type].toLowerCase()} interview
          {mustBeBishop ? " with the bishop" : ""}.
        </p>

        <div className="space-y-1.5">
          <Label>Interviewer</Label>
          {mustBeBishop ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Crown className="h-4 w-4 text-orange-500" />
              {BISHOP?.name ?? "Bishop"}
              <span className="text-xs text-muted-foreground">(required)</span>
            </div>
          ) : (
            <Select value={interviewer || "unassigned"} onValueChange={(v) => setInterviewer(v === "unassigned" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Any bishopric member" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Any bishopric member</SelectItem>
                {INTERVIEWERS.map((m) => (
                  <SelectItem key={m.id} value={m.name}>
                    {m.name} <span className="text-muted-foreground capitalize">({m.role})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="schedDate">Date</Label>
            <Input id="schedDate" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="schedTime">Time</Label>
            <Input id="schedTime" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Not Yet</Button>
          <Button
            disabled={!scheduledDate}
            onClick={() => onSave({
              stage:         "scheduled",
              interviewer:   mustBeBishop ? BISHOP?.name : (interviewer || undefined),
              scheduledDate,
              scheduledTime: scheduledTime || undefined,
            })}
          >
            {scheduledDate ? "Schedule" : "Pick a date"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Scheduled (upcoming) ──────────────────────────────────────────────────
  if (derived === "scheduled") {
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Upcoming Interview</p>
        <p className="text-sm text-muted-foreground">
          <strong>{name}</strong> is scheduled
          {interview.scheduledDate ? ` for ${formatDate(interview.scheduledDate)}` : ""}
          {interview.scheduledTime ? ` at ${formatTime(interview.scheduledTime)}` : ""}
          {interview.interviewer ? ` with ${interview.interviewer}` : ""}.
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={() => onSave({ stage: "completed" })}>
            <CheckCircle2 className="h-4 w-4" /> Mark Completed
          </Button>
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Change Date / Details
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onSave({
              stage:         backToScheduleStage,
              scheduledDate: undefined,
              scheduledTime: undefined,
            })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Cancel &amp; send back to scheduling
          </Button>
        </div>
      </div>
    );
  }

  // ── Date passed — did it happen? ──────────────────────────────────────────
  if (derived === "date_passed") {
    return (
      <div className="border-t pt-4 space-y-3">
        <div className="rounded-lg border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/60 p-3 flex gap-2 text-sm text-purple-800 dark:text-purple-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            <strong>{name}</strong>&apos;s interview was scheduled for{" "}
            {interview.scheduledDate ? formatDate(interview.scheduledDate) : "an earlier date"}
            {interview.interviewer ? ` with ${interview.interviewer}` : ""}. Did it happen?
          </span>
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={() => onSave({ stage: "completed" })}>
            <CheckCircle2 className="h-4 w-4" /> Yes — mark completed
          </Button>
          <Button
            variant="outline"
            onClick={() => onSave({
              stage:         backToScheduleStage,
              scheduledDate: undefined,
              scheduledTime: undefined,
            })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> No — reschedule
          </Button>
          <Button variant="ghost" onClick={onClose}>Decide Later</Button>
        </div>
      </div>
    );
  }

  // ── Completed ─────────────────────────────────────────────────────────────
  return (
    <div className="border-t pt-4 space-y-3">
      <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/60 p-3 flex gap-2 text-sm text-green-800 dark:text-green-200">
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          <strong>{name}</strong>&apos;s {INTERVIEW_TYPE_LABELS[interview.type].toLowerCase()} interview is complete
          {interview.scheduledDate ? ` (${formatDate(interview.scheduledDate)})` : ""}.
        </span>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => onSave({
            stage:         backToScheduleStage,
            scheduledDate: undefined,
            scheduledTime: undefined,
          })}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Schedule Again
        </Button>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  memberName: "",
  type: "temple_recommend" as InterviewType,
  requiresBishop: false,
  interviewer: "",
  scheduledDate: "",
  scheduledTime: "",
  notes: "",
};

export default function InterviewsPage() {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([...MOCK_INTERVIEWS]);
  const [selected,   setSelected]   = useState<Interview | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<Interview | null>(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);

  // ── Derived counts ─────────────────────────────────────────────────────────
  const needsScheduling = interviews.filter(
    (i) => i.stage === "schedule_any" || i.stage === "schedule_bishop"
  ).length;
  const upcoming  = interviews.filter((i) => deriveStage(i) === "scheduled").length;
  const toReview  = interviews.filter((i) => deriveStage(i) === "date_passed").length;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function patch(id: string, updates: Partial<Interview>) {
    const now = new Date().toISOString();
    setInterviews((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates, updatedAt: now } : i)));
  }

  function handleAdvance(updates: Partial<Interview> & { stage: InterviewStage }) {
    if (!selected) return;
    patch(selected.id, updates);
    setSelected(null);
  }

  /** Drag-and-drop between columns, applying the side effects each move implies. */
  function handleMove(id: string, toStage: InterviewStage) {
    if (toStage === "schedule_any") {
      patch(id, { stage: "schedule_any", requiresBishop: false, scheduledDate: undefined, scheduledTime: undefined });
    } else if (toStage === "schedule_bishop") {
      patch(id, { stage: "schedule_bishop", requiresBishop: true, scheduledDate: undefined, scheduledTime: undefined });
    } else {
      patch(id, { stage: toStage });
    }
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(i: Interview) {
    setEditing(i);
    setForm({
      memberName:     i.memberName,
      type:           i.type,
      requiresBishop: i.requiresBishop ?? false,
      interviewer:    i.interviewer ?? "",
      scheduledDate:  i.scheduledDate ?? "",
      scheduledTime:  i.scheduledTime ?? "",
      notes:          i.notes ?? "",
    });
    setSelected(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.memberName.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 150));
    const now = new Date().toISOString();

    // A date implies "scheduled"; otherwise it sits in the chosen schedule column.
    const baseStage: InterviewStage = form.scheduledDate
      ? "scheduled"
      : form.requiresBishop ? "schedule_bishop" : "schedule_any";
    // Preserve a completed interview's stage when editing unless it's being rescheduled.
    const stage: InterviewStage =
      editing?.stage === "completed" && !form.scheduledDate ? "completed" : baseStage;
    const interviewer =
      form.requiresBishop && form.scheduledDate ? (BISHOP?.name ?? form.interviewer) : form.interviewer;

    const fields = {
      memberName:     form.memberName.trim(),
      type:           form.type,
      requiresBishop: form.requiresBishop,
      interviewer:    interviewer || undefined,
      scheduledDate:  form.scheduledDate || undefined,
      scheduledTime:  form.scheduledTime || undefined,
      notes:          form.notes.trim() || undefined,
      stage,
    };

    if (editing) {
      patch(editing.id, fields);
    } else {
      const newInterview: Interview = {
        id: `int-${Date.now()}`,
        ...fields,
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      };
      setInterviews((prev) => [newInterview, ...prev]);
    }
    setDialogOpen(false);
    setSaving(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full p-4 lg:p-8 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interviews</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {needsScheduling} to schedule
            <span> · {upcoming} upcoming</span>
            {toReview > 0 && (
              <span className="text-purple-600 dark:text-purple-400"> · {toReview} to review</span>
            )}
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Interview</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Date-passed review banner */}
      {toReview > 0 && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/60 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
          <p className="text-sm text-purple-800 dark:text-purple-200">
            <strong>{toReview}</strong> interview{toReview !== 1 ? "s have" : " has"} passed their date — confirm they happened or reschedule.
          </p>
        </div>
      )}

      {/* Kanban board */}
      <KanbanView interviews={interviews} onSelect={setSelected} onMove={handleMove} />

      {/* ── Detail dialog ── */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-start justify-between gap-3 pr-2">
                  <span className="truncate">{selected.memberName}</span>
                  <Badge className={cn("text-xs shrink-0 mt-0.5", INTERVIEW_STAGE_COLORS[deriveStage(selected)])}>
                    {stageLabel(deriveStage(selected))}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Details */}
                <div className="text-sm space-y-1 text-muted-foreground">
                  <p><span className="font-medium text-foreground">Type:</span> {INTERVIEW_TYPE_LABELS[selected.type]}</p>
                  <p>
                    <span className="font-medium text-foreground">Conducted by:</span>{" "}
                    {selected.requiresBishop ? "Bishop (required)" : "Any bishopric member"}
                  </p>
                  {selected.interviewer  && <p><span className="font-medium text-foreground">Interviewer:</span> {selected.interviewer}</p>}
                  {selected.scheduledDate && <p><span className="font-medium text-foreground">Date:</span> {formatDate(selected.scheduledDate)}</p>}
                  {selected.scheduledTime && <p><span className="font-medium text-foreground">Time:</span> {formatTime(selected.scheduledTime)}</p>}
                  {selected.notes        && <p><span className="font-medium text-foreground">Notes:</span> {selected.notes}</p>}
                </div>

                {/* Progress dots */}
                <div className="flex gap-1.5 items-center flex-wrap">
                  {STEPS.map((s, i) => {
                    const current = stepIndex(deriveStage(selected));
                    return (
                      <div
                        key={s.key}
                        title={s.label}
                        className={cn(
                          "h-2.5 w-2.5 rounded-full transition-colors",
                          i < current ? "bg-green-500" : i === current ? "bg-primary" : "bg-muted"
                        )}
                      />
                    );
                  })}
                  <span className="text-xs text-muted-foreground ml-1">{stageLabel(deriveStage(selected))}</span>
                </div>

                <StageAdvancePanel
                  interview={selected}
                  onSave={handleAdvance}
                  onClose={() => setSelected(null)}
                  onEdit={() => openEdit(selected)}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── New / edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                autoFocus
              />
            </div>

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

            {/* Who can conduct — chooses the schedule column */}
            <div className="space-y-1.5">
              <Label>Who can conduct it?</Label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  [false, "Any bishopric member"],
                  [true,  "Bishop only"],
                ] as [boolean, string][]).map(([val, label]) => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, requiresBishop: val }))}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      form.requiresBishop === val
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {val && <Crown className="h-3.5 w-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Optional — fill in a date now to schedule it straight away, or leave blank to schedule later.
              </p>
              <div className="space-y-1.5">
                <Label>Interviewer</Label>
                {form.requiresBishop ? (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <Crown className="h-4 w-4 text-orange-500" /> {BISHOP?.name ?? "Bishop"}
                  </div>
                ) : (
                  <Select value={form.interviewer || "unassigned"} onValueChange={(v) => setForm((f) => ({ ...f, interviewer: v === "unassigned" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Any bishopric member" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Any bishopric member</SelectItem>
                      {INTERVIEWERS.map((m) => (
                        <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="newDate">Date</Label>
                  <Input id="newDate" type="date" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newTime">Time</Label>
                  <Input id="newTime" type="time" value={form.scheduledTime} onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))} />
                </div>
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
