"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Plus, CalendarClock, Clock, User, GripVertical, CalendarPlus,
  CheckCircle2, AlertTriangle, Pencil, RotateCcw,
  CalendarDays, CalendarOff, Trash2, Check, Link2, Copy, Repeat, Search, Send,
  ChevronLeft, ChevronRight, ChevronDown, List, Columns3, Download, Eye, Star, Mail, Loader2,
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
import {
  DEFAULT_SETTLEMENT_EMAIL, renderSettlementEmail, settlementTitle, withDefaults,
  type SettlementEmailTemplate,
} from "@/lib/settlement-email";
import {
  householdKey, headOfHousehold, householdMembersOf, tokenHouseholdKey,
  householdParents, householdLabel,
} from "@/lib/household";

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
  not_started:  "bg-muted text-muted-foreground",
  link_created: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  link_opened:  "bg-amber-200 text-amber-900 dark:bg-amber-800/70 dark:text-amber-100",
  scheduled:    "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
  completed:    "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200",
  declined:     "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  exempt:       "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
};

const SETTLEMENT_STATUSES: SettlementStatus[] = [
  "not_started", "link_created", "link_opened", "scheduled", "completed", "declined", "exempt",
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
  /** The bishop's member id, so must-be-bishop interviews close his slots. */
  bishopMemberId?: string;
}

function SlotPicker({
  availability, exceptions, interviews, durationMins,
  restrictToMember, allowedMembers, value, onChange, ignoreInterviewId, bishopMemberId,
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
    bishopMemberId,
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
                    <span className="flex items-center gap-1">
                      {s.preferred && (
                        <Star
                          className={cn("h-3 w-3 shrink-0", isSelected(s) ? "fill-current" : "fill-amber-400 text-amber-400")}
                          aria-label="Preferred time"
                        />
                      )}
                      {formatTime(s.time)}
                    </span>
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

const HOUR_PX = 64; // vertical pixels per hour in the week grid

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

/** A contiguous run of hours the compressed axis actually draws. */
interface TimeSegment { start: number; end: number }

function CalendarView({ interviews, availability, exceptions, onSelect }: CalendarViewProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(nowInAppTz()));
  // When true, fall back to the full Sun–Sat week instead of active days only.
  const [showAllDays, setShowAllDays] = useState(false);
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

  // Booked interviews per day, so both "is this day active" and the columns
  // read from the same source.
  const apptsByDate = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const day of days) {
      const dateStr = toDateStr(day);
      map.set(dateStr, scheduledInterviews.filter((i) => i.scheduledDate === dateStr));
    }
    return map;
  }, [days, scheduledInterviews]);

  // A day earns a column only if availability is entered or something is booked.
  const dayIsActive = useMemo(() => {
    return (day: Date) => {
      const ds = toDateStr(day);
      return (bandsByDate.get(ds)?.length ?? 0) > 0 || (apptsByDate.get(ds)?.length ?? 0) > 0;
    };
  }, [bandsByDate, apptsByDate]);

  const activeDays = useMemo(() => days.filter(dayIsActive), [days, dayIsActive]);
  const hiddenCount = days.length - activeDays.length;
  // No active days at all → show the whole week so it isn't an empty shell.
  const visibleDays = useMemo(
    () => (showAllDays || activeDays.length === 0 ? days : activeDays),
    [showAllDays, activeDays, days],
  );

  // Compress the vertical axis: instead of one continuous 8am–8pm ruler, draw
  // only the hour ranges that actually hold availability or a booking across the
  // visible days. Overlapping/adjacent ranges merge; the gaps between the
  // resulting segments collapse to a labelled divider.
  const segments = useMemo<TimeSegment[]>(() => {
    const raw: [number, number][] = [];
    for (const day of visibleDays) {
      const ds = toDateStr(day);
      for (const b of bandsByDate.get(ds) ?? []) raw.push([b.start, b.end]);
      for (const i of apptsByDate.get(ds) ?? []) {
        const s = toMinutes(i.scheduledTime!);
        raw.push([s, s + durationOf(i)]);
      }
    }
    if (raw.length === 0) return [{ start: 8 * 60, end: 20 * 60 }];
    const rounded = raw
      .map(([s, e]) => [Math.floor(s / 60) * 60, Math.ceil(e / 60) * 60] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const merged: TimeSegment[] = [];
    for (const [s, e] of rounded) {
      const last = merged[merged.length - 1];
      if (last && s <= last.end) last.end = Math.max(last.end, e);
      else merged.push({ start: s, end: e });
    }
    return merged;
  }, [visibleDays, bandsByDate, apptsByDate]);

  const label = `${formatDate(toDateStr(weekStart))} – ${formatDate(toDateStr(addDays(weekStart, 6)))}`;
  const canToggleDays = activeDays.length > 0 && hiddenCount > 0;

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
      <div className="overflow-hidden rounded-xl border border-border bg-card min-h-[420px]">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 480 }}>
            {/* Day headers */}
            <div className="flex border-b border-border">
              <div className="w-12 shrink-0" />
              {visibleDays.map((d) => {
                const dateStr = toDateStr(d);
                const isToday = dateStr === todayStr;
                const active = dayIsActive(d);
                return (
                  <div key={dateStr} className={cn("flex-1 py-2 text-center border-l border-border", isToday && "bg-primary/5")}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{WEEKDAY_LABELS[d.getDay()].slice(0, 3)}</p>
                    <p className={cn(
                      "text-sm font-semibold",
                      isToday ? "text-primary" : active ? "text-foreground" : "font-medium text-muted-foreground/60",
                    )}>
                      {d.getDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Compressed time grid: one body per active segment, dividers between. */}
            {segments.map((seg, si) => {
              const segTotal = Math.max(60, seg.end - seg.start);
              const segHeight = (segTotal / 60) * HOUR_PX;
              const segHours = Array.from({ length: Math.floor(segTotal / 60) + 1 }, (_, i) => seg.start + i * 60);
              const yFor = (m: number) => ((m - seg.start) / 60) * HOUR_PX;
              const prev = si > 0 ? segments[si - 1] : null;
              return (
                <div key={seg.start}>
                  {/* Collapsed-time divider */}
                  {prev && (
                    <div className="flex items-center gap-2 border-y border-dashed border-border bg-muted/30 py-1 pl-14 pr-4">
                      <span className="h-px flex-1 border-t border-dashed border-border" />
                      <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                        {formatTime(fromMinutes(prev.end))} – {formatTime(fromMinutes(seg.start))} · no availability
                      </span>
                      <span className="h-px flex-1 border-t border-dashed border-border" />
                    </div>
                  )}

                  <div className="flex" style={{ height: segHeight }}>
                    {/* Time gutter */}
                    <div className="relative w-12 shrink-0">
                      {segHours.map((h) => (
                        <div key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ top: yFor(h) }}>
                          {formatTime(fromMinutes(h))}
                        </div>
                      ))}
                    </div>

                    {/* Day columns */}
                    {visibleDays.map((d) => {
                      const dateStr = toDateStr(d);
                      const isToday = dateStr === todayStr;
                      const bands = (bandsByDate.get(dateStr) ?? []).filter((b) => b.end > seg.start && b.start < seg.end);
                      const dayInterviews = apptsByDate.get(dateStr) ?? [];
                      const { items, lanes } = layoutDay(dayInterviews);
                      return (
                        <div key={dateStr} className={cn("relative flex-1 border-l border-border", isToday && "bg-primary/5")}>
                          {/* Hour lines */}
                          {segHours.map((h) => (
                            <div key={h} className="absolute inset-x-0 border-t border-border/50" style={{ top: yFor(h) }} />
                          ))}
                          {/* Availability bands (clipped to this segment) */}
                          {bands.map((b, idx) => {
                            const ts = Math.max(b.start, seg.start);
                            const te = Math.min(b.end, seg.end);
                            return (
                              <div
                                key={idx}
                                className="absolute inset-x-0.5 rounded bg-green-500/10 border border-green-500/20"
                                style={{ top: yFor(ts), height: Math.max(4, yFor(te) - yFor(ts)) }}
                              />
                            );
                          })}
                          {/* Interview blocks that fall inside this segment */}
                          {items.map(({ interview: i, startM, endM, lane }) => {
                            if (endM <= seg.start || startM >= seg.end) return null;
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
              );
            })}
            {/* Clearance so the final segment's bottom hour label (centered on
                the boundary) isn't clipped by the card's overflow-hidden. */}
            <div className="h-3 shrink-0" />
          </div>
        </div>

        {/* Hidden-days affordance: honest and reversible. */}
        {canToggleDays && (
          <div className="flex items-center justify-center gap-2 border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {!showAllDays && (
              <span>{hiddenCount} {hiddenCount === 1 ? "day" : "days"} hidden — no availability</span>
            )}
            <button
              type="button"
              onClick={() => setShowAllDays((v) => !v)}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <Eye className="h-3.5 w-3.5" />
              {showAllDays ? "Collapse to active days" : "Show all days"}
            </button>
          </div>
        )}
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
                          {b.preferredTime && (
                            <span className="text-muted-foreground text-xs"> · prefers {formatTime(b.preferredTime)}</span>
                          )}
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

type SettlementSegment = "all" | "not_started" | "link" | "scheduled" | "done";

interface SettlementRowState {
  /** The head of household — drives link/appointment and status controls. */
  member: Member;
  /** Household label, e.g. "the Smith household" (or a person's name). */
  name: string;
  householdId: string;
  /** Every active member of the household. */
  householdMembers: Member[];
  /** The parents (head + spouse) — the settlement-email recipients. */
  parents: Member[];
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
  /** Generate (or reuse) an individual, single-member link for one household member. */
  onGenerateIndividual: (member: Member) => void;
  /** The saved template used to pre-fill the compose dialog. */
  emailTemplate: SettlementEmailTemplate;
  /** Email one member their (household) booking link with the given template. */
  onEmail: (member: Member, tpl: SettlementEmailTemplate) => Promise<boolean>;
  /** Email one member their own individual link with the given template. */
  onEmailIndividual: (member: Member, tpl: SettlementEmailTemplate) => Promise<boolean>;
  /** Email the given members their links; resolves with how many were sent. */
  onEmailSelected: (members: Member[], tpl: SettlementEmailTemplate) => Promise<number>;
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

/** Build and download a CSV of every household's settlement status + booking link. */
function downloadSettlementCsv(rows: SettlementRowState[]) {
  const header = ["Household", "Parents", "Parent Emails", "Members", "Status", "Emailed", "Opened", "Booking Link", "Scheduled"];
  const lines = rows.map((r) => {
    const opened = r.token?.openedAt ? `Yes (${r.token.openCount ?? 1}x)` : r.token ? "No" : "";
    const emailed = r.record?.linkSentAt ? r.record.linkSentAt.slice(0, 10) : "";
    const link = r.token ? bookingUrl(r.token.token) : "";
    const sched = r.interview?.scheduledDate
      ? [r.interview.scheduledDate, r.interview.scheduledTime, r.interview.interviewer].filter(Boolean).join(" ")
      : "";
    const parents = r.parents.map((p) => `${p.firstName} ${p.lastName}`).join("; ");
    const parentEmails = r.parents.map((p) => p.email).filter(Boolean).join("; ");
    return [r.name, parents, parentEmails, String(r.householdMembers.length),
      SETTLEMENT_STATUS_LABELS[r.status], emailed, opened, link, sched]
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
  { key: ["completed", "exempt"], label: "Done",         bar: "bg-green-500",  dot: "bg-green-500" },
  { key: ["scheduled"],           label: "Scheduled",    bar: "bg-blue-500",   dot: "bg-blue-500" },
  { key: ["link_opened"],         label: "Opened",       bar: "bg-amber-500",  dot: "bg-amber-500" },
  { key: ["link_created"],        label: "Link created", bar: "bg-amber-300",  dot: "bg-amber-300" },
  { key: ["declined"],            label: "Declined",     bar: "bg-red-400",    dot: "bg-red-400" },
  { key: ["not_started"],         label: "Not started",  bar: "bg-muted-foreground/30", dot: "bg-muted-foreground/40" },
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
  members, settlements, bookingTokens, interviews, onGenerate, onGenerateAll,
  onGenerateIndividual, emailTemplate, onEmail, onEmailIndividual, onEmailSelected,
  onSetStatus, onSetDeclared,
}: SettlementViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<SettlementSegment>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailedId, setEmailedId] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  // Households whose individual-member breakdown is expanded.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Compose dialog: opened for one household (row button) or the selected set.
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeRecipients, setComposeRecipients] = useState<Member[]>([]);
  // Set when composing for a single household (row button): its id, for the
  // "Sent" flash and message. Null when composing the whole selected set.
  const [composeHouseholdId, setComposeHouseholdId] = useState<string | null>(null);
  const [composeHouseholdName, setComposeHouseholdName] = useState<string>("");
  // Set when composing an individual member's own link (from an expanded row):
  // the member's id, so the send routes through onEmailIndividual and flashes
  // "Sent" on that member's sub-row. Null for household / selected sends.
  const [composeIndividualId, setComposeIndividualId] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState(emailTemplate.subject);
  const [draftBody, setDraftBody] = useState(emailTemplate.body);
  const [composeSending, setComposeSending] = useState(false);

  const rows: SettlementRowState[] = useMemo(() => {
    const active = members.filter((m) => m.isActive);
    // Group the active roster into households (one row per household).
    const groups = new Map<string, Member[]>();
    for (const m of active) {
      const key = householdKey(m);
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }
    const out: SettlementRowState[] = [];
    for (const [key, houseMembers] of groups) {
      const head = headOfHousehold(houseMembers);
      const parents = householdParents(houseMembers);
      const name = householdLabel(head, houseMembers.length);
      // The household's canonical record is the head's; booking marks the rest.
      const record = settlements.find((s) => s.memberId === head.id && s.year === SETTLEMENT_YEAR);
      const token = bookingTokens
        .filter((t) => !t.usedAt && t.year === SETTLEMENT_YEAR && t.scope !== "individual" && tokenHouseholdKey(t) === key)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const interview = record?.interviewId
        ? interviews.find((i) => i.id === record.interviewId)
        : undefined;
      out.push({
        member: head, name, householdId: key, householdMembers: houseMembers, parents,
        record, token, interview, status: record?.status ?? "not_started",
      });
    }
    return out.sort((a, b) =>
      a.member.lastName.localeCompare(b.member.lastName) ||
      a.member.firstName.localeCompare(b.member.firstName));
  }, [members, settlements, bookingTokens, interviews]);

  // Per-member helpers for the expanded household breakdown (individual links).
  const memberRecordOf = (m: Member) =>
    settlements.find((s) => s.memberId === m.id && s.year === SETTLEMENT_YEAR);
  const individualTokenOf = (m: Member) =>
    bookingTokens
      .filter((t) => !t.usedAt && t.year === SETTLEMENT_YEAR && t.scope === "individual" && t.memberId === m.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const memberStatusOf = (m: Member): SettlementStatus => memberRecordOf(m)?.status ?? "not_started";
  const memberInterviewOf = (rec?: SettlementRecord) =>
    rec?.interviewId ? interviews.find((i) => i.id === rec.interviewId) : undefined;

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const total = rows.length;
  // A member with a link (created or opened) who hasn't booked yet.
  const hasLink = (r: SettlementRowState) =>
    r.status === "link_created" || r.status === "link_opened";
  // Opened is authoritative from the token, so it holds even if the status
  // write lagged behind the open being recorded.
  const hasOpened = (r: SettlementRowState) =>
    r.status === "link_opened" || !!r.token?.openedAt;
  const inSegment = (r: SettlementRowState, s: SettlementSegment) =>
    s === "all" ? true
    : s === "done" ? (r.status === "completed" || r.status === "exempt" || r.status === "declined")
    : s === "link" ? hasLink(r)
    : r.status === s;

  const count = (s: SettlementSegment) => rows.filter((r) => inSegment(r, s)).length;
  const completedN = rows.filter((r) => r.status === "completed" || r.status === "exempt").length;
  const linkedN = count("link");
  const openedNotBooked = rows.filter((r) => hasLink(r) && hasOpened(r)).length;
  const remaining = rows.filter((r) => r.status === "not_started" || hasLink(r));
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

  /**
   * Who gets the household's shared link: the parents with an email on file,
   * falling back to any household member with an email when no parent has one
   * (mirrors the booking-confirmation send). De-duped by address, since family
   * members often share one household email. Empty when nobody has an email.
   */
  const recipientsOf = (r: SettlementRowState) => {
    const withEmail = (list: Member[]) => {
      const seen = new Set<string>();
      return list.filter((m) => {
        const e = m.email?.trim().toLowerCase();
        if (!e || seen.has(e)) return false;
        seen.add(e);
        return true;
      });
    };
    const parents = withEmail(r.parents);
    return parents.length ? parents : withEmail(r.householdMembers);
  };
  // A household worth emailing: still awaiting a booking and someone in it has an
  // email on file.
  const emailable = (r: SettlementRowState) =>
    recipientsOf(r).length > 0 && r.status !== "scheduled" && r.status !== "completed";

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectableIds = filtered.filter(emailable).map((r) => r.member.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  // How many selected members are still worth emailing (a selected member who
  // has since booked no longer counts toward the send).
  const selectedCount = rows.filter((r) => selected.has(r.member.id) && emailable(r)).length;
  function toggleSelectAll() {
    setSelected((prev) => {
      if (selectableIds.every((id) => prev.has(id))) {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...selectableIds]);
    });
  }

  /**
   * Open the compose dialog for a set of recipients, pre-filled from the saved
   * template. `household` (id + name) is set when emailing a single household
   * from its row, so the send can flash "Sent" on that row and message it.
   */
  function openCompose(recipients: Member[], household?: { id: string; name: string }) {
    if (recipients.length === 0) return;
    setComposeRecipients(recipients);
    setComposeHouseholdId(household?.id ?? null);
    setComposeHouseholdName(household?.name ?? "");
    setComposeIndividualId(null);
    setDraftSubject(emailTemplate.subject);
    setDraftBody(emailTemplate.body);
    setEmailMsg(null);
    setComposeOpen(true);
  }

  /** Open the compose dialog to email one household member their own individual
   *  link (from the expanded breakdown), routed through onEmailIndividual. */
  function openComposeIndividual(m: Member) {
    if (!m.email) return;
    setComposeRecipients([m]);
    setComposeHouseholdId(null);
    setComposeHouseholdName("");
    setComposeIndividualId(m.id);
    setDraftSubject(emailTemplate.subject);
    setDraftBody(emailTemplate.body);
    setEmailMsg(null);
    setComposeOpen(true);
  }

  function openComposeSelected() {
    // Recipients are the parents of every selected household still worth emailing.
    const toSend = rows
      .filter((r) => selected.has(r.member.id) && emailable(r))
      .flatMap(recipientsOf);
    openCompose(toSend);
  }

  /** Send the composed (possibly edited) template to the dialog's recipients. */
  async function sendCompose() {
    const tpl: SettlementEmailTemplate = { subject: draftSubject, body: draftBody };
    const recipients = composeRecipients;
    const householdId = composeHouseholdId;
    const householdName = composeHouseholdName;
    const individualId = composeIndividualId;
    setComposeSending(true);
    setEmailMsg(null);
    try {
      // Individual send → the member's own link via onEmailIndividual.
      if (individualId) {
        const m = recipients[0];
        const ok = await onEmailIndividual(m, tpl);
        setComposeOpen(false);
        if (ok) {
          setEmailedId(m.id);
          setTimeout(() => setEmailedId((c) => (c === m.id ? null : c)), 1800);
          setEmailMsg(`Emailed ${m.firstName} their individual link.`);
        }
        return;
      }
      // One address → onEmail; several (both parents, or a whole selection) →
      // onEmailSelected. Both ensure the shared household link before sending.
      const sent = recipients.length === 1
        ? (await onEmail(recipients[0], tpl)) ? 1 : 0
        : await onEmailSelected(recipients, tpl);
      setComposeOpen(false);
      if (householdId) {
        if (sent > 0) {
          setEmailedId(householdId);
          setTimeout(() => setEmailedId((c) => (c === householdId ? null : c)), 1800);
          setEmailMsg(`Emailed ${householdName} (${sent} recipient${sent === 1 ? "" : "s"}).`);
        }
      } else {
        setSelected(new Set());
        setEmailMsg(`Emailed ${sent} recipient${sent === 1 ? "" : "s"} across the selected households.`);
      }
    } catch (e) {
      setEmailMsg(e instanceof Error ? e.message : "Failed to send emails.");
      setComposeOpen(false);
    } finally {
      setComposeSending(false);
    }
  }

  // Preview the composed email for the first recipient: real first name, and
  // their existing link if they have one (otherwise a representative sample).
  const previewRecipient = composeRecipients[0];
  const previewLink = previewRecipient
    ? (() => {
        // Individual compose previews the member's own link; household compose
        // previews the household's shared link.
        if (composeIndividualId) {
          const t = individualTokenOf(previewRecipient);
          return t ? bookingUrl(t.token) : bookingUrl("their-personal-link");
        }
        const key = householdKey(previewRecipient);
        const t = bookingTokens
          .filter((bt) => !bt.usedAt && bt.year === SETTLEMENT_YEAR && bt.scope !== "individual" && tokenHouseholdKey(bt) === key)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        return t ? bookingUrl(t.token) : `${bookingUrl("your-personal-link")}`;
      })()
    : "";
  const preview = previewRecipient
    ? renderSettlementEmail(
        { subject: draftSubject, body: draftBody },
        {
          name: previewRecipient.firstName,
          lastName: previewRecipient.lastName,
          title: settlementTitle(previewRecipient.gender),
          link: previewLink,
        },
      )
    : null;

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
    { seg: "link",        label: "Link" },
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
                  {completedN} of {total} households complete · {remaining.length} to go
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
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={selectedCount === 0}
                  onClick={openComposeSelected}
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Email selected{selectedCount > 0 ? ` (${selectedCount})` : ""}</span>
                  <span className="sm:hidden">Email{selectedCount > 0 ? ` (${selectedCount})` : ""}</span>
                </Button>
              </div>
            </div>
            <BreakdownBar rows={rows} />
            {emailMsg && <p className="text-xs text-muted-foreground">{emailMsg}</p>}
          </div>
        </div>

        {/* Follow-up nudge: a link out but not yet booked is where a sprint stalls.
            "Opened but didn't book" is the hotter signal, so it leads. */}
        {linkedN > 0 && (
          <button
            type="button"
            onClick={() => setSegment("link")}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            <Send className="h-3.5 w-3.5 shrink-0" />
            {openedNotBooked > 0 ? (
              <span><strong>{openedNotBooked}</strong> {openedNotBooked === 1 ? "household" : "households"} opened their link but haven&apos;t booked yet — good time to follow up.</span>
            ) : (
              <span><strong>{linkedN}</strong> {linkedN === 1 ? "household has" : "households have"} a link but haven&apos;t opened it yet.</span>
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
            placeholder="Search households…"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Select-all helper for bulk emailing the shown, still-outstanding members. */}
      {selectableIds.length > 0 && (
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label="Select all households with an email on file"
          />
          Select all shown ({selectableIds.length}) with an email on file
        </label>
      )}

      {/* Roster */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No households match.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {filtered.map((r) => {
            const isExpandable = r.householdMembers.length > 1;
            const isExpanded = expanded.has(r.householdId);
            return (
            <div key={r.member.id}>
            <div className="flex flex-wrap items-center gap-3 p-3">
              {isExpandable ? (
                <button
                  type="button"
                  onClick={() => toggleExpanded(r.householdId)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? `Collapse ${r.name}` : `Expand ${r.name} to see household members`}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="h-6 w-6 shrink-0" aria-hidden />
              )}
              {emailable(r) ? (
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-primary"
                  checked={selected.has(r.member.id)}
                  onChange={() => toggleSelected(r.member.id)}
                  aria-label={`Select ${r.name} to email`}
                />
              ) : (
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  disabled
                  title={recipientsOf(r).length > 0 ? "Already booked or complete" : "No email on file for the household"}
                  aria-label={`${r.name} can't be emailed`}
                />
              )}
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-primary/10 text-primary">
                {getInitials(r.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{r.name}</p>
                {/* Who gets the email + household size */}
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                  <User className="h-3 w-3 shrink-0" />
                  {r.parents.length
                    ? r.parents.map((p) => p.firstName).join(" & ")
                    : "No parents on file"}
                  {r.householdMembers.length > 1 ? ` · ${r.householdMembers.length} in household` : ""}
                </p>
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
                {/* Link-open signal, for members with a link but not yet booked. */}
                {(r.status === "link_created" || r.status === "link_opened") && r.token && (
                  <p className={cn(
                    "flex items-center gap-1 text-[11px] truncate",
                    r.token.openedAt ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                  )}>
                    <Eye className="h-3 w-3 shrink-0" />
                    {r.token.openedAt ? `Opened ${timeAgo(r.token.openedAt)} · not booked` : "Link not opened yet"}
                  </p>
                )}
                {/* Delivery signal: when the link was last emailed. */}
                {r.record?.linkSentAt && r.status !== "scheduled" && r.status !== "completed" && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                    <Mail className="h-3 w-3 shrink-0" />
                    Emailed {timeAgo(r.record.linkSentAt)}
                  </p>
                )}
              </div>

              <Badge className={cn("text-[10px] shrink-0", SETTLEMENT_STATUS_COLORS[r.status])}>
                {SETTLEMENT_STATUS_LABELS[r.status]}
              </Badge>

              {/* Link actions — only meaningful until a slot is booked */}
              {r.status !== "scheduled" && r.status !== "completed" && (
                <>
                  {r.token ? (
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => copy(r.token!)}>
                      {copiedId === r.token.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId === r.token.id ? "Copied" : "Copy link"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => onGenerate(r.member)}>
                      <Link2 className="h-3.5 w-3.5" /> Generate link
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 text-xs"
                    disabled={recipientsOf(r).length === 0}
                    title={recipientsOf(r).length > 0 ? "Email the household their shared link" : "No email on file for anyone in the household"}
                    onClick={() => openCompose(recipientsOf(r), { id: r.householdId, name: r.name })}
                  >
                    {emailedId === r.member.id ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Mail className="h-3.5 w-3.5" />
                    )}
                    {emailedId === r.member.id ? "Sent" : "Email household"}
                  </Button>
                </>
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

            {/* Expanded household breakdown — per-member individual links. */}
            {isExpanded && (
              <div className="space-y-2 border-t border-dashed border-border bg-muted/20 py-2.5 pl-12 pr-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Household members — generate or email an individual link if someone needs their own appointment
                </p>
                {r.householdMembers
                  .slice()
                  .sort((a, b) =>
                    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
                  .map((m) => {
                    const mRec = memberRecordOf(m);
                    const mStatus = memberStatusOf(m);
                    const mToken = individualTokenOf(m);
                    const mInterview = memberInterviewOf(mRec);
                    const booked = mStatus === "scheduled" || mStatus === "completed";
                    return (
                      <div key={m.id} className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">
                            {m.firstName} {m.lastName}
                            {m.isHouseholdParent && (
                              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">parent</span>
                            )}
                            {!m.email && (
                              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">· no email</span>
                            )}
                          </p>
                          {mInterview?.scheduledDate && (
                            <p className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                              <CalendarClock className="h-3 w-3 shrink-0" />
                              {formatDate(mInterview.scheduledDate)}
                              {mInterview.scheduledTime ? ` · ${formatTime(mInterview.scheduledTime)}` : ""}
                              {mInterview.interviewer ? ` · ${mInterview.interviewer}` : ""}
                            </p>
                          )}
                          {mToken && !booked && (
                            <p className={cn(
                              "flex items-center gap-1 truncate text-[10px]",
                              mToken.openedAt ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                            )}>
                              <Eye className="h-3 w-3 shrink-0" />
                              {mToken.openedAt ? `Opened ${timeAgo(mToken.openedAt)} · not booked` : "Individual link not opened yet"}
                            </p>
                          )}
                          {mRec?.linkSentAt && !booked && (
                            <p className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
                              <Mail className="h-3 w-3 shrink-0" />
                              Individual link emailed {timeAgo(mRec.linkSentAt)}
                            </p>
                          )}
                        </div>

                        <Badge className={cn("text-[10px] shrink-0", SETTLEMENT_STATUS_COLORS[mStatus])}>
                          {SETTLEMENT_STATUS_LABELS[mStatus]}
                        </Badge>

                        {!booked && (
                          <>
                            {mToken ? (
                              <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={() => copy(mToken)}>
                                {copiedId === mToken.id ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                {copiedId === mToken.id ? "Copied" : "Copy individual link"}
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={() => onGenerateIndividual(m)}>
                                <Link2 className="h-3 w-3" /> Generate individual link
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-[11px]"
                              disabled={!m.email}
                              title={m.email ? "Email this member their own individual link" : "No email on file"}
                              onClick={() => openComposeIndividual(m)}
                            >
                              {emailedId === m.id ? <Check className="h-3 w-3 text-green-600" /> : <Mail className="h-3 w-3" />}
                              {emailedId === m.id ? "Sent" : "Email individual link"}
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
            </div>
            );
          })}
        </div>
      )}

      {/* Compose dialog — pre-filled from the saved template, editable per send. */}
      <Dialog open={composeOpen} onOpenChange={(open) => { if (!open) setComposeOpen(false); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {composeIndividualId && composeRecipients[0]
                ? `Email ${composeRecipients[0].firstName} their individual settlement link`
                : composeHouseholdId
                  ? `Email ${composeHouseholdName} their settlement link`
                  : composeRecipients.length === 1
                    ? `Email ${composeRecipients[0].firstName} their settlement link`
                    : `Email ${composeRecipients.length} recipients their settlement link`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1 py-0.5">{"{title}"}</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5">{"{name}"}</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5">{"{lastName}"}</code>, and{" "}
              <code className="rounded bg-muted px-1 py-0.5">{"{link}"}</code> are filled in for
              each recipient when sent. Edits here apply to this send only — change the saved
              default in Settings → Email.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="compose-subject" className="text-xs">Subject</Label>
              <Input id="compose-subject" value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compose-body" className="text-xs">Message</Label>
              <Textarea id="compose-body" rows={9} value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)} />
            </div>
            {preview && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Preview{composeRecipients.length > 1 ? ` (${previewRecipient.firstName}, first of ${composeRecipients.length})` : ""}
                </Label>
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  <p className="font-medium">{preview.subject}</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{preview.body}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)} disabled={composeSending}>
              Cancel
            </Button>
            <Button onClick={() => { void sendCompose(); }} disabled={composeSending || !draftSubject.trim() || !draftBody.trim()} className="gap-1.5">
              {composeSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {composeRecipients.length === 1 ? "Send" : `Send ${composeRecipients.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
          bishopMemberId={bishop?.id}
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
  preferredTime: "",
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
  // Two-step delete: the detail dialog reveals a confirm before removing.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const [blockForm,     setBlockForm]     = useState(EMPTY_BLOCK);
  const [exceptionForm, setExceptionForm] = useState(EMPTY_EXCEPTION);

  // The saved settlement-email template (Settings → Email), used to pre-fill the
  // compose dialog. Falls back to the built-in default until loaded.
  const [emailTemplate, setEmailTemplate] = useState<SettlementEmailTemplate>(DEFAULT_SETTLEMENT_EMAIL);
  useEffect(() => {
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          setEmailTemplate(withDefaults({ subject: d.settlementEmailSubject, body: d.settlementEmailBody }));
        }
      })
      .catch(() => { /* keep the default template */ });
  }, []);

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

  /** Remove an interview entirely — clears it from the board and the calendar. */
  async function handleDelete() {
    if (!selected) return;
    setDeleting(true);
    try {
      // If this was a booked tithing-settlement appointment, deleting it frees
      // the household to rebook: send the record back to "link created" and
      // unlink the (now-gone) interview. `null` clears the DB column — an
      // `undefined` patch would be skipped by the row mapper.
      const linkedSettlement = settlements.find((s) => s.interviewId === selected.id);
      await interviewsCol.remove(selected.id);
      if (linkedSettlement) {
        await settlementsCol.update(linkedSettlement.id, {
          status: "link_created",
          interviewId: null,
        } as unknown as Partial<SettlementRecord>);
      }
      setSelected(null);
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
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
      // Only keep a preferred time that falls inside the window.
      preferredTime:
        blockForm.preferredTime &&
        blockForm.preferredTime >= blockForm.startTime &&
        blockForm.preferredTime < blockForm.endTime
          ? blockForm.preferredTime
          : undefined,
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

  /** This year's settlement record for a member, or undefined. */
  const recordFor = (memberId: string) =>
    settlements.find((s) => s.memberId === memberId && s.year === SETTLEMENT_YEAR);

  /**
   * Ensure this member has this year's settlement record, advancing a fresh
   * one to `link_created`. Returns the record (existing or newly created).
   */
  async function ensureRecord(m: Member): Promise<SettlementRecord> {
    const now = new Date().toISOString();
    let record = recordFor(m.id);
    if (!record) {
      record = {
        id: newId(),
        memberId: m.id,
        memberName: memberName(m),
        year: SETTLEMENT_YEAR,
        status: "link_created",
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      };
      await settlementsCol.create(record);
    } else if (record.status === "not_started") {
      await settlementsCol.update(record.id, { status: "link_created" });
      record = { ...record, status: "link_created" };
    }
    return record;
  }

  /**
   * Ensure a live booking link exists for the member's HOUSEHOLD, returning it
   * alongside the member's own settlement record.
   *
   * Tithing settlement is booked one appointment per household, so the whole
   * household shares one link: a settlement record is ensured for every active
   * household member (so each shows on the board), and a single token — anchored
   * on the head of household and carrying every member the one appointment covers
   * — is reused if it already exists, else minted. Returns the passed member's
   * own record so callers (e.g. emailing) can patch the right row.
   */
  async function ensureToken(
    m: Member,
  ): Promise<{ records: Map<string, SettlementRecord>; token: BookingToken }> {
    const now = new Date().toISOString();
    const pool = members.filter((x) => x.isActive);
    const house = householdMembersOf(m, pool);
    const head = headOfHousehold(house);
    const key = householdKey(head);

    // A settlement record for every household member, keyed by member id so the
    // caller can stamp the right rows (e.g. who was emailed).
    const records = new Map<string, SettlementRecord>();
    for (const person of house) {
      records.set(person.id, await ensureRecord(person));
    }

    // Reuse the household's existing unused link if there is one (never an
    // individual, single-member link — that books only one person).
    const existing = bookingTokens
      .filter((t) => !t.usedAt && t.year === SETTLEMENT_YEAR && t.scope !== "individual" && tokenHouseholdKey(t) === key)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (existing) return { records, token: existing };

    const token: BookingToken = {
      id: newId(),
      token: generateToken(),
      memberId: head.id,
      memberName: memberName(head),
      purpose: "tithing_settlement",
      year: SETTLEMENT_YEAR,
      settlementRecordId: records.get(head.id)?.id,
      householdId: key,
      householdMembers: house.map((x) => ({ id: x.id, name: memberName(x) })),
      scope: "household",
      createdBy: user?.uid ?? "mock",
      createdAt: now,
      updatedAt: now,
    };
    await bookingTokensCol.create(token);
    return { records, token };
  }

  /**
   * Ensure a live INDIVIDUAL booking link exists for a single household member,
   * returning it alongside that member's settlement record. Unlike the household
   * link, an individual link carries only this member, so booking it marks only
   * them scheduled. Reuses the member's existing unused individual link if any.
   */
  async function ensureIndividualToken(
    m: Member,
  ): Promise<{ record: SettlementRecord; token: BookingToken }> {
    const now = new Date().toISOString();
    const record = await ensureRecord(m);

    const existing = bookingTokens
      .filter((t) => !t.usedAt && t.year === SETTLEMENT_YEAR && t.scope === "individual" && t.memberId === m.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (existing) return { record, token: existing };

    const token: BookingToken = {
      id: newId(),
      token: generateToken(),
      memberId: m.id,
      memberName: memberName(m),
      purpose: "tithing_settlement",
      year: SETTLEMENT_YEAR,
      settlementRecordId: record.id,
      householdId: householdKey(m),
      householdMembers: [{ id: m.id, name: memberName(m) }],
      scope: "individual",
      createdBy: user?.uid ?? "mock",
      createdAt: now,
      updatedAt: now,
    };
    await bookingTokensCol.create(token);
    return { record, token };
  }

  /** Create (or reuse) this year's settlement records + the household's link. */
  async function generateLink(m: Member) {
    await ensureToken(m);
  }

  /** Create (or reuse) an individual, single-member link for one member. */
  async function generateIndividualLink(m: Member) {
    await ensureIndividualToken(m);
  }

  /**
   * Email one household member their own individual link. Ensures the member's
   * individual link (and settlement record) exists, then sends it, falling back
   * to a mailto: compose window when email isn't configured or the send fails.
   */
  async function emailIndividualLink(
    m: Member, tpl: SettlementEmailTemplate,
  ): Promise<boolean> {
    if (!m.email) return false;
    const { record, token } = await ensureIndividualToken(m);
    return sendLinkEmail(m, token, record, tpl);
  }

  async function generateAll(ms: Member[]) {
    for (const m of ms) {
      const key = householdKey(m);
      const hasToken = bookingTokens.some(
        (t) => !t.usedAt && t.year === SETTLEMENT_YEAR && tokenHouseholdKey(t) === key,
      );
      if (!hasToken) await generateLink(m);
    }
  }

  /**
   * Email a member their booking link. Ensures a link exists, sends through the
   * configured Gmail account, and on a real send stamps the record with when it
   * was emailed + the Message-ID. Falls back to a mailto: compose window when
   * email isn't configured or the send fails (matching the agenda flow).
   *
   * `silent` suppresses the mailto: fallback — used by the bulk send so it can
   * stop and report "configure email" once instead of opening many windows.
   * Returns whether the link was actually sent by the server.
   */
  /**
   * Send one member the household's booking link (`token` already resolved) and,
   * on a real send, stamp their own settlement record with when it was emailed.
   * `record` is that member's row so the "Emailed …" signal lands on it.
   */
  async function sendLinkEmail(
    m: Member,
    token: BookingToken,
    record: SettlementRecord | undefined,
    tpl: SettlementEmailTemplate,
    opts?: { silent?: boolean },
  ): Promise<boolean> {
    if (!m.email) return false;
    const url = `${window.location.origin}/book/${token.token}`;
    // Substitute {title}/{name}/{lastName}/{link} per recipient from the
    // (possibly edited) template — so each parent is addressed individually.
    const { subject, body } = renderSettlementEmail(tpl, {
      name: m.firstName,
      lastName: m.lastName,
      title: settlementTitle(m.gender),
      link: url,
    });

    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: m.email, subject, body }),
      });
      if (res.ok) {
        const { messageId } = await res.json();
        const now = new Date().toISOString();
        const patch: Partial<SettlementRecord> = { linkSentAt: now };
        if (messageId) patch.linkEmailMessageId = messageId;
        if (record && record.status === "not_started") patch.status = "link_created";
        if (record) await settlementsCol.update(record.id, patch);
        return true;
      }
      // notConfigured (409) or another error — fall through to mailto below.
    } catch {
      /* network error — fall back to mailto below */
    }

    if (!opts?.silent) {
      window.location.assign(
        `mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      );
    }
    return false;
  }

  /**
   * Email a member their household's booking link. Ensures the household's link
   * (and everyone's settlement record) exists, then sends. Falls back to a
   * mailto: compose window when email isn't configured or the send fails.
   *
   * `silent` suppresses the mailto: fallback — used by the bulk send so it can
   * stop and report "configure email" once instead of opening many windows.
   */
  async function emailLink(
    m: Member, tpl: SettlementEmailTemplate, opts?: { silent?: boolean },
  ): Promise<boolean> {
    if (!m.email) return false;
    const { records, token } = await ensureToken(m);
    return sendLinkEmail(m, token, records.get(m.id), tpl, opts);
  }

  /**
   * Email the selected members their booking links. The link is per household,
   * so each household's link is ensured exactly once (a bulk loop can't see a
   * token minted moments earlier in the same tick) and then sent to each of its
   * selected members, all with the same link.
   */
  async function emailSelected(ms: Member[], tpl: SettlementEmailTemplate) {
    let sent = 0;
    // householdKey → the ensured link + this year's record for each member.
    const ensured = new Map<string, { token: BookingToken; records: Map<string, SettlementRecord> }>();
    for (const m of ms) {
      if (!m.email) continue;
      const key = householdKey(m);
      let house = ensured.get(key);
      if (!house) {
        house = await ensureToken(m);
        ensured.set(key, house);
      }
      const ok = await sendLinkEmail(m, house.token, house.records.get(m.id), tpl, { silent: true });
      if (ok) {
        sent += 1;
      } else if (sent === 0) {
        // First member failed with no server send — email likely isn't
        // configured. Stop rather than silently doing nothing for everyone.
        throw new Error("Email isn't set up yet. Add a Gmail address in Settings → Email, then try again.");
      }
    }
    return sent;
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
  // Settlement is tracked per household — count households, not individuals.
  const settlementHouseholds = (() => {
    const active = members.filter((m) => m.isActive);
    const groups = new Map<string, Member[]>();
    for (const m of active) {
      const key = householdKey(m);
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }
    let done = 0;
    for (const [, houseMembers] of groups) {
      const head = headOfHousehold(houseMembers);
      const r = settlements.find((s) => s.memberId === head.id && s.year === SETTLEMENT_YEAR);
      if (r?.status === "completed" || r?.status === "exempt") done += 1;
    }
    return { total: groups.size, done };
  })();
  const settlementRemaining = settlementHouseholds.total - settlementHouseholds.done;

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
          onGenerateIndividual={(m) => { void generateIndividualLink(m); }}
          emailTemplate={emailTemplate}
          onEmail={(m, tpl) => emailLink(m, tpl)}
          onEmailIndividual={(m, tpl) => emailIndividualLink(m, tpl)}
          onEmailSelected={(ms, tpl) => emailSelected(ms, tpl)}
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
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setConfirmingDelete(false); } }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
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

                {/* Delete — removes the card from the board and the calendar. */}
                <div className="border-t pt-3">
                  {confirmingDelete ? (
                    <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                      <p className="text-sm">
                        Delete <span className="font-medium">{selected.memberName}</span>&apos;s interview? This can&apos;t be undone.
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                          Cancel
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => { void handleDelete(); }} disabled={deleting}>
                          <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Delete"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmingDelete(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete interview
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── New / edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
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
                bishopMemberId={BISHOP?.id}
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

            <div className="space-y-1.5">
              <Label htmlFor="blkPreferred">Preferred time <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                id="blkPreferred"
                type="time"
                value={blockForm.preferredTime}
                min={blockForm.startTime}
                max={blockForm.endTime}
                onChange={(e) => setBlockForm((f) => ({ ...f, preferredTime: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Booked first, then the slots around it. Leave blank to fill from the start of the window.
              </p>
              {blockForm.preferredTime !== "" &&
                (blockForm.preferredTime < blockForm.startTime || blockForm.preferredTime >= blockForm.endTime) && (
                  <p className="text-xs text-red-600 dark:text-red-400">Preferred time must fall inside the window.</p>
                )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlockForm(EMPTY_BLOCK)}>Cancel</Button>
            <Button
              onClick={saveBlock}
              disabled={
                blockForm.startTime >= blockForm.endTime ||
                (blockForm.preferredTime !== "" &&
                  (blockForm.preferredTime < blockForm.startTime ||
                    blockForm.preferredTime >= blockForm.endTime))
              }
            >
              Add
            </Button>
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
