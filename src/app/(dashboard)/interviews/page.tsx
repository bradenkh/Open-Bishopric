"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Plus, CalendarClock, Clock, User, GripVertical, CalendarPlus,
  CheckCircle2, AlertTriangle, Pencil, RotateCcw,
  CalendarDays, CalendarOff, Trash2, Check, Link2, Copy, Repeat, Search, Send,
  ChevronLeft, ChevronRight, List, Columns3, Download, Eye,
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
import { useData, newId } from "@/contexts/DataContext";
import type {
  Interview, InterviewType, InterviewStage,
  AvailabilityBlock, AvailabilityException, BishopricMember,
  SettlementRecord, SettlementStatus, DeclaredTithingStatus,
  BookingToken, Member, AvailabilityRecurrence,
} from "@/types";
import {
  INTERVIEW_TYPE_LABELS, INTERVIEW_STAGES, INTERVIEW_PIPELINE, INTERVIEW_STAGE_COLORS,
  INTERVIEW_DURATION_MINS, WEEKDAY_LABELS,
  SETTLEMENT_STATUS_LABELS, DECLARED_STATUS_LABELS, RECURRENCE_LABELS, NTH_LABELS,
} from "@/types";
import { formatDate, formatDateWithWeekday, cn } from "@/lib/utils";
import {
  generateSlots, groupSlotsByDate, durationForType, nowInAppTz,
  toMinutes, fromMinutes, toDateStr, durationOf, blockAppliesOn, type Slot,
} from "@/lib/availability";

// ── Bishopric helpers ─────────────────────────────────────────────────────────

/** Members who can conduct interviews (bishop + counselors). */
function deriveInterviewers(bishopric: BishopricMember[]): BishopricMember[] {
  return bishopric.filter((m) => m.role === "bishop" || m.role === "counselor");
}
function deriveBishop(bishopric: BishopricMember[]): BishopricMember | undefined {
  return bishopric.find((m) => m.role === "bishop");
}

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
  return formatDateWithWeekday(dateStr);
}

function stageLabel(stage: InterviewStage): string {
  return INTERVIEW_STAGES.find((s) => s.stage === stage)?.label ?? stage;
}

const TODAY = toDateStr(nowInAppTz());
const SETTLEMENT_YEAR = nowInAppTz().getFullYear();

/** An unguessable token for a personalized booking link (~32 bytes, base64url). */
function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Human-readable recurrence for an availability block's list row. */
function recurrenceLabel(b: AvailabilityBlock): string {
  const rec = b.recurrence ?? "weekly";
  const day = WEEKDAY_LABELS[b.weekday];
  if (rec === "weekly") return `Every ${day}`;
  if (rec === "biweekly") return `Every other ${day}`;
  if (rec === "every_n_weeks") return `Every ${b.intervalWeeks ?? 2} weeks · ${day}`;
  if (rec === "nth_weekday") return `${NTH_LABELS[b.nth ?? 1] ?? "First"} ${day} of the month`;
  return day;
}

const SETTLEMENT_STATUS_COLORS: Record<SettlementStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  invited:     "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  scheduled:   "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
  completed:   "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200",
  declined:    "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  exempt:      "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
};

const SETTLEMENT_STATUSES: SettlementStatus[] = [
  "not_started", "invited", "scheduled", "completed", "declined", "exempt",
];
const DECLARED_STATUSES: DeclaredTithingStatus[] = ["full", "partial", "non", "exempt"];

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
                  {restrictToMember}
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

// ── List View (compact alternative to the kanban board) ─────────────────────────

interface ListViewProps {
  interviews: Interview[];
  onSelect: (i: Interview) => void;
}

/** A subtitle line for a list row: the booked slot, or the next action to take. */
function listRowSubtitle(i: Interview): string {
  const stage = deriveStage(i);
  if (i.scheduledDate && (stage === "scheduled" || stage === "pending_confirmation" || stage === "date_passed" || stage === "completed")) {
    const when = `${formatDate(i.scheduledDate)}${i.scheduledTime ? ` · ${formatTime(i.scheduledTime)}` : ""}`;
    return i.interviewer ? `${when} · ${i.interviewer}` : when;
  }
  return NEXT_ACTION[stage];
}

function ListView({ interviews, onSelect }: ListViewProps) {
  const groups = INTERVIEW_PIPELINE
    .map((stage) => ({ stage, items: interviews.filter((i) => deriveStage(i) === stage) }))
    .filter((g) => g.items.length > 0);

  if (interviews.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No interviews yet. Add one to get started.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ stage, items }) => (
        <div key={stage}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{stageLabel(stage)}</p>
            <span className={cn("rounded-full px-1.5 text-[10px] font-bold tabular-nums", INTERVIEW_STAGE_COLORS[stage])}>
              {items.length}
            </span>
          </div>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {items.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => onSelect(i)}
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent"
              >
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 bg-primary/10 text-primary">
                  {getInitials(i.memberName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{i.memberName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {INTERVIEW_TYPE_LABELS[i.type]} · {listRowSubtitle(i)}
                  </p>
                </div>
                <Badge className={cn("text-[10px] shrink-0", INTERVIEW_STAGE_COLORS[stage])}>
                  {stageLabel(stage)}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Calendar (week) View ────────────────────────────────────────────────────────

const HOUR_PX = 44; // vertical pixels per hour in the week grid

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // back up to Sunday
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

interface CalItem {
  interview: Interview;
  startM: number;
  endM: number;
  lane: number;
}

/** Assign overlapping interviews to side-by-side lanes within a day column. */
function layoutDay(interviews: Interview[]): { items: CalItem[]; lanes: number } {
  const sorted = interviews
    .map((i) => {
      const startM = toMinutes(i.scheduledTime!);
      return { interview: i, startM, endM: startM + durationOf(i), lane: 0 };
    })
    .sort((a, b) => a.startM - b.startM || a.endM - b.endM);

  const laneEnds: number[] = [];
  for (const it of sorted) {
    let lane = laneEnds.findIndex((end) => end <= it.startM);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.endM);
    } else {
      laneEnds[lane] = it.endM;
    }
    it.lane = lane;
  }
  return { items: sorted, lanes: Math.max(1, laneEnds.length) };
}

interface CalendarViewProps {
  interviews: Interview[];
  availability: AvailabilityBlock[];
  exceptions: AvailabilityException[];
  onSelect: (i: Interview) => void;
}

function CalendarView({ interviews, availability, exceptions, onSelect }: CalendarViewProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(nowInAppTz()));
  const todayStr = toDateStr(nowInAppTz());

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Interviews that have a concrete date+time within the visible week.
  const scheduledInterviews = useMemo(
    () => interviews.filter((i) => i.scheduledDate && i.scheduledTime),
    [interviews],
  );

  // Availability bands per day (union of interviewer windows honoring exceptions).
  const bandsByDate = useMemo(() => {
    const map = new Map<string, { start: number; end: number }[]>();
    for (const day of days) {
      const dateStr = toDateStr(day);
      const bands = availability
        .filter((b) => blockAppliesOn(b, day))
        .filter((b) => !exceptions.some(
          (e) => e.memberId === b.memberId && dateStr >= e.startDate && dateStr <= e.endDate,
        ))
        .map((b) => ({ start: toMinutes(b.startTime), end: toMinutes(b.endTime) }));
      map.set(dateStr, bands);
    }
    return map;
  }, [days, availability, exceptions]);

  // Dynamic vertical bounds: fit availability + booked interviews, min 8am–8pm.
  const [minM, maxM] = useMemo(() => {
    let lo = 8 * 60;
    let hi = 20 * 60;
    for (const bands of bandsByDate.values()) {
      for (const b of bands) { lo = Math.min(lo, b.start); hi = Math.max(hi, b.end); }
    }
    for (const i of scheduledInterviews) {
      const inWeek = days.some((d) => toDateStr(d) === i.scheduledDate);
      if (!inWeek) continue;
      const s = toMinutes(i.scheduledTime!);
      lo = Math.min(lo, s); hi = Math.max(hi, s + durationOf(i));
    }
    return [Math.floor(lo / 60) * 60, Math.ceil(hi / 60) * 60];
  }, [bandsByDate, scheduledInterviews, days]);

  const totalMin = Math.max(60, maxM - minM);
  const gridHeight = (totalMin / 60) * HOUR_PX;
  const hours = Array.from({ length: totalMin / 60 + 1 }, (_, i) => minM + i * 60);
  const yFor = (m: number) => ((m - minM) / 60) * HOUR_PX;

  const label = `${formatDate(toDateStr(weekStart))} – ${formatDate(toDateStr(addDays(weekStart, 6)))}`;

  return (
    <div className="space-y-3">
      {/* Week nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDays(w, -7))} aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setWeekStart(startOfWeek(nowInAppTz()))}>
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDays(w, 7))} aria-label="Next week">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <div style={{ minWidth: 640 }}>
          {/* Day headers */}
          <div className="flex border-b border-border">
            <div className="w-12 shrink-0" />
            {days.map((d) => {
              const dateStr = toDateStr(d);
              const isToday = dateStr === todayStr;
              return (
                <div key={dateStr} className={cn("flex-1 py-2 text-center border-l border-border", isToday && "bg-primary/5")}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{WEEKDAY_LABELS[d.getDay()].slice(0, 3)}</p>
                  <p className={cn("text-sm font-semibold", isToday ? "text-primary" : "text-foreground")}>{d.getDate()}</p>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="flex" style={{ height: gridHeight }}>
            {/* Time gutter */}
            <div className="relative w-12 shrink-0">
              {hours.map((h) => (
                <div key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: yFor(h) }}>
                  {formatTime(fromMinutes(h))}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((d) => {
              const dateStr = toDateStr(d);
              const isToday = dateStr === todayStr;
              const bands = bandsByDate.get(dateStr) ?? [];
              const dayInterviews = scheduledInterviews.filter((i) => i.scheduledDate === dateStr);
              const { items, lanes } = layoutDay(dayInterviews);
              return (
                <div key={dateStr} className={cn("relative flex-1 border-l border-border", isToday && "bg-primary/5")}>
                  {/* Hour lines */}
                  {hours.map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-border/50" style={{ top: yFor(h) }} />
                  ))}
                  {/* Availability bands */}
                  {bands.map((b, idx) => (
                    <div
                      key={idx}
                      className="absolute inset-x-0.5 rounded bg-green-500/10 border border-green-500/20"
                      style={{ top: yFor(b.start), height: Math.max(4, yFor(b.end) - yFor(b.start)) }}
                    />
                  ))}
                  {/* Interview blocks */}
                  {items.map(({ interview: i, startM, endM, lane }) => {
                    const stage = deriveStage(i);
                    return (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => onSelect(i)}
                        className={cn(
                          "absolute rounded-md border px-1 py-0.5 text-left overflow-hidden transition-shadow hover:shadow-md hover:z-10",
                          INTERVIEW_STAGE_COLORS[stage],
                        )}
                        style={{
                          top: yFor(startM),
                          height: Math.max(16, yFor(endM) - yFor(startM) - 1),
                          left: `${(lane / lanes) * 100}%`,
                          width: `${(1 / lanes) * 100}%`,
                        }}
                        title={`${i.memberName} · ${INTERVIEW_TYPE_LABELS[i.type]}`}
                      >
                        <p className="text-[10px] font-semibold leading-tight truncate">{i.memberName}</p>
                        <p className="text-[9px] leading-tight truncate opacity-80">{formatTime(i.scheduledTime!)}</p>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm bg-green-500/20 border border-green-500/30" /> Open availability
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-3 rounded-sm", INTERVIEW_STAGE_COLORS.scheduled)} /> Scheduled
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-3 rounded-sm", INTERVIEW_STAGE_COLORS.pending_confirmation)} /> Confirming
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-3 rounded-sm", INTERVIEW_STAGE_COLORS.completed)} /> Completed
        </span>
      </div>
    </div>
  );
}

// ── Availability View ───────────────────────────────────────────────────────────

interface AvailabilityViewProps {
  availability: AvailabilityBlock[];
  exceptions: AvailabilityException[];
  interviewers: BishopricMember[];
  onAddBlock: (m: BishopricMember) => void;
  onDeleteBlock: (id: string) => void;
  onAddException: (m: BishopricMember) => void;
  onDeleteException: (id: string) => void;
}

function AvailabilityView({
  availability, exceptions, interviewers, onAddBlock, onDeleteBlock, onAddException, onDeleteException,
}: AvailabilityViewProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Set the weekly hours each member is free for interviews. The scheduler slices these into
        bookable slots. Add time off to block a day or week (e.g. out of town).
      </p>
      {interviewers.map((m) => {
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
                        <span className="min-w-0">
                          <span className="font-medium flex items-center gap-1">
                            {(b.recurrence ?? "weekly") !== "weekly" && <Repeat className="h-3 w-3 text-muted-foreground shrink-0" />}
                            {recurrenceLabel(b)}
                          </span>
                          <span className="text-muted-foreground text-xs"> {formatTime(b.startTime)}–{formatTime(b.endTime)}</span>
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

// ── Tithing Settlement View ─────────────────────────────────────────────────────

type SettlementSegment = "all" | "not_started" | "invited" | "scheduled" | "done";

interface SettlementRowState {
  member: Member;
  name: string;
  record?: SettlementRecord;
  token?: BookingToken;
  interview?: Interview;
  status: SettlementStatus;
}

interface SettlementViewProps {
  members: Member[];
  settlements: SettlementRecord[];
  bookingTokens: BookingToken[];
  interviews: Interview[];
  onGenerate: (member: Member) => void;
  onGenerateAll: (members: Member[]) => void;
  onSetStatus: (member: Member, record: SettlementRecord | undefined, status: SettlementStatus) => void;
  onSetDeclared: (member: Member, record: SettlementRecord | undefined, declared: DeclaredTithingStatus) => void;
}

function bookingUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/book/${token}`;
}

/** Short relative time, e.g. "3d ago", for link-open timestamps. */
function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** CSV-escape a cell (quote if it contains a comma, quote, or newline). */
function csvCell(v?: string): string {
  const s = v ?? "";
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build and download a CSV of every member's settlement status + booking link. */
function downloadSettlementCsv(rows: SettlementRowState[]) {
  const header = ["Name", "Email", "Phone", "Status", "Opened", "Booking Link", "Scheduled"];
  const lines = rows.map((r) => {
    const opened = r.token?.openedAt ? `Yes (${r.token.openCount ?? 1}x)` : r.token ? "No" : "";
    const link = r.token ? bookingUrl(r.token.token) : "";
    const sched = r.interview?.scheduledDate
      ? [r.interview.scheduledDate, r.interview.scheduledTime, r.interview.interviewer].filter(Boolean).join(" ")
      : "";
    return [r.name, r.member.email, r.member.phone, SETTLEMENT_STATUS_LABELS[r.status], opened, link, sched]
      .map(csvCell)
      .join(",");
  });
  const csv = [header.join(","), ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tithing-settlement-${SETTLEMENT_YEAR}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Progress ring: a single green arc showing percent complete, big % in center. */
function ProgressRing({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90" aria-hidden>
      <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
      <circle
        cx="40" cy="40" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
        className="stroke-green-500 transition-all duration-500"
        strokeDasharray={`${filled} ${c - filled}`}
      />
      <text x="40" y="40" transform="rotate(90 40 40)" textAnchor="middle" dominantBaseline="central"
        className="fill-foreground font-bold" style={{ fontSize: 18 }}>
        {pct}%
      </text>
    </svg>
  );
}

/** Ordered status segments for the breakdown bar + legend (colored dots). */
const BREAKDOWN: { key: SettlementStatus[]; label: string; bar: string; dot: string }[] = [
  { key: ["completed", "exempt"], label: "Done",      bar: "bg-green-500",  dot: "bg-green-500" },
  { key: ["scheduled"],           label: "Scheduled", bar: "bg-blue-500",   dot: "bg-blue-500" },
  { key: ["invited"],             label: "Invited",   bar: "bg-amber-400",  dot: "bg-amber-400" },
  { key: ["declined"],            label: "Declined",  bar: "bg-red-400",    dot: "bg-red-400" },
  { key: ["not_started"],         label: "Not started", bar: "bg-muted-foreground/30", dot: "bg-muted-foreground/40" },
];

function BreakdownBar({ rows }: { rows: SettlementRowState[] }) {
  const total = rows.length || 1;
  const seg = BREAKDOWN.map((b) => ({
    ...b,
    n: rows.filter((r) => b.key.includes(r.status)).length,
  }));
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {seg.map((s) => s.n > 0 && (
          <div key={s.label} className={cn("h-full", s.bar)} style={{ width: `${(s.n / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {seg.filter((s) => s.n > 0).map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", s.dot)} /> {s.label} <span className="font-semibold text-foreground">{s.n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SettlementView({
  members, settlements, bookingTokens, interviews, onGenerate, onGenerateAll, onSetStatus, onSetDeclared,
}: SettlementViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<SettlementSegment>("all");

  const rows: SettlementRowState[] = useMemo(() => {
    const active = members.filter((m) => m.isActive);
    return active.map((m) => {
      const name = `${m.firstName} ${m.lastName}`;
      const record = settlements.find((s) => s.memberId === m.id && s.year === SETTLEMENT_YEAR);
      const token = bookingTokens
        .filter((t) => t.memberId === m.id && t.year === SETTLEMENT_YEAR && !t.usedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const interview = record?.interviewId
        ? interviews.find((i) => i.id === record.interviewId)
        : undefined;
      return { member: m, name, record, token, interview, status: record?.status ?? "not_started" };
    });
  }, [members, settlements, bookingTokens, interviews]);

  const total = rows.length;
  const inSegment = (r: SettlementRowState, s: SettlementSegment) =>
    s === "all" ? true
    : s === "done" ? (r.status === "completed" || r.status === "exempt" || r.status === "declined")
    : r.status === s;

  const count = (s: SettlementSegment) => rows.filter((r) => inSegment(r, s)).length;
  const completedN = rows.filter((r) => r.status === "completed" || r.status === "exempt").length;
  const invitedN = count("invited");
  const openedNotBooked = rows.filter((r) => r.status === "invited" && r.token?.openedAt).length;
  const remaining = rows.filter((r) => r.status === "not_started" || r.status === "invited");
  const pct = total > 0 ? Math.round((completedN / total) * 100) : 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => inSegment(r, segment) && (!q || r.name.toLowerCase().includes(q)));
  }, [rows, segment, query]);

  async function copy(token: BookingToken) {
    try {
      await navigator.clipboard.writeText(bookingUrl(token.token));
      setCopiedId(token.id);
      setTimeout(() => setCopiedId((c) => (c === token.id ? null : c)), 1800);
    } catch {
      // Clipboard may be blocked; ignore.
    }
  }

  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No active ward members yet. Add members to track tithing settlement.
      </div>
    );
  }

  const SEGMENTS: { seg: SettlementSegment; label: string }[] = [
    { seg: "all",         label: "All" },
    { seg: "not_started", label: "Not started" },
    { seg: "invited",     label: "Invited" },
    { seg: "scheduled",   label: "Scheduled" },
    { seg: "done",        label: "Done" },
  ];

  return (
    <div className="space-y-4">
      {/* Progress header: ring + breakdown + bulk action */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <ProgressRing pct={pct} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{SETTLEMENT_YEAR} Tithing Settlement</p>
                <p className="text-xs text-muted-foreground">
                  {completedN} of {total} complete · {remaining.length} to go
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadSettlementCsv(rows)}>
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">CSV</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={remaining.length === 0}
                  onClick={() => onGenerateAll(remaining.map((r) => r.member))}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Generate all remaining</span>
                  <span className="sm:hidden">All links</span>
                </Button>
              </div>
            </div>
            <BreakdownBar rows={rows} />
          </div>
        </div>

        {/* Follow-up nudge: invited but not yet booked is where a sprint stalls.
            "Opened but didn't book" is the hotter signal, so it leads. */}
        {invitedN > 0 && (
          <button
            type="button"
            onClick={() => setSegment("invited")}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            <Send className="h-3.5 w-3.5 shrink-0" />
            {openedNotBooked > 0 ? (
              <span><strong>{openedNotBooked}</strong> opened their link but haven&apos;t booked yet — good time to follow up.</span>
            ) : (
              <span><strong>{invitedN}</strong> {invitedN === 1 ? "person has" : "people have"} a link but haven&apos;t opened it yet.</span>
            )}
          </button>
        )}
      </div>

      {/* Filter chips + search */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {SEGMENTS.map(({ seg, label }) => {
            const n = count(seg);
            const active = segment === seg;
            return (
              <button
                key={seg}
                type="button"
                onClick={() => setSegment(seg)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {label}
                <span className={cn(
                  "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members…"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Roster */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No members match.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {filtered.map((r) => (
            <div key={r.member.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-primary/10 text-primary">
                {getInitials(r.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{r.name}</p>
                {/* Booked slot, once scheduled */}
                {r.interview?.scheduledDate && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                    <CalendarClock className="h-3 w-3 shrink-0" />
                    {formatDate(r.interview.scheduledDate)}
                    {r.interview.scheduledTime ? ` · ${formatTime(r.interview.scheduledTime)}` : ""}
                    {r.interview.interviewer ? ` · ${r.interview.interviewer}` : ""}
                  </p>
                )}
                {!r.interview?.scheduledDate && r.record?.declaredStatus && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    Declared: {DECLARED_STATUS_LABELS[r.record.declaredStatus]}
                  </p>
                )}
                {/* Link-open signal, for members invited but not yet booked. */}
                {r.status === "invited" && r.token && (
                  <p className={cn(
                    "flex items-center gap-1 text-[11px] truncate",
                    r.token.openedAt ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                  )}>
                    <Eye className="h-3 w-3 shrink-0" />
                    {r.token.openedAt ? `Opened ${timeAgo(r.token.openedAt)} · not booked` : "Link not opened yet"}
                  </p>
                )}
              </div>

              <Badge className={cn("text-[10px] shrink-0", SETTLEMENT_STATUS_COLORS[r.status])}>
                {SETTLEMENT_STATUS_LABELS[r.status]}
              </Badge>

              {/* Link actions — only meaningful until a slot is booked */}
              {r.status !== "scheduled" && r.status !== "completed" && (
                r.token ? (
                  <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => copy(r.token!)}>
                    {copiedId === r.token.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === r.token.id ? "Copied" : "Copy link"}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => onGenerate(r.member)}>
                    <Link2 className="h-3.5 w-3.5" /> Generate link
                  </Button>
                )
              )}

              {/* Status control */}
              <Select value={r.status} onValueChange={(v) => onSetStatus(r.member, r.record, v as SettlementStatus)}>
                <SelectTrigger className="h-8 w-[130px] text-xs shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SETTLEMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{SETTLEMENT_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Declared status, once completed */}
              {r.status === "completed" && (
                <Select
                  value={r.record?.declaredStatus ?? ""}
                  onValueChange={(v) => onSetDeclared(r.member, r.record, v as DeclaredTithingStatus)}
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs shrink-0">
                    <SelectValue placeholder="Declared…" />
                  </SelectTrigger>
                  <SelectContent>
                    {DECLARED_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{DECLARED_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stage Advance Panel ───────────────────────────────────────────────────────

interface AdvancePanelProps {
  interview: Interview;
  availability: AvailabilityBlock[];
  exceptions: AvailabilityException[];
  interviews: Interview[];
  interviewers: BishopricMember[];
  bishop?: BishopricMember;
  onSave: (updates: Partial<Interview> & { stage: InterviewStage }) => void;
  onClose: () => void;
  onEdit: () => void;
}

function StageAdvancePanel({
  interview, availability, exceptions, interviews, interviewers, bishop, onSave, onClose, onEdit,
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
          restrictToMember={mustBeBishop ? bishop?.name : undefined}
          allowedMembers={interviewers}
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

type PageView = "calendar" | "board" | "settlement" | "availability";

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

const EMPTY_BLOCK = {
  open: false,
  member: null as BishopricMember | null,
  weekday: 2,
  startTime: "18:00",
  endTime: "19:00",
  recurrence: "weekly" as AvailabilityRecurrence,
  intervalWeeks: 2,
  nth: 1,
};
const EMPTY_EXCEPTION = { open: false, member: null as BishopricMember | null, startDate: "", endDate: "", reason: "" };

export default function InterviewsPage() {
  const { user } = useAuth();
  const data = useData();
  const interviewsCol  = data.interviews;
  const availabilityCol = data.availability;
  const exceptionsCol  = data.exceptions;
  const settlementsCol = data.settlements;
  const bookingTokensCol = data.bookingTokens;
  const interviews   = interviewsCol.items;
  const availability = availabilityCol.items;
  const exceptions   = exceptionsCol.items;
  const settlements  = settlementsCol.items;
  const bookingTokens = bookingTokensCol.items;
  const members      = data.members;
  const bishopric    = data.bishopric;

  const INTERVIEWERS = useMemo(() => deriveInterviewers(bishopric), [bishopric]);
  const BISHOP       = useMemo(() => deriveBishop(bishopric), [bishopric]);

  const [view,       setView]       = useState<PageView>("calendar");
  const [boardMode,  setBoardMode]  = useState<"board" | "list">("board");
  const [selected,   setSelected]   = useState<Interview | null>(null);
  // Deep link from the dashboard: /interviews?new=1 opens the New dialog.
  const [dialogOpen, setDialogOpen] = useState(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("new") != null
  );
  const [editing,    setEditing]    = useState<Interview | null>(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);

  const [blockForm,     setBlockForm]     = useState(EMPTY_BLOCK);
  const [exceptionForm, setExceptionForm] = useState(EMPTY_EXCEPTION);

  // Strip the ?new deep-link param so a refresh doesn't reopen the dialog.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") != null) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // ── Derived counts ─────────────────────────────────────────────────────────
  const needsScheduling = interviews.filter(
    (i) => i.stage === "schedule_any" || i.stage === "schedule_bishop"
  ).length;
  const pending   = interviews.filter((i) => deriveStage(i) === "pending_confirmation").length;
  const upcoming  = interviews.filter((i) => deriveStage(i) === "scheduled").length;
  const toReview  = interviews.filter((i) => deriveStage(i) === "date_passed").length;

  // ── Interview handlers ─────────────────────────────────────────────────────

  async function patch(id: string, updates: Partial<Interview>) {
    const now = new Date().toISOString();
    await interviewsCol.update(id, { ...updates, updatedAt: now });
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
      await patch(editing.id, fields);
    } else {
      const newInterview: Interview = {
        id: newId(),
        ...fields,
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      };
      await interviewsCol.create(newInterview);
    }
    setDialogOpen(false);
    setSaving(false);
  }

  // ── Availability handlers ──────────────────────────────────────────────────

  async function saveBlock() {
    if (!blockForm.member || blockForm.startTime >= blockForm.endTime) return;
    const m = blockForm.member;
    const rec = blockForm.recurrence;
    const usesInterval = rec === "biweekly" || rec === "every_n_weeks";
    await availabilityCol.create({
      id: newId(),
      memberId: m.id,
      memberName: m.name,
      weekday: blockForm.weekday,
      startTime: blockForm.startTime,
      endTime: blockForm.endTime,
      recurrence: rec,
      // every_n_weeks carries the interval; biweekly is implicitly 2.
      intervalWeeks: rec === "every_n_weeks" ? blockForm.intervalWeeks : undefined,
      nth: rec === "nth_weekday" ? blockForm.nth : undefined,
      // Phase interval recurrences from today (this week counts as "on").
      anchorDate: usesInterval ? TODAY : undefined,
    });
    setBlockForm(EMPTY_BLOCK);
  }

  async function saveException() {
    if (!exceptionForm.member || !exceptionForm.startDate) return;
    const m = exceptionForm.member;
    const endDate = exceptionForm.endDate || exceptionForm.startDate;
    if (endDate < exceptionForm.startDate) return;
    await exceptionsCol.create({
      id: newId(),
      memberId: m.id,
      memberName: m.name,
      startDate: exceptionForm.startDate,
      endDate,
      reason: exceptionForm.reason.trim() || undefined,
    });
    setExceptionForm(EMPTY_EXCEPTION);
  }

  // ── Settlement handlers ────────────────────────────────────────────────────

  const memberName = (m: Member) => `${m.firstName} ${m.lastName}`;

  /** Create (or reuse) this year's settlement record + a personalized booking link. */
  async function generateLink(m: Member) {
    const now = new Date().toISOString();
    let record = settlements.find((s) => s.memberId === m.id && s.year === SETTLEMENT_YEAR);
    if (!record) {
      record = {
        id: newId(),
        memberId: m.id,
        memberName: memberName(m),
        year: SETTLEMENT_YEAR,
        status: "invited",
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      };
      await settlementsCol.create(record);
    } else if (record.status === "not_started") {
      await settlementsCol.update(record.id, { status: "invited" });
    }
    const token: BookingToken = {
      id: newId(),
      token: generateToken(),
      memberId: m.id,
      memberName: memberName(m),
      purpose: "tithing_settlement",
      year: SETTLEMENT_YEAR,
      settlementRecordId: record.id,
      createdBy: user?.uid ?? "mock",
      createdAt: now,
      updatedAt: now,
    };
    await bookingTokensCol.create(token);
  }

  async function generateAll(ms: Member[]) {
    for (const m of ms) {
      const hasToken = bookingTokens.some(
        (t) => t.memberId === m.id && t.year === SETTLEMENT_YEAR && !t.usedAt,
      );
      if (!hasToken) await generateLink(m);
    }
  }

  async function setSettlementStatus(
    m: Member, record: SettlementRecord | undefined, status: SettlementStatus,
  ) {
    const now = new Date().toISOString();
    if (record) {
      await settlementsCol.update(record.id, { status });
    } else {
      await settlementsCol.create({
        id: newId(), memberId: m.id, memberName: memberName(m), year: SETTLEMENT_YEAR,
        status, createdBy: user?.uid ?? "mock", createdAt: now, updatedAt: now,
      });
    }
  }

  async function setDeclared(
    m: Member, record: SettlementRecord | undefined, declared: DeclaredTithingStatus,
  ) {
    const now = new Date().toISOString();
    if (record) {
      await settlementsCol.update(record.id, { declaredStatus: declared });
    } else {
      await settlementsCol.create({
        id: newId(), memberId: m.id, memberName: memberName(m), year: SETTLEMENT_YEAR,
        status: "completed", declaredStatus: declared,
        createdBy: user?.uid ?? "mock", createdAt: now, updatedAt: now,
      });
    }
  }

  // ── Settlement counts (for the tab badge / header) ──────────────────────────
  const activeMemberCount = members.filter((m) => m.isActive).length;
  const settlementDone = members.filter((m) => {
    const r = settlements.find((s) => s.memberId === m.id && s.year === SETTLEMENT_YEAR);
    return m.isActive && (r?.status === "completed" || r?.status === "exempt");
  }).length;
  const settlementRemaining = activeMemberCount - settlementDone;

  const TAB_CONFIG: { view: PageView; label: string; count?: number }[] = [
    { view: "calendar",     label: "Calendar" },
    { view: "board",        label: "Board",              count: needsScheduling + toReview },
    { view: "settlement",   label: "Tithing Settlement", count: settlementRemaining },
    { view: "availability", label: "Availability",       count: availability.length },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full p-4 lg:p-8 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduling</h1>
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
      {view === "calendar" && (
        <CalendarView
          interviews={interviews}
          availability={availability}
          exceptions={exceptions}
          onSelect={setSelected}
        />
      )}

      {view === "board" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {([["board", "Board", Columns3], ["list", "List", List]] as const).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setBoardMode(mode)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    boardMode === mode ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>
          {boardMode === "board" ? (
            <KanbanView interviews={interviews} onSelect={setSelected} onMove={handleMove} />
          ) : (
            <ListView interviews={interviews} onSelect={setSelected} />
          )}
        </div>
      )}

      {view === "settlement" && (
        <SettlementView
          members={members}
          settlements={settlements}
          bookingTokens={bookingTokens}
          interviews={interviews}
          onGenerate={(m) => { void generateLink(m); }}
          onGenerateAll={(ms) => { void generateAll(ms); }}
          onSetStatus={(m, r, s) => { void setSettlementStatus(m, r, s); }}
          onSetDeclared={(m, r, d) => { void setDeclared(m, r, d); }}
        />
      )}

      {view === "availability" && (
        <AvailabilityView
          availability={availability}
          exceptions={exceptions}
          interviewers={INTERVIEWERS}
          onAddBlock={(m) => setBlockForm({ ...EMPTY_BLOCK, open: true, member: m })}
          onDeleteBlock={(id) => { void availabilityCol.remove(id); }}
          onAddException={(m) => setExceptionForm({ ...EMPTY_EXCEPTION, open: true, member: m })}
          onDeleteException={(id) => { void exceptionsCol.remove(id); }}
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
                  interviewers={INTERVIEWERS}
                  bishop={BISHOP}
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
            <div className="space-y-1.5">
              <Label>Repeats</Label>
              <Select
                value={blockForm.recurrence}
                onValueChange={(v) => setBlockForm((f) => ({ ...f, recurrence: v as AvailabilityRecurrence }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(RECURRENCE_LABELS) as AvailabilityRecurrence[]).map((r) => (
                    <SelectItem key={r} value={r}>{RECURRENCE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {blockForm.recurrence === "every_n_weeks" && (
              <div className="space-y-1.5">
                <Label htmlFor="intWeeks">Every how many weeks?</Label>
                <Input
                  id="intWeeks" type="number" min={2} max={12}
                  value={blockForm.intervalWeeks}
                  onChange={(e) => setBlockForm((f) => ({ ...f, intervalWeeks: Math.max(2, Number(e.target.value) || 2) }))}
                />
                <p className="text-xs text-muted-foreground">Counting from this week.</p>
              </div>
            )}

            {blockForm.recurrence === "nth_weekday" && (
              <div className="space-y-1.5">
                <Label>Which {WEEKDAY_LABELS[blockForm.weekday]} of the month?</Label>
                <Select
                  value={String(blockForm.nth)}
                  onValueChange={(v) => setBlockForm((f) => ({ ...f, nth: Number(v) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, -1].map((n) => (
                      <SelectItem key={n} value={String(n)}>{NTH_LABELS[n]} {WEEKDAY_LABELS[blockForm.weekday]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
