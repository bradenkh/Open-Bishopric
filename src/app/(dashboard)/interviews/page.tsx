"use client";

import { useState } from "react";
import {
  Plus, CalendarClock, Clock, User, GripVertical, CalendarPlus,
  CheckCircle2, AlertTriangle, Crown, Pencil, RotateCcw,
  CalendarDays, CalendarOff, Trash2, Check,
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
import type {
  Interview, InterviewType, InterviewStage,
  AvailabilityBlock, AvailabilityException, BishopricMember,
} from "@/types";
import {
  INTERVIEW_TYPE_LABELS, INTERVIEW_STAGES, INTERVIEW_PIPELINE, INTERVIEW_STAGE_COLORS,
  INTERVIEW_DURATION_MINS, WEEKDAY_LABELS,
} from "@/types";
import {
  MOCK_INTERVIEWS, MOCK_BISHOPRIC_MEMBERS, MOCK_AVAILABILITY, MOCK_AVAILABILITY_EXCEPTIONS,
} from "@/lib/mock-data";
import { formatDate, cn } from "@/lib/utils";
import {
  generateSlots, groupSlotsByDate, durationForType, parseDate, type Slot,
} from "@/lib/availability";

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

/** "Tuesday · Jun 16" for a slot-group date header. */
function dayHeading(dateStr: string): string {
  return `${WEEKDAY_LABELS[parseDate(dateStr).getDay()]} · ${formatDate(dateStr)}`;
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
  if ((i.stage === "scheduled" || i.stage === "pending_confirmation")
      && i.scheduledDate && i.scheduledDate < TODAY) {
    return "date_passed";
  }
  return i.stage;
}

/** Linear step for the progress dots (the two schedule columns share step 0). */
const STEPS: { key: string; label: string }[] = [
  { key: "schedule",    label: "Schedule" },
  { key: "pending",     label: "Confirming" },
  { key: "scheduled",   label: "Scheduled" },
  { key: "date_passed", label: "Date Passed" },
  { key: "completed",   label: "Completed" },
];
function stepIndex(stage: InterviewStage): number {
  if (stage === "schedule_any" || stage === "schedule_bishop") return 0;
  if (stage === "pending_confirmation") return 1;
  if (stage === "scheduled")   return 2;
  if (stage === "date_passed") return 3;
  return 4;
}

const NEXT_ACTION: Record<InterviewStage, string> = {
  schedule_any:         "Set a time with any member",
  schedule_bishop:      "Set a time with the bishop",
  pending_confirmation: "Awaiting both confirmations",
  scheduled:            "Awaiting the interview",
  date_passed:          "Did it happen? Confirm or reschedule",
  completed:            "Held",
};

// Per-stage column header styling
const STAGE_COLUMN_COLORS: Record<InterviewStage, { header: string; ring: string; drop: string }> = {
  schedule_any:         { header: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",     ring: "ring-amber-400",   drop: "bg-amber-50/60 dark:bg-amber-950/20" },
  schedule_bishop:      { header: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800", ring: "ring-orange-400",  drop: "bg-orange-50/60 dark:bg-orange-950/20" },
  pending_confirmation: { header: "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800",             ring: "ring-sky-400",     drop: "bg-sky-50/60 dark:bg-sky-950/20" },
  scheduled:            { header: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",         ring: "ring-blue-400",    drop: "bg-blue-50/60 dark:bg-blue-950/20" },
  date_passed:          { header: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800", ring: "ring-purple-400",  drop: "bg-purple-50/60 dark:bg-purple-950/20" },
  completed:            { header: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800",      ring: "ring-green-400",   drop: "bg-green-50/60 dark:bg-green-950/20" },
};

// ── Duration picker ─────────────────────────────────────────────────────────────

function DurationPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const presets = [10, 15, 20, 30, 45, 60];
  const opts = presets.includes(value) ? presets : [...presets, value].sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
            value === n
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted text-muted-foreground border-transparent hover:bg-accent"
          )}
        >
          {n} min
        </button>
      ))}
    </div>
  );
}

// ── Slot picker ─────────────────────────────────────────────────────────────────

interface SlotPickerProps {
  availability: AvailabilityBlock[];
  exceptions: AvailabilityException[];
  interviews: Interview[];
  durationMins: number;
  /** When set, only this member's slots are offered (e.g. bishop-required). */
  restrictToMember?: string;
  /** Selectable interviewers for the manual fallback. */
  allowedMembers: BishopricMember[];
  value: { date?: string; time?: string; interviewer?: string };
  onChange: (v: { date: string; time: string; interviewer: string }) => void;
  ignoreInterviewId?: string;
}

function SlotPicker({
  availability, exceptions, interviews, durationMins,
  restrictToMember, allowedMembers, value, onChange, ignoreInterviewId,
}: SlotPickerProps) {
  const [showManual, setShowManual] = useState(false);
  const [mDate, setMDate] = useState(value.date ?? "");
  const [mTime, setMTime] = useState(value.time ?? "");
  const [mInterviewer, setMInterviewer] = useState(restrictToMember ?? value.interviewer ?? "");

  const slots = generateSlots({
    memberName: restrictToMember,
    durationMins,
    blocks: availability,
    exceptions,
    interviews,
    ignoreInterviewId,
  });
  const grouped = groupSlotsByDate(slots);
  const showMember = !restrictToMember;

  const isSelected = (s: Slot) =>
    value.date === s.date && value.time === s.time && value.interviewer === s.memberName;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          {slots.length > 0
            ? `${slots.length} open ${durationMins}-min slot${slots.length !== 1 ? "s" : ""} in the next 4 weeks`
            : "Open slots"}
        </Label>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No open slots in the next 4 weeks. Add availability on the Availability tab, or enter a time manually below.
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-3 rounded-lg border border-border p-2">
          {grouped.map(({ date, slots }) => (
            <div key={date}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-1">
                {dayHeading(date)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {slots.map((s) => (
                  <button
                    key={`${s.date}-${s.time}-${s.memberId}`}
                    type="button"
                    onClick={() => onChange({ date: s.date, time: s.time, interviewer: s.memberName })}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-medium transition-colors text-left",
                      isSelected(s)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:bg-accent"
                    )}
                  >
                    <span>{formatTime(s.time)}</span>
                    {showMember && (
                      <span className={cn(
                        "block text-[10px]",
                        isSelected(s) ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}>
                        {s.memberName}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual fallback */}
      <div>
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {showManual ? "Hide manual entry" : "Enter a time manually"}
        </button>
        {showManual && (
          <div className="mt-2 space-y-3 rounded-lg border border-dashed border-border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mDate">Date</Label>
                <Input id="mDate" type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mTime">Time</Label>
                <Input id="mTime" type="time" value={mTime} onChange={(e) => setMTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Interviewer</Label>
              {restrictToMember ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <Crown className="h-4 w-4 text-orange-500" /> {restrictToMember}
                </div>
              ) : (
                <Select value={mInterviewer || ""} onValueChange={setMInterviewer}>
                  <SelectTrigger><SelectValue placeholder="Select interviewer" /></SelectTrigger>
                  <SelectContent>
                    {allowedMembers.map((m) => (
                      <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!mDate || !mTime || !(restrictToMember ?? mInterviewer)}
              onClick={() => onChange({ date: mDate, time: mTime, interviewer: restrictToMember ?? mInterviewer })}
            >
              Use this time
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Interview Card ────────────────────────────────────────────────────────────

function ConfirmPill({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium max-w-full",
        ok
          ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
          : "bg-muted text-muted-foreground"
      )}
      title={ok ? `${label} confirmed` : `${label} — awaiting confirmation`}
    >
      {ok ? <Check className="h-2.5 w-2.5 shrink-0" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />}
      <span className="truncate">{label}</span>
    </span>
  );
}

function ConfirmToggle({
  title, subtitle, checked, onChange,
}: { title: string; subtitle?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        checked
          ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40"
          : "border-border hover:bg-accent"
      )}
    >
      <span className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full border-2 shrink-0 transition-colors",
        checked ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground/40"
      )}>
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {subtitle && <span className="block text-xs text-muted-foreground truncate">{subtitle}</span>}
      </span>
      <span className={cn(
        "ml-auto text-xs font-medium shrink-0",
        checked ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
      )}>
        {checked ? "Confirmed" : "Pending"}
      </span>
    </button>
  );
}

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
      {i.scheduledDate && (i.stage === "scheduled" || i.stage === "pending_confirmation" || i.stage === "completed") && (
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

      {/* Confirmation status (pending_confirmation) */}
      {derived === "pending_confirmation" && (
        <div className="mt-2 pl-5 flex flex-wrap gap-1.5">
          <ConfirmPill label="Attendee" ok={i.attendeeConfirmed} />
          <ConfirmPill label="Interviewer" ok={i.interviewerConfirmed} />
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

// ── Availability View ───────────────────────────────────────────────────────────

interface AvailabilityViewProps {
  availability: AvailabilityBlock[];
  exceptions: AvailabilityException[];
  onAddBlock: (m: BishopricMember) => void;
  onDeleteBlock: (id: string) => void;
  onAddException: (m: BishopricMember) => void;
  onDeleteException: (id: string) => void;
}

function AvailabilityView({
  availability, exceptions, onAddBlock, onDeleteBlock, onAddException, onDeleteException,
}: AvailabilityViewProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Set the weekly hours each member is free for interviews. The scheduler slices these into
        bookable slots. Add time off to block a day or week (e.g. out of town).
      </p>
      {INTERVIEWERS.map((m) => {
        const blocks = availability
          .filter((b) => b.memberId === m.id)
          .sort((a, b) => (a.weekday - b.weekday) || a.startTime.localeCompare(b.startTime));
        const ex = exceptions
          .filter((e) => e.memberId === m.id)
          .sort((a, b) => a.startDate.localeCompare(b.startDate));

        return (
          <div key={m.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 border-b border-border">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold bg-primary/10 text-primary">
                {getInitials(m.name)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{m.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
              </div>
            </div>

            <div className="p-4 grid gap-4 sm:grid-cols-2">
              {/* Weekly availability */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> Weekly availability
                  </p>
                  <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => onAddBlock(m)}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
                {blocks.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No recurring availability yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {blocks.map((b) => (
                      <li key={b.id} className="group flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                        <span>
                          <span className="font-medium">{WEEKDAY_LABELS[b.weekday]}</span>
                          <span className="text-muted-foreground"> · {formatTime(b.startTime)}–{formatTime(b.endTime)}</span>
                        </span>
                        <button
                          onClick={() => onDeleteBlock(b.id)}
                          className="shrink-0 text-muted-foreground/50 hover:text-red-600 transition-colors"
                          aria-label="Remove availability"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Time off */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CalendarOff className="h-3.5 w-3.5" /> Time off
                  </p>
                  <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => onAddException(m)}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
                {ex.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No time off scheduled.</p>
                ) : (
                  <ul className="space-y-1">
                    {ex.map((e) => (
                      <li key={e.id} className="group flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium">
                            {formatDate(e.startDate)}{e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ""}
                          </span>
                          {e.reason && <span className="text-muted-foreground truncate"> · {e.reason}</span>}
                        </span>
                        <button
                          onClick={() => onDeleteException(e.id)}
                          className="shrink-0 text-muted-foreground/50 hover:text-red-600 transition-colors"
                          aria-label="Remove time off"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stage Advance Panel ───────────────────────────────────────────────────────

interface AdvancePanelProps {
  interview: Interview;
  availability: AvailabilityBlock[];
  exceptions: AvailabilityException[];
  interviews: Interview[];
  onSave: (updates: Partial<Interview> & { stage: InterviewStage }) => void;
  onClose: () => void;
  onEdit: () => void;
}

function StageAdvancePanel({
  interview, availability, exceptions, interviews, onSave, onClose, onEdit,
}: AdvancePanelProps) {
  const derived = deriveStage(interview);
  const name    = interview.memberName;
  const backToScheduleStage: InterviewStage = interview.requiresBishop ? "schedule_bishop" : "schedule_any";

  // Scheduling form state
  const [duration, setDuration] = useState(interview.durationMins ?? durationForType(interview.type));
  const [pick, setPick] = useState<{ date?: string; time?: string; interviewer?: string }>({
    date: interview.scheduledDate,
    time: interview.scheduledTime,
    interviewer: interview.interviewer,
  });
  // Confirmation state (pending_confirmation stage)
  const [attendeeOk,    setAttendeeOk]    = useState(interview.attendeeConfirmed ?? false);
  const [interviewerOk, setInterviewerOk] = useState(interview.interviewerConfirmed ?? false);

  // ── Needs scheduling ──────────────────────────────────────────────────────
  if (derived === "schedule_any" || derived === "schedule_bishop") {
    const mustBeBishop = derived === "schedule_bishop";
    return (
      <div className="border-t pt-4 space-y-4">
        <div>
          <p className="text-sm font-semibold">Schedule Interview</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pick an open slot for <strong>{name}</strong>&apos;s {INTERVIEW_TYPE_LABELS[interview.type].toLowerCase()} interview
            {mustBeBishop ? " with the bishop" : ""}.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Length</Label>
          <DurationPicker value={duration} onChange={setDuration} />
        </div>

        <SlotPicker
          availability={availability}
          exceptions={exceptions}
          interviews={interviews}
          durationMins={duration}
          restrictToMember={mustBeBishop ? BISHOP?.name : undefined}
          allowedMembers={INTERVIEWERS}
          value={pick}
          onChange={setPick}
          ignoreInterviewId={interview.id}
        />

        {pick.date && pick.time && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/60 p-3 text-xs text-sky-800 dark:text-sky-200">
            Booking <strong>{formatDate(pick.date)}</strong> at <strong>{formatTime(pick.time)}</strong>
            {pick.interviewer ? <> with <strong>{pick.interviewer}</strong></> : null} ({duration} min).
            It will wait for confirmation from both sides before it&apos;s locked in.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Not Yet</Button>
          <Button
            disabled={!pick.date || !pick.time || !pick.interviewer}
            onClick={() => onSave({
              stage:                "pending_confirmation",
              interviewer:          pick.interviewer,
              scheduledDate:        pick.date,
              scheduledTime:        pick.time,
              durationMins:         duration,
              attendeeConfirmed:    false,
              interviewerConfirmed: false,
            })}
          >
            {pick.date && pick.time ? "Book Slot" : "Pick a slot"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Pending confirmation ──────────────────────────────────────────────────
  if (derived === "pending_confirmation") {
    const bothConfirmed = attendeeOk && interviewerOk;
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Pending Confirmation</p>
        <p className="text-sm text-muted-foreground">
          Booked
          {interview.scheduledDate ? ` for ${formatDate(interview.scheduledDate)}` : ""}
          {interview.scheduledTime ? ` at ${formatTime(interview.scheduledTime)}` : ""}
          {interview.interviewer ? ` with ${interview.interviewer}` : ""}. It moves to{" "}
          <strong>Scheduled</strong> once both sides confirm.
        </p>
        <div className="space-y-2">
          <ConfirmToggle title="Attendee confirmed" subtitle={name} checked={attendeeOk} onChange={setAttendeeOk} />
          <ConfirmToggle
            title="Interviewer confirmed"
            subtitle={interview.interviewer ?? "Bishopric member"}
            checked={interviewerOk}
            onChange={setInterviewerOk}
          />
        </div>
        <div className="flex flex-col gap-2 pt-1">
          {bothConfirmed ? (
            <Button onClick={() => onSave({ stage: "scheduled", attendeeConfirmed: true, interviewerConfirmed: true })}>
              <CheckCircle2 className="h-4 w-4" /> Both confirmed — move to Scheduled
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => onSave({
                stage:                "pending_confirmation",
                attendeeConfirmed:    attendeeOk,
                interviewerConfirmed: interviewerOk,
              })}
            >
              Save confirmations
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onSave({
              stage:                backToScheduleStage,
              scheduledDate:        undefined,
              scheduledTime:        undefined,
              attendeeConfirmed:    false,
              interviewerConfirmed: false,
            })}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Cancel &amp; send back to scheduling
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

type PageView = "board" | "availability";

const EMPTY_FORM = {
  memberName: "",
  type: "temple_recommend" as InterviewType,
  requiresBishop: false,
  durationMins: durationForType("temple_recommend"),
  interviewer: "",
  scheduledDate: "",
  scheduledTime: "",
  notes: "",
};

const EMPTY_BLOCK = { open: false, member: null as BishopricMember | null, weekday: 2, startTime: "18:00", endTime: "19:00" };
const EMPTY_EXCEPTION = { open: false, member: null as BishopricMember | null, startDate: "", endDate: "", reason: "" };

export default function InterviewsPage() {
  const { user } = useAuth();
  const [interviews,   setInterviews]   = useState<Interview[]>([...MOCK_INTERVIEWS]);
  const [availability, setAvailability] = useState<AvailabilityBlock[]>([...MOCK_AVAILABILITY]);
  const [exceptions,   setExceptions]   = useState<AvailabilityException[]>([...MOCK_AVAILABILITY_EXCEPTIONS]);

  const [view,       setView]       = useState<PageView>("board");
  const [selected,   setSelected]   = useState<Interview | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<Interview | null>(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);

  const [blockForm,     setBlockForm]     = useState(EMPTY_BLOCK);
  const [exceptionForm, setExceptionForm] = useState(EMPTY_EXCEPTION);

  // ── Derived counts ─────────────────────────────────────────────────────────
  const needsScheduling = interviews.filter(
    (i) => i.stage === "schedule_any" || i.stage === "schedule_bishop"
  ).length;
  const pending   = interviews.filter((i) => deriveStage(i) === "pending_confirmation").length;
  const upcoming  = interviews.filter((i) => deriveStage(i) === "scheduled").length;
  const toReview  = interviews.filter((i) => deriveStage(i) === "date_passed").length;

  // ── Interview handlers ─────────────────────────────────────────────────────

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
      patch(id, { stage: "schedule_any", requiresBishop: false, scheduledDate: undefined, scheduledTime: undefined, attendeeConfirmed: undefined, interviewerConfirmed: undefined });
    } else if (toStage === "schedule_bishop") {
      patch(id, { stage: "schedule_bishop", requiresBishop: true, scheduledDate: undefined, scheduledTime: undefined, attendeeConfirmed: undefined, interviewerConfirmed: undefined });
    } else if (toStage === "scheduled") {
      // Dragging straight to Scheduled treats both sides as confirmed.
      patch(id, { stage: "scheduled", attendeeConfirmed: true, interviewerConfirmed: true });
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
      durationMins:   i.durationMins ?? durationForType(i.type),
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

    // Booking a date sends the interview to pending_confirmation; editing other
    // details of an already-booked interview keeps its stage and confirmations.
    const scheduling = !!form.scheduledDate;
    const dtChanged = !editing
      || form.scheduledDate !== (editing.scheduledDate ?? "")
      || form.scheduledTime !== (editing.scheduledTime ?? "");

    let stage: InterviewStage;
    let attendeeConfirmed: boolean | undefined;
    let interviewerConfirmed: boolean | undefined;
    if (!scheduling) {
      stage = editing?.stage === "completed"
        ? "completed"
        : form.requiresBishop ? "schedule_bishop" : "schedule_any";
    } else if (dtChanged) {
      stage = "pending_confirmation";
      attendeeConfirmed = false;
      interviewerConfirmed = false;
    } else {
      stage = editing!.stage;
      attendeeConfirmed = editing!.attendeeConfirmed;
      interviewerConfirmed = editing!.interviewerConfirmed;
    }

    const fields = {
      memberName:     form.memberName.trim(),
      type:           form.type,
      requiresBishop: form.requiresBishop,
      durationMins:   form.durationMins,
      interviewer:    form.interviewer || undefined,
      scheduledDate:  form.scheduledDate || undefined,
      scheduledTime:  form.scheduledTime || undefined,
      attendeeConfirmed,
      interviewerConfirmed,
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

  // ── Availability handlers ──────────────────────────────────────────────────

  function saveBlock() {
    if (!blockForm.member || blockForm.startTime >= blockForm.endTime) return;
    const m = blockForm.member;
    setAvailability((prev) => [
      ...prev,
      {
        id: `av-${Date.now()}`,
        memberId: m.id,
        memberName: m.name,
        weekday: blockForm.weekday,
        startTime: blockForm.startTime,
        endTime: blockForm.endTime,
      },
    ]);
    setBlockForm(EMPTY_BLOCK);
  }

  function saveException() {
    if (!exceptionForm.member || !exceptionForm.startDate) return;
    const m = exceptionForm.member;
    const endDate = exceptionForm.endDate || exceptionForm.startDate;
    if (endDate < exceptionForm.startDate) return;
    setExceptions((prev) => [
      ...prev,
      {
        id: `ax-${Date.now()}`,
        memberId: m.id,
        memberName: m.name,
        startDate: exceptionForm.startDate,
        endDate,
        reason: exceptionForm.reason.trim() || undefined,
      },
    ]);
    setExceptionForm(EMPTY_EXCEPTION);
  }

  const TAB_CONFIG: { view: PageView; label: string; count?: number }[] = [
    { view: "board",        label: "Board",        count: needsScheduling + toReview },
    { view: "availability", label: "Availability", count: availability.length },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full p-4 lg:p-8 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Interviews</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {needsScheduling} to schedule
            {pending > 0 && (
              <span className="text-sky-600 dark:text-sky-400"> · {pending} confirming</span>
            )}
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
      {toReview > 0 && view === "board" && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/60 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
          <p className="text-sm text-purple-800 dark:text-purple-200">
            <strong>{toReview}</strong> interview{toReview !== 1 ? "s have" : " has"} passed their date — confirm they happened or reschedule.
          </p>
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 border-b border-border">
        {TAB_CONFIG.map(({ view: v, label, count }) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors rounded-t-lg",
              view === v
                ? "bg-background border border-b-background border-border text-foreground -mb-px"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {count != null && count > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 rounded-full tabular-nums",
                view === v ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Views ── */}
      {view === "board" && (
        <KanbanView interviews={interviews} onSelect={setSelected} onMove={handleMove} />
      )}

      {view === "availability" && (
        <AvailabilityView
          availability={availability}
          exceptions={exceptions}
          onAddBlock={(m) => setBlockForm({ ...EMPTY_BLOCK, open: true, member: m })}
          onDeleteBlock={(id) => setAvailability((prev) => prev.filter((b) => b.id !== id))}
          onAddException={(m) => setExceptionForm({ ...EMPTY_EXCEPTION, open: true, member: m })}
          onDeleteException={(id) => setExceptions((prev) => prev.filter((e) => e.id !== id))}
        />
      )}

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
                  {deriveStage(selected) === "pending_confirmation" && (
                    <p>
                      <span className="font-medium text-foreground">Confirmations:</span>{" "}
                      Attendee {selected.attendeeConfirmed ? "✓" : "—"} · Interviewer {selected.interviewerConfirmed ? "✓" : "—"}
                    </p>
                  )}
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
                  availability={availability}
                  exceptions={exceptions}
                  interviews={interviews}
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
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({
                  ...f,
                  type: v as InterviewType,
                  durationMins: durationForType(v as InterviewType),
                }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {INTERVIEW_TYPE_LABELS[t]}
                      <span className="text-muted-foreground"> · {INTERVIEW_DURATION_MINS[t]} min</span>
                    </SelectItem>
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

            <div className="space-y-1.5">
              <Label>Length</Label>
              <DurationPicker value={form.durationMins} onChange={(n) => setForm((f) => ({ ...f, durationMins: n }))} />
            </div>

            <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Optional — book an open slot now, or leave blank to schedule later from the board.
              </p>
              <SlotPicker
                availability={availability}
                exceptions={exceptions}
                interviews={interviews}
                durationMins={form.durationMins}
                restrictToMember={form.requiresBishop ? BISHOP?.name : undefined}
                allowedMembers={INTERVIEWERS}
                value={{ date: form.scheduledDate, time: form.scheduledTime, interviewer: form.interviewer }}
                onChange={(v) => setForm((f) => ({ ...f, scheduledDate: v.date, scheduledTime: v.time, interviewer: v.interviewer }))}
                ignoreInterviewId={editing?.id}
              />
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

      {/* ── Add availability dialog ── */}
      <Dialog open={blockForm.open} onOpenChange={(open) => !open && setBlockForm(EMPTY_BLOCK)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add availability — {blockForm.member?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Day of week</Label>
              <Select
                value={String(blockForm.weekday)}
                onValueChange={(v) => setBlockForm((f) => ({ ...f, weekday: Number(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <SelectItem key={idx} value={String(idx)}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="blkStart">From</Label>
                <Input id="blkStart" type="time" value={blockForm.startTime} onChange={(e) => setBlockForm((f) => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="blkEnd">To</Label>
                <Input id="blkEnd" type="time" value={blockForm.endTime} onChange={(e) => setBlockForm((f) => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
            {blockForm.startTime >= blockForm.endTime && (
              <p className="text-xs text-red-600 dark:text-red-400">End time must be after the start time.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlockForm(EMPTY_BLOCK)}>Cancel</Button>
            <Button onClick={saveBlock} disabled={blockForm.startTime >= blockForm.endTime}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add time-off dialog ── */}
      <Dialog open={exceptionForm.open} onOpenChange={(open) => !open && setExceptionForm(EMPTY_EXCEPTION)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add time off — {exceptionForm.member?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Blocks all availability in this date range (e.g. out of town). Leave the end date blank for a single day.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exStart">From</Label>
                <Input id="exStart" type="date" value={exceptionForm.startDate} onChange={(e) => setExceptionForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exEnd">To</Label>
                <Input id="exEnd" type="date" value={exceptionForm.endDate} onChange={(e) => setExceptionForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exReason">Reason</Label>
              <Input id="exReason" value={exceptionForm.reason} onChange={(e) => setExceptionForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Out of town" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExceptionForm(EMPTY_EXCEPTION)}>Cancel</Button>
            <Button onClick={saveException} disabled={!exceptionForm.startDate}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
