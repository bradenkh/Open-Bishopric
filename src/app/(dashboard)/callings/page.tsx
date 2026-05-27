"use client";

import { useState } from "react";
import {
  Plus, Church, AlertTriangle, CheckCircle2, ClipboardList,
  GripVertical, User, ArrowRight, Users, UserMinus, ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks } from "@/contexts/TasksContext";
import type { Calling, CallingStage, SustainedVenue, Task } from "@/types";
import { CALLING_STAGES, CALLING_PIPELINE } from "@/types";
import { MOCK_CALLINGS, MOCK_BISHOPRIC_MEMBERS, MOCK_MEMBERS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// ── Bishopric helpers ─────────────────────────────────────────────────────────

/** Members who can extend callings or set apart (bishop + counselors) */
const EXTENDING_MEMBERS = MOCK_BISHOPRIC_MEMBERS.filter(
  (m) => m.role === "bishop" || m.role === "counselor"
);

/** All bishopric members (for set-apart — could include stake members in real use) */
const SET_APART_MEMBERS = MOCK_BISHOPRIC_MEMBERS.filter(
  (m) => m.role === "bishop" || m.role === "counselor"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeStage(stage: string): CallingStage {
  const legacy: Record<string, CallingStage> = {
    identified: "discussing",
    extended: "extending",
    responded: "accepted",
  };
  return (legacy[stage] ?? stage) as CallingStage;
}

function stageLabel(stage: CallingStage): string {
  return CALLING_STAGES.find((s) => s.stage === stage)?.label ?? stage;
}

function pipelineIndex(stage: CallingStage): number {
  return CALLING_PIPELINE.indexOf(stage);
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const STAGE_COLORS: Record<CallingStage, string> = {
  vacant:      "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  discussing:  "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  approved:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-200",
  extending:   "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
  accepted:    "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200",
  sustaining:  "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200",
  sustained:   "bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200",
  set_apart:   "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200",
  lcr_updated: "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200",
  recorded:    "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200",
};

// Per-stage column header styling
const STAGE_COLUMN_COLORS: Record<CallingStage, { header: string; ring: string; drop: string }> = {
  vacant:      { header: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",       ring: "ring-red-400",    drop: "bg-red-50/60 dark:bg-red-950/20" },
  discussing:  { header: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800", ring: "ring-amber-400",  drop: "bg-amber-50/60 dark:bg-amber-950/20" },
  approved:    { header: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800", ring: "ring-yellow-400", drop: "bg-yellow-50/60 dark:bg-yellow-950/20" },
  extending:   { header: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",   ring: "ring-blue-400",   drop: "bg-blue-50/60 dark:bg-blue-950/20" },
  accepted:    { header: "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800",       ring: "ring-sky-400",    drop: "bg-sky-50/60 dark:bg-sky-950/20" },
  sustaining:  { header: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800", ring: "ring-purple-400", drop: "bg-purple-50/60 dark:bg-purple-950/20" },
  sustained:   { header: "bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-800", ring: "ring-violet-400", drop: "bg-violet-50/60 dark:bg-violet-950/20" },
  set_apart:   { header: "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800", ring: "ring-indigo-400", drop: "bg-indigo-50/60 dark:bg-indigo-950/20" },
  lcr_updated: { header: "bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800",   ring: "ring-teal-400",   drop: "bg-teal-50/60 dark:bg-teal-950/20" },
  recorded:    { header: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800", ring: "ring-green-400", drop: "bg-green-50/60 dark:bg-green-950/20" },
};

const NEXT_ACTION: Partial<Record<CallingStage, string>> = {
  vacant:      "Identify a candidate",
  discussing:  "Get bishopric approval",
  approved:    "Extend the calling",
  extending:   "Follow up — awaiting response",
  accepted:    "Schedule sustaining",
  sustaining:  "Confirm at meeting",
  sustained:   "Set apart",
  set_apart:   "Update LCR",
  lcr_updated: "Mark complete",
};

function attentionMessage(c: Calling): string | null {
  if (c.stage === "sustaining" && c.sustainedIn === "sacrament_meeting" && !c.businessItemAdded) {
    return "Add to business items";
  }
  if (c.stage === "accepted")    return "Schedule sustaining";
  if (c.stage === "set_apart")   return "Update LCR";
  if (c.stage === "lcr_updated") return "Ready to archive";
  return null;
}

// ── Stage Advance Panel ───────────────────────────────────────────────────────

interface AdvancePanelProps {
  calling: Calling;
  onSave: (updates: Partial<Calling> & { stage: CallingStage }) => void;
  onClose: () => void;
}

function StageAdvancePanel({ calling, onSave, onClose }: AdvancePanelProps) {
  const stage = calling.stage;
  const name  = calling.memberName || "this person";

  const { addTask, completeCallingTasks } = useTasks();

  // ── Form state ────────────────────────────────────────────────────────────
  const [candidateName,   setCandidateName]   = useState("");
  const [approvedBy,      setApprovedBy]      = useState(calling.approvedBy ?? "");
  // Extending — bishopric member dropdown
  const [extendingMember, setExtendingMember] = useState(
    EXTENDING_MEMBERS.find((m) => m.name === calling.extendedBy)?.id ?? ""
  );
  const [sustainedIn,     setSustainedIn]     = useState<SustainedVenue>("sacrament_meeting");
  const [sustainedDate,   setSustainedDate]   = useState(calling.sustainedDate ?? "");
  const [bizAdded,        setBizAdded]        = useState(calling.businessItemAdded ?? false);
  // Set apart — bishopric member dropdown
  const [setApartMember,  setSetApartMember]  = useState(
    SET_APART_MEMBERS.find((m) => m.name === calling.setApartBy)?.id ?? ""
  );
  const [setApartDate,    setSetApartDate]    = useState(calling.setApartDate ?? "");
  const [lcrConfirmed,    setLcrConfirmed]    = useState(false);
  const [declineReason,   setDeclineReason]   = useState("");
  const [declineRestart,  setDeclineRestart]  = useState<"vacant" | "discussing">("vacant");
  const [showDeclineForm, setShowDeclineForm] = useState(false);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function makeCallingTask(overrides: Partial<Task>): Task {
    const now = new Date().toISOString();
    return {
      id:        `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type:      "calling",
      status:    "active",
      memberName: calling.memberName ?? undefined,
      createdBy: "system",
      createdAt: now,
      updatedAt: now,
      title:     "",
      ...overrides,
    };
  }

  // ── Stages ────────────────────────────────────────────────────────────────

  if (stage === "vacant") {
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Identify a Candidate</p>
        <div className="space-y-1.5">
          <Label htmlFor="candidateName">Who is being discussed for this position?</Label>
          <Input
            id="candidateName"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="Full name"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button
            disabled={!candidateName.trim()}
            onClick={() => onSave({ stage: "discussing", memberName: candidateName.trim() })}
          >
            Start Discussion
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "discussing") {
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Bishopric Approval</p>
        <p className="text-sm text-muted-foreground">
          Has the bishopric approved calling <strong>{name}</strong>?
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="approvedBy">Approved by</Label>
          <Input
            id="approvedBy"
            value={approvedBy}
            onChange={(e) => setApprovedBy(e.target.value)}
            placeholder="e.g. Bishop Anderson"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button
            disabled={!approvedBy.trim()}
            onClick={() => onSave({ stage: "approved", approvedBy: approvedBy.trim(), approvedAt: new Date().toISOString() })}
          >
            Mark Approved
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "approved") {
    const selectedMember = EXTENDING_MEMBERS.find((m) => m.id === extendingMember);
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Assign: Extend the Calling</p>
        <p className="text-sm text-muted-foreground">
          Which bishopric member will reach out to <strong>{name}</strong> to extend this calling?
        </p>
        <div className="space-y-1.5">
          <Label>Assigned to</Label>
          <Select value={extendingMember} onValueChange={setExtendingMember}>
            <SelectTrigger>
              <SelectValue placeholder="Select a bishopric member…" />
            </SelectTrigger>
            <SelectContent>
              {EXTENDING_MEMBERS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} <span className="text-muted-foreground capitalize">({m.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedMember && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60 p-3 text-xs text-blue-800 dark:text-blue-200">
            A task will be added to <strong>{selectedMember.name}&apos;s</strong> todos to call {name} and extend the calling.
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button
            disabled={!extendingMember}
            onClick={() => {
              const member = EXTENDING_MEMBERS.find((m) => m.id === extendingMember)!;
              // Create extend task for assigned bishopric member
              addTask(makeCallingTask({
                title:        `Extend calling — ${calling.position}${calling.memberName ? ` → ${calling.memberName}` : ""}`,
                description:  `Contact ${name} to extend the calling of ${calling.position}${calling.organization ? ` (${calling.organization})` : ""}. Once they respond, record the outcome in the callings pipeline.`,
                assigneeId:   member.id,
                assigneeName: member.name,
                context: {
                  callingId: calling.id,
                  taskType:  "extend",
                  position:  calling.position,
                },
              }));
              onSave({ stage: "extending", extendedBy: member.name, extendedAt: new Date().toISOString() });
            }}
          >
            Assign &amp; Mark Extended
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "extending") {
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Record Response</p>
        <p className="text-sm text-muted-foreground">Did <strong>{name}</strong> accept the calling?</p>
        {calling.extendedBy && (
          <p className="text-xs text-muted-foreground">
            Extended by: <span className="font-medium text-foreground">{calling.extendedBy}</span>
          </p>
        )}
        {!showDeclineForm ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
              onClick={() => setShowDeclineForm(true)}
            >
              Declined
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                // Auto-complete the open extend task for this calling
                completeCallingTasks(calling.id);
                onSave({ stage: "accepted" });
              }}
            >
              Accepted ✓
            </Button>
          </div>
        ) : (
          <div className="rounded-lg bg-muted/50 border p-3 space-y-3">
            <p className="text-sm font-medium">Record Decline</p>
            <div className="space-y-1.5">
              <Label htmlFor="declineReason">Reason (optional)</Label>
              <Input
                id="declineReason"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Optional reason"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Next step</Label>
              <div className="flex gap-4">
                {(["vacant", "discussing"] as const).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="restart"
                      value={opt}
                      checked={declineRestart === opt}
                      onChange={() => setDeclineRestart(opt)}
                    />
                    {opt === "vacant" ? "Leave as vacant" : "Discuss new candidate"}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowDeclineForm(false)}>Back</Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  // Auto-complete the open extend task
                  completeCallingTasks(calling.id);
                  onSave({
                    stage:         declineRestart,
                    declineReason: declineReason.trim() || undefined,
                    declinedAt:    new Date().toISOString(),
                    memberName:    declineRestart === "vacant" ? "" : calling.memberName,
                  });
                }}
              >
                Record Decline
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (stage === "accepted") {
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Schedule Sustaining</p>
        <p className="text-sm text-muted-foreground">
          Where and when will <strong>{name}</strong> be sustained?
        </p>
        <div className="space-y-1.5">
          <Label>Where</Label>
          <div className="flex gap-4">
            {([["sacrament_meeting", "Sacrament Meeting"], ["class", "Class / Quorum"]] as [SustainedVenue, string][]).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="sustainedIn"
                  value={val}
                  checked={sustainedIn === val}
                  onChange={() => setSustainedIn(val)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sustainedDate">Date</Label>
          <Input
            id="sustainedDate"
            type="date"
            value={sustainedDate}
            onChange={(e) => setSustainedDate(e.target.value)}
          />
        </div>
        {sustainedIn === "sacrament_meeting" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60 p-3 flex gap-2 text-sm text-amber-800 dark:text-amber-200">
            <ClipboardList className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>Reminder:</strong> Add this to the business items document so counselors know to announce it.
            </span>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button
            onClick={() => onSave({
              stage:             "sustaining",
              sustainedIn,
              sustainedDate:     sustainedDate || undefined,
              businessItemAdded: sustainedIn === "class",
            })}
          >
            Schedule
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "sustaining") {
    const needsBizItem = calling.sustainedIn === "sacrament_meeting" && !bizAdded;
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Confirm Sustained</p>
        <p className="text-sm text-muted-foreground">
          Has <strong>{name}</strong> been sustained
          {calling.sustainedIn === "sacrament_meeting" ? " in sacrament meeting" : " in their class/quorum"}
          {calling.sustainedDate ? ` on ${calling.sustainedDate}` : ""}?
        </p>
        {needsBizItem && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/60 p-3 space-y-2">
            <div className="flex gap-2 text-sm text-red-800 dark:text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>Action required:</strong> This calling has not been added to the business items document yet.
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={bizAdded}
                onChange={(e) => setBizAdded(e.target.checked)}
              />
              I have added this to the business items document
            </label>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button
            disabled={needsBizItem && !bizAdded}
            onClick={() => onSave({ stage: "sustained", businessItemAdded: true })}
          >
            Confirm Sustained
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "sustained") {
    const selectedMember = SET_APART_MEMBERS.find((m) => m.id === setApartMember);
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Assign: Setting Apart</p>
        <p className="text-sm text-muted-foreground">
          Who will set <strong>{name}</strong> apart, and when?
        </p>
        <div className="space-y-1.5">
          <Label>Assigned to</Label>
          <Select value={setApartMember} onValueChange={setSetApartMember}>
            <SelectTrigger>
              <SelectValue placeholder="Select a bishopric member…" />
            </SelectTrigger>
            <SelectContent>
              {SET_APART_MEMBERS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} <span className="text-muted-foreground capitalize">({m.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="setApartDate">Date</Label>
          <Input
            id="setApartDate"
            type="date"
            value={setApartDate}
            onChange={(e) => setSetApartDate(e.target.value)}
          />
        </div>
        {selectedMember && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/60 p-3 space-y-1 text-xs text-violet-800 dark:text-violet-200">
            <p>A task will be added to <strong>{selectedMember.name}&apos;s</strong> todos to set {name} apart.</p>
            <p className="text-violet-600 dark:text-violet-300">
              ✓ After they check it off, the ward clerk will be automatically notified to update LCR.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button
            disabled={!setApartMember}
            onClick={() => {
              const member = SET_APART_MEMBERS.find((m) => m.id === setApartMember)!;
              // Create set-apart task — when checked off, clerk LCR task is auto-created
              addTask(makeCallingTask({
                title:        `Set apart — ${name} as ${calling.position}`,
                description:  `Set ${name} apart as ${calling.position}${calling.organization ? ` (${calling.organization})` : ""}${setApartDate ? ` on ${setApartDate}` : ""}.`,
                assigneeId:   member.id,
                assigneeName: member.name,
                context: {
                  callingId:    calling.id,
                  taskType:     "set_apart",
                  position:     calling.position,
                  setApartDate: setApartDate || undefined,
                  setApartBy:   member.name,
                  outgoingMemberName: calling.outgoingMemberName,
                },
              }));
              onSave({ stage: "set_apart", setApartBy: member.name, setApartDate: setApartDate || undefined });
            }}
          >
            Assign &amp; Schedule
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "set_apart") {
    // LCR update is handled by the clerk via the auto-created task.
    // The bishop can also manually confirm here.
    const clerk = MOCK_BISHOPRIC_MEMBERS.find((m) => m.role === "clerk");
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Awaiting LCR Update</p>
        <p className="text-sm text-muted-foreground">
          <strong>{name}</strong> was set apart by{" "}
          <strong>{calling.setApartBy ?? "bishopric member"}</strong>
          {calling.setApartDate ? ` on ${calling.setApartDate}` : ""}.
        </p>
        <div className="rounded-lg border border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/60 p-3 text-xs text-teal-800 dark:text-teal-200 space-y-1">
          <p className="font-medium">Clerk notification</p>
          <p>
            {clerk
              ? <><strong>{clerk.name}</strong> has a task to update LCR for this calling.</>
              : "A task was created for the ward clerk to update LCR."
            }{" "}
            Once they check it off, you can mark this calling complete.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={lcrConfirmed}
            onChange={(e) => setLcrConfirmed(e.target.checked)}
          />
          I confirm LCR has been updated and {name} is recorded as set apart
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            disabled={!lcrConfirmed}
            onClick={() => onSave({
              stage:        "lcr_updated",
              lcrUpdated:   true,
              lcrUpdatedBy: clerk?.name ?? "Ward Clerk",
              lcrUpdatedAt: new Date().toISOString(),
            })}
          >
            Confirm LCR Updated
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "lcr_updated") {
    return (
      <div className="border-t pt-4 space-y-3">
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/60 p-3 flex gap-2 text-sm text-green-800 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            All steps complete for <strong>{name}&apos;s</strong> calling as{" "}
            <strong>{calling.position}</strong>. Archive it to keep your pipeline clean.
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ stage: "recorded" })}>Mark Complete</Button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Shared Calling Card ───────────────────────────────────────────────────────

interface CallingCardProps {
  calling: Calling;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isDragging?: boolean;
  showProgress?: boolean;
  showStageBadge?: boolean;
}

function CallingCard({
  calling,
  onClick,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false,
  showProgress = false,
  showStageBadge = false,
}: CallingCardProps) {
  const urgent   = attentionMessage(calling);
  const initials = calling.memberName ? getInitials(calling.memberName) : "";
  const idx      = pipelineIndex(calling.stage);
  // Denominator is length-2 (exclude "recorded" from 100%)
  const progress = Math.round((Math.max(0, idx) / (CALLING_PIPELINE.length - 2)) * 100);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "rounded-lg bg-card border p-3 cursor-pointer select-none group",
        "hover:shadow-md transition-all duration-150",
        urgent ? "border-amber-300 dark:border-amber-700" : "border-border",
        isDragging && "opacity-40 scale-[0.97] shadow-none"
      )}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 mt-0.5 shrink-0 cursor-grab active:cursor-grabbing group-hover:text-muted-foreground/60 transition-colors" />
        )}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Avatar */}
          <div className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
            calling.memberName
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}>
            {calling.memberName ? initials : <User className="h-3.5 w-3.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-tight truncate">
              {calling.memberName || <span className="italic font-normal text-muted-foreground">Vacant</span>}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight truncate">{calling.position}</p>
            {calling.organization && (
              <p className="text-[10px] text-muted-foreground/60 leading-tight truncate">{calling.organization}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {showStageBadge && (
            <Badge className={cn("text-[10px] h-4 px-1.5", STAGE_COLORS[calling.stage])}>
              {stageLabel(calling.stage)}
            </Badge>
          )}
          {urgent && <div className="h-2 w-2 rounded-full bg-amber-400" />}
        </div>
      </div>

      {urgent && (
        <div className="flex items-center gap-1 mt-2 text-[10px] text-amber-600 dark:text-amber-400 pl-5">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{urgent}</span>
        </div>
      )}

      {showProgress && (
        <div className="mt-2.5 pl-5 space-y-1">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {NEXT_ACTION[calling.stage] ?? "Complete"} · {progress}%
          </p>
        </div>
      )}
    </div>
  );
}

// ── Pipeline / Kanban View ────────────────────────────────────────────────────

const KANBAN_STAGES = CALLING_PIPELINE.filter((s) => s !== "recorded");

interface KanbanViewProps {
  callings: Calling[];
  onSelect: (c: Calling) => void;
  onMove: (callingId: string, toStage: CallingStage) => void;
}

function KanbanView({ callings, onSelect, onMove }: KanbanViewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage,  setOverStage]  = useState<CallingStage | null>(null);

  function handleDragStart(e: React.DragEvent, calling: Calling) {
    setDraggingId(calling.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", calling.id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setOverStage(null);
  }

  function handleDragOver(e: React.DragEvent, stage: CallingStage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverStage(stage);
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if leaving the column entirely (not just entering a child)
    const target = e.currentTarget as HTMLElement;
    if (!target.contains(e.relatedTarget as Node)) {
      setOverStage(null);
    }
  }

  function handleDrop(e: React.DragEvent, toStage: CallingStage) {
    e.preventDefault();
    const callingId = e.dataTransfer.getData("text/plain");
    const calling   = callings.find((c) => c.id === callingId);
    if (calling && calling.stage !== toStage) {
      onMove(callingId, toStage);
    }
    setDraggingId(null);
    setOverStage(null);
  }

  const draggingCalling = draggingId ? callings.find((c) => c.id === draggingId) : null;

  return (
    <div className="overflow-x-auto pb-4 -mx-4 px-4 lg:-mx-8 lg:px-8">
      <div className="flex gap-3" style={{ minWidth: "max-content" }}>
        {KANBAN_STAGES.map((stage, stageIdx) => {
          const stageCalls   = callings.filter((c) => c.stage === stage);
          const isOver       = overStage === stage;
          const isValidDrop  = draggingCalling && draggingCalling.stage !== stage;
          const colors       = STAGE_COLUMN_COLORS[stage];

          return (
            <div key={stage} className="flex flex-col" style={{ width: 192 }}>
              {/* Connector arrow between columns (except last) */}
              {stageIdx > 0 && (
                <div className="absolute" /> // spacer handled by gap
              )}
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
                    {stageCalls.length > 0 && (
                      <span className={cn(
                        "text-[10px] font-bold min-w-[18px] text-center px-1.5 py-0.5 rounded-full",
                        STAGE_COLORS[stage]
                      )}>
                        {stageCalls.length}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {NEXT_ACTION[stage] ?? ""}
                  </p>
                </div>

                {/* Drop zone / cards */}
                <div
                  className={cn(
                    "p-2 space-y-2 min-h-[140px] rounded-b-xl transition-colors duration-100",
                    isOver && isValidDrop ? colors.drop : ""
                  )}
                >
                  {stageCalls.map((c) => (
                    <CallingCard
                      key={c.id}
                      calling={c}
                      onClick={() => onSelect(c)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, c)}
                      onDragEnd={handleDragEnd}
                      isDragging={draggingId === c.id}
                    />
                  ))}
                  {/* Empty state / active drop target */}
                  <div className={cn(
                    "flex items-center justify-center rounded-lg border-2 border-dashed transition-all duration-100",
                    stageCalls.length === 0 ? "h-20" : "h-10",
                    isOver && isValidDrop
                      ? "border-current opacity-60 text-foreground"
                      : "border-border/30 text-muted-foreground/20"
                  )}>
                    <p className="text-[10px] font-medium">
                      {isOver && isValidDrop ? "Drop here" : stageCalls.length === 0 ? "Empty" : ""}
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

// ── Org Chart View ──────────────────────────────────────────────────────────

function memberFullName(m: { firstName: string; lastName: string }): string {
  return `${m.firstName} ${m.lastName}`;
}

interface OrgChartViewProps {
  /** ALL callings (including recorded) — the org chart is the current state of the ward. */
  callings: Calling[];
  onSelect: (c: Calling) => void;
  onDropMember: (calling: Calling, memberName: string) => void;
}

function OrgChartView({ callings, onSelect, onDropMember }: OrgChartViewProps) {
  const [draggingMember, setDraggingMember] = useState<string | null>(null);
  const [overCallingId,  setOverCallingId]  = useState<string | null>(null);

  // ── Group callings by organization ────────────────────────────────────────
  const orgMap = new Map<string, Calling[]>();
  for (const c of callings) {
    const org = c.organization?.trim() || "Other";
    if (!orgMap.has(org)) orgMap.set(org, []);
    orgMap.get(org)!.push(c);
  }
  const orgs = [...orgMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  orgs.forEach(([, cs]) => cs.sort((a, b) => a.position.localeCompare(b.position)));

  // Names already serving or in-process — shown muted in the palette
  const calledNames = new Set(
    callings.filter((c) => c.memberName && c.stage !== "vacant").map((c) => c.memberName)
  );

  function handleMemberDragStart(e: React.DragEvent, name: string) {
    setDraggingMember(name);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", name);
  }

  function handleMemberDragEnd() {
    setDraggingMember(null);
    setOverCallingId(null);
  }

  function handleCardDragOver(e: React.DragEvent, calling: Calling) {
    if (!draggingMember) return;            // only react to member drags
    if (draggingMember === calling.memberName) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setOverCallingId(calling.id);
  }

  function handleCardDrop(e: React.DragEvent, calling: Calling) {
    e.preventDefault();
    const name = draggingMember;
    setDraggingMember(null);
    setOverCallingId(null);
    if (!name || name === calling.memberName) return;
    onDropMember(calling, name);
  }

  return (
    <div className="space-y-4">
      {/* ── Member palette ── */}
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ward Members
          </p>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            — drag a member onto a calling to propose them
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MOCK_MEMBERS.map((m) => {
            const full     = memberFullName(m);
            const isCalled = calledNames.has(full);
            return (
              <div
                key={m.id}
                draggable
                onDragStart={(e) => handleMemberDragStart(e, full)}
                onDragEnd={handleMemberDragEnd}
                title={isCalled ? `${full} (currently has a calling)` : full}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border pl-1.5 pr-3 py-1 text-xs font-medium",
                  "cursor-grab active:cursor-grabbing select-none transition-all",
                  "hover:shadow-sm hover:border-primary/40",
                  draggingMember === full && "opacity-40",
                  isCalled
                    ? "bg-muted/50 border-border text-muted-foreground"
                    : "bg-card border-border text-foreground"
                )}
              >
                <span className={cn(
                  "h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                  isCalled ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                )}>
                  {getInitials(full)}
                </span>
                {full}
                {isCalled && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Currently called" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Organization boxes ── */}
      {orgs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Church className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No callings yet</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orgs.map(([org, orgCallings]) => {
            const vacantCount = orgCallings.filter((c) => c.stage === "vacant").length;
            return (
              <div key={org} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Org header */}
                <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm truncate">{org}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {vacantCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200">
                        {vacantCount} vacant
                      </span>
                    )}
                    <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                      {orgCallings.length}
                    </span>
                  </div>
                </div>

                {/* Calling cards */}
                <div className="p-3 space-y-2">
                  {orgCallings.map((calling) => {
                    const isVacant  = calling.stage === "vacant";
                    const isServing = calling.stage === "recorded";
                    const isOver    = overCallingId === calling.id;
                    const urgent    = attentionMessage(calling);

                    return (
                      <div
                        key={calling.id}
                        onClick={() => onSelect(calling)}
                        onDragOver={(e) => handleCardDragOver(e, calling)}
                        onDragLeave={() => setOverCallingId((id) => (id === calling.id ? null : id))}
                        onDrop={(e) => handleCardDrop(e, calling)}
                        className={cn(
                          "rounded-lg border p-2.5 cursor-pointer transition-all duration-150",
                          isOver
                            ? "ring-2 ring-primary border-transparent bg-primary/5 scale-[1.01]"
                            : isVacant
                            ? "border-dashed border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20 hover:border-red-400"
                            : "border-border bg-card hover:shadow-sm",
                        )}
                      >
                        {/* Position */}
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold leading-tight truncate">{calling.position}</p>
                          {!isVacant && (
                            <Badge className={cn("text-[9px] h-4 px-1.5 shrink-0", STAGE_COLORS[calling.stage])}>
                              {isServing ? "Serving" : stageLabel(calling.stage)}
                            </Badge>
                          )}
                        </div>

                        {/* Occupant */}
                        {isVacant ? (
                          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-red-600 dark:text-red-400">
                            {isOver ? (
                              <span className="font-medium">Drop to call <strong>{draggingMember}</strong></span>
                            ) : (
                              <>
                                <UserMinus className="h-3 w-3 shrink-0" />
                                <span className="italic">Vacant — drag a member here</span>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="mt-1.5 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                                {getInitials(calling.memberName ?? "")}
                              </span>
                              <p className="text-xs font-medium truncate">{calling.memberName}</p>
                            </div>
                            {calling.outgoingMemberName && (
                              <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 pl-6">
                                <ArrowRightLeft className="h-2.5 w-2.5 shrink-0" />
                                Releasing {calling.outgoingMemberName}
                              </p>
                            )}
                            {isOver && (
                              <p className="text-[10px] text-primary font-medium pl-6">
                                Drop to replace with {draggingMember}
                              </p>
                            )}
                            {urgent && !isOver && (
                              <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 pl-6">
                                <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                {urgent}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Complete / Archived View ──────────────────────────────────────────────────

interface CompleteViewProps {
  callings: Calling[];
  onSelect: (c: Calling) => void;
}

function CompleteView({ callings, onSelect }: CompleteViewProps) {
  if (callings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <CheckCircle2 className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No completed callings yet</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {callings.map((calling) => (
        <div
          key={calling.id}
          onClick={() => onSelect(calling)}
          className="rounded-xl border border-border bg-card p-4 cursor-pointer hover:shadow-sm transition-shadow flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
              {calling.memberName ? getInitials(calling.memberName) : <CheckCircle2 className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{calling.memberName || "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{calling.position}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {calling.setApartDate && (
              <span className="text-xs text-muted-foreground hidden sm:block">Set apart {calling.setApartDate}</span>
            )}
            <Badge className={STAGE_COLORS.recorded}>Complete</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Pipeline Stage Flow (summary bar) ─────────────────────────────────────────

interface PipelineFlowProps {
  callings: Calling[];
}

function PipelineFlow({ callings }: PipelineFlowProps) {
  const activePipeline = CALLING_PIPELINE.filter((s) => s !== "recorded");
  return (
    <div className="hidden lg:flex items-center gap-0 rounded-xl border border-border bg-muted/30 px-4 py-3 overflow-x-auto">
      {activePipeline.map((stage, i) => {
        const count = callings.filter((c) => c.stage === stage).length;
        return (
          <div key={stage} className="flex items-center gap-0 shrink-0">
            <div className="flex flex-col items-center gap-1 px-3">
              <div className={cn(
                "text-lg font-bold tabular-nums",
                count > 0 ? "text-foreground" : "text-muted-foreground/30"
              )}>
                {count}
              </div>
              <div className={cn(
                "text-[10px] font-medium uppercase tracking-wide text-center leading-tight",
                count > 0 ? "text-muted-foreground" : "text-muted-foreground/30"
              )} style={{ maxWidth: 60 }}>
                {stageLabel(stage)}
              </div>
            </div>
            {i < activePipeline.length - 1 && (
              <ArrowRight className={cn("h-3.5 w-3.5 shrink-0", count > 0 ? "text-muted-foreground/40" : "text-muted-foreground/15")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type PageView = "pipeline" | "orgchart" | "complete";

interface PendingDrop {
  calling: Calling;
  memberName: string;
}

const EMPTY_FORM = {
  memberName: "",
  position: "",
  organization: "",
  notes: "",
  isVacant: false,
};

export default function CallingsPage() {
  const { user } = useAuth();
  const { completeCallingTasks } = useTasks();
  const [callings, setCallings] = useState<Calling[]>(() =>
    MOCK_CALLINGS.map((c) => ({ ...c, stage: normalizeStage(c.stage as string) }))
  );
  const [selected,    setSelected]    = useState<Calling | null>(null);
  const [newOpen,     setNewOpen]     = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [view,        setView]        = useState<PageView>("pipeline");
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleAdvance(updates: Partial<Calling> & { stage: CallingStage }) {
    if (!selected) return;
    const now = new Date().toISOString();
    setCallings((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, ...updates, updatedAt: now } : c))
    );
    setSelected(null);
  }

  function handleMove(callingId: string, toStage: CallingStage) {
    const now = new Date().toISOString();
    setCallings((prev) =>
      prev.map((c) => (c.id === callingId ? { ...c, stage: toStage, updatedAt: now } : c))
    );
  }

  // Drag a member onto a calling → open a confirmation
  function handleDropMember(calling: Calling, memberName: string) {
    setPendingDrop({ calling, memberName });
  }

  // Confirm the proposed call / release+recall
  function confirmDrop() {
    if (!pendingDrop) return;
    const { calling, memberName } = pendingDrop;
    const isReplace = calling.stage !== "vacant";
    const now = new Date().toISOString();

    setCallings((prev) =>
      prev.map((c) =>
        c.id === calling.id
          ? {
              ...c,
              memberName,
              memberId: "",
              stage: "discussing",
              // Track the outgoing person when replacing someone who is serving
              outgoingMemberName: isReplace && calling.stage === "recorded"
                ? calling.memberName
                : undefined,
              // Reset all pipeline progress for the fresh process
              approvedBy: undefined, approvedAt: undefined,
              extendedBy: undefined, extendedAt: undefined,
              sustainedIn: undefined, sustainedDate: undefined, businessItemAdded: undefined,
              setApartBy: undefined, setApartDate: undefined,
              lcrUpdated: undefined, lcrUpdatedBy: undefined, lcrUpdatedAt: undefined,
              declineReason: undefined, declinedAt: undefined,
              updatedAt: now,
            }
          : c
      )
    );
    // Clear any tasks tied to the previous candidate/holder
    completeCallingTasks(calling.id);
    setPendingDrop(null);
  }

  async function handleCreate() {
    if (!form.position.trim()) return;
    if (!form.isVacant && !form.memberName.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 200));
    const now = new Date().toISOString();
    const newCalling: Calling = {
      id:           `c-${Date.now()}`,
      memberName:   form.isVacant ? "" : form.memberName.trim(),
      memberId:     "",
      position:     form.position.trim(),
      organization: form.organization.trim(),
      notes:        form.notes.trim(),
      stage:        form.isVacant ? "vacant" : "discussing",
      createdBy:    user?.uid ?? "mock",
      createdAt:    now,
      updatedAt:    now,
    };
    setCallings((prev) => [newCalling, ...prev]);
    setNewOpen(false);
    setForm(EMPTY_FORM);
    setSaving(false);
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const pipelineCallings  = callings.filter((c) => c.stage !== "recorded");
  const completeCallings  = callings.filter((c) => c.stage === "recorded");
  const vacantCallings    = callings.filter((c) => c.stage === "vacant");
  const attentionCallings = pipelineCallings.filter((c) => attentionMessage(c));
  const bizItemCallings   = pipelineCallings.filter(
    (c) => c.stage === "sustaining" && c.sustainedIn === "sacrament_meeting" && !c.businessItemAdded
  );

  const TAB_CONFIG: { view: PageView; label: string; count?: number }[] = [
    { view: "pipeline", label: "Pipeline",                                       },
    { view: "orgchart", label: "Org Chart", count: callings.length              },
    { view: "complete", label: "Complete",  count: completeCallings.length       },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full p-4 lg:p-8 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Callings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pipelineCallings.length} active
            {vacantCallings.length > 0 && (
              <span className="text-red-600 dark:text-red-400"> · {vacantCallings.length} vacant</span>
            )}
            {attentionCallings.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400"> · {attentionCallings.length} need attention</span>
            )}
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Calling</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Pipeline flow summary (desktop only) */}
      {view === "pipeline" && <PipelineFlow callings={pipelineCallings} />}

      {/* Business items banner */}
      {bizItemCallings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Business Items — Sacrament Meeting Announcements Needed
            </p>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Add the following to the business items document before the sustaining vote:
          </p>
          <ul className="space-y-1.5">
            {bizItemCallings.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="text-sm text-amber-900 dark:text-amber-100">
                  <strong>{c.memberName || "Vacant"}</strong> — {c.position}
                  {c.sustainedDate && (
                    <span className="text-amber-600 dark:text-amber-400"> ({c.sustainedDate})</span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs border-amber-300 dark:border-amber-700 shrink-0"
                  onClick={() => setSelected(c)}
                >
                  Mark Added
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Attention banner (shown only when no biz-item banner) */}
      {attentionCallings.length > 0 && bizItemCallings.length === 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>{attentionCallings.length}</strong> calling{attentionCallings.length !== 1 ? "s need" : " needs"} attention — open a card to take action.
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

      {view === "pipeline" && (
        <KanbanView
          callings={pipelineCallings}
          onSelect={setSelected}
          onMove={handleMove}
        />
      )}

      {view === "orgchart" && (
        <OrgChartView
          callings={callings}
          onSelect={setSelected}
          onDropMember={handleDropMember}
        />
      )}

      {view === "complete" && (
        <CompleteView
          callings={completeCallings}
          onSelect={setSelected}
        />
      )}

      {/* ── Detail dialog ── */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-start justify-between gap-3 pr-2">
                  <span className="truncate">{selected.memberName || "Vacant Position"}</span>
                  <Badge className={cn("text-xs shrink-0 mt-0.5", STAGE_COLORS[selected.stage])}>
                    {stageLabel(selected.stage)}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Details */}
                <div className="text-sm space-y-1 text-muted-foreground">
                  <p><span className="font-medium text-foreground">Position:</span> {selected.position}</p>
                  {selected.organization && <p><span className="font-medium text-foreground">Organization:</span> {selected.organization}</p>}
                  {selected.outgoingMemberName && (
                    <p className="text-amber-600 dark:text-amber-400">
                      <span className="font-medium">Replacing:</span> {selected.outgoingMemberName} (needs to be released in LCR)
                    </p>
                  )}
                  {selected.approvedBy    && <p><span className="font-medium text-foreground">Approved by:</span> {selected.approvedBy}</p>}
                  {selected.extendedBy    && <p><span className="font-medium text-foreground">Extended by:</span> {selected.extendedBy}</p>}
                  {selected.sustainedIn   && <p><span className="font-medium text-foreground">Venue:</span> {selected.sustainedIn === "sacrament_meeting" ? "Sacrament Meeting" : "Class / Quorum"}</p>}
                  {selected.sustainedDate && <p><span className="font-medium text-foreground">Sustaining date:</span> {selected.sustainedDate}</p>}
                  {selected.sustainedIn === "sacrament_meeting" && selected.businessItemAdded != null && (
                    <p><span className="font-medium text-foreground">Business item added:</span> {selected.businessItemAdded ? "✓ Yes" : "✗ Not yet"}</p>
                  )}
                  {selected.setApartBy    && <p><span className="font-medium text-foreground">Set apart by:</span> {selected.setApartBy}</p>}
                  {selected.setApartDate  && <p><span className="font-medium text-foreground">Set apart date:</span> {selected.setApartDate}</p>}
                  {selected.lcrUpdatedBy  && <p><span className="font-medium text-foreground">LCR updated by:</span> {selected.lcrUpdatedBy}</p>}
                  {selected.declineReason && <p><span className="font-medium text-foreground">Previous decline:</span> {selected.declineReason}</p>}
                  {selected.notes         && <p><span className="font-medium text-foreground">Notes:</span> {selected.notes}</p>}
                </div>

                {/* Progress dots */}
                <div className="flex gap-1.5 items-center flex-wrap">
                  {CALLING_PIPELINE.map((s, i) => {
                    const current = pipelineIndex(selected.stage);
                    return (
                      <div
                        key={s}
                        title={stageLabel(s)}
                        className={cn(
                          "h-2.5 w-2.5 rounded-full transition-colors",
                          i < current
                            ? "bg-green-500"
                            : i === current
                            ? "bg-primary"
                            : "bg-muted"
                        )}
                      />
                    );
                  })}
                  <span className="text-xs text-muted-foreground ml-1">{stageLabel(selected.stage)}</span>
                </div>

                {selected.stage !== "recorded" ? (
                  <StageAdvancePanel calling={selected} onSave={handleAdvance} onClose={() => setSelected(null)} />
                ) : (
                  <div className="border-t pt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Calling complete and archived.</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelected(null)}>Close</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── New calling dialog ── */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Calling</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.isVacant}
                onChange={(e) => setForm((f) => ({ ...f, isVacant: e.target.checked, memberName: "" }))}
              />
              <div>
                <p className="text-sm font-medium">Vacant position</p>
                <p className="text-xs text-muted-foreground">No candidate yet — start the process from scratch</p>
              </div>
            </label>
            {!form.isVacant && (
              <div className="space-y-1.5">
                <Label htmlFor="newMemberName">Member Name *</Label>
                <Input
                  id="newMemberName"
                  value={form.memberName}
                  onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))}
                  placeholder="Full name"
                  autoFocus
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="newPosition">Position *</Label>
              <Input
                id="newPosition"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                placeholder="e.g. Sunday School Teacher"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newOrg">Organization</Label>
              <Input
                id="newOrg"
                value={form.organization}
                onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                placeholder="e.g. Sunday School"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newNotes">Notes</Label>
              <Input
                id="newNotes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !form.position.trim() || (!form.isVacant && !form.memberName.trim())}
            >
              {saving ? "Creating…" : "Create Calling"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Drag-drop proposal dialog ── */}
      <Dialog open={!!pendingDrop} onOpenChange={(open) => !open && setPendingDrop(null)}>
        <DialogContent>
          {pendingDrop && (() => {
            const { calling, memberName } = pendingDrop;
            const isVacant   = calling.stage === "vacant";
            const isServing  = calling.stage === "recorded";
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {isVacant ? (
                      <><User className="h-5 w-5 text-primary" /> Propose Calling</>
                    ) : (
                      <><ArrowRightLeft className="h-5 w-5 text-amber-500" /> Propose Release &amp; Call</>
                    )}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-3 text-sm">
                  {isVacant ? (
                    <p>
                      Call <strong>{memberName}</strong> as <strong>{calling.position}</strong>
                      {calling.organization ? <> in <strong>{calling.organization}</strong></> : null}?
                      This starts the calling process at the discussion stage.
                    </p>
                  ) : isServing ? (
                    <>
                      <p>
                        Release <strong>{calling.memberName}</strong> and call{" "}
                        <strong>{memberName}</strong> as <strong>{calling.position}</strong>?
                      </p>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                        <p>• {calling.memberName} will be marked for release (record in LCR).</p>
                        <p>• A fresh calling process begins for {memberName} at the discussion stage.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>
                        Replace the current candidate <strong>{calling.memberName}</strong> with{" "}
                        <strong>{memberName}</strong> for <strong>{calling.position}</strong>?
                      </p>
                      <p className="text-xs text-muted-foreground">
                        The in-progress process for {calling.memberName} will be reset and restarted for {memberName}.
                      </p>
                    </>
                  )}
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setPendingDrop(null)}>Cancel</Button>
                  <Button onClick={confirmDrop}>
                    {isVacant ? "Propose Calling" : isServing ? "Release & Call" : "Replace Candidate"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
