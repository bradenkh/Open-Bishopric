"use client";

import { useState } from "react";
import {
  Plus, Church, AlertTriangle, CheckCircle2, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import type { Calling, CallingStage, SustainedVenue } from "@/types";
import { CALLING_STAGES, CALLING_PIPELINE } from "@/types";
import { MOCK_CALLINGS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeStage(stage: string): CallingStage {
  const legacy: Record<string, CallingStage> = {
    identified: "discussing",
    extended:   "extending",
    responded:  "accepted",
  };
  return (legacy[stage] ?? stage) as CallingStage;
}

function stageLabel(stage: CallingStage): string {
  return CALLING_STAGES.find((s) => s.stage === stage)?.label ?? stage;
}

function pipelineIndex(stage: CallingStage): number {
  return CALLING_PIPELINE.indexOf(stage);
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
    return "Add to business items document";
  }
  if (c.stage === "accepted")    return "Schedule sustaining";
  if (c.stage === "set_apart")   return "Update LCR";
  if (c.stage === "lcr_updated") return "Ready to mark complete";
  return null;
}

// ── Stage advance panel ───────────────────────────────────────────────────────

interface AdvancePanelProps {
  calling: Calling;
  onSave: (updates: Partial<Calling> & { stage: CallingStage }) => void;
  onClose: () => void;
}

function StageAdvancePanel({ calling, onSave, onClose }: AdvancePanelProps) {
  const stage = calling.stage;
  const name  = calling.memberName || "this person";

  const [candidateName,   setCandidateName]   = useState("");
  const [approvedBy,      setApprovedBy]      = useState(calling.approvedBy ?? "");
  const [extendedBy,      setExtendedBy]      = useState(calling.extendedBy ?? "");
  const [sustainedIn,     setSustainedIn]     = useState<SustainedVenue>("sacrament_meeting");
  const [sustainedDate,   setSustainedDate]   = useState(calling.sustainedDate ?? "");
  const [bizAdded,        setBizAdded]        = useState(calling.businessItemAdded ?? false);
  const [setApartBy,      setSetApartBy]      = useState(calling.setApartBy ?? "");
  const [setApartDate,    setSetApartDate]    = useState(calling.setApartDate ?? "");
  const [lcrUpdatedBy,    setLcrUpdatedBy]    = useState(calling.lcrUpdatedBy ?? "");
  const [lcrConfirmed,    setLcrConfirmed]    = useState(false);
  const [declineReason,   setDeclineReason]   = useState("");
  const [declineRestart,  setDeclineRestart]  = useState<"vacant" | "discussing">("vacant");
  const [showDeclineForm, setShowDeclineForm] = useState(false);

  if (stage === "vacant") {
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Identify a Candidate</p>
        <div className="space-y-1.5">
          <Label htmlFor="candidateName">Who is being discussed for this position?</Label>
          <Input id="candidateName" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Full name" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button disabled={!candidateName.trim()} onClick={() => onSave({ stage: "discussing", memberName: candidateName.trim() })}>
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
        <p className="text-sm text-muted-foreground">Has the bishopric approved calling <strong>{name}</strong>?</p>
        <div className="space-y-1.5">
          <Label htmlFor="approvedBy">Approved by</Label>
          <Input id="approvedBy" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="e.g. Bishop Anderson" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button disabled={!approvedBy.trim()} onClick={() => onSave({ stage: "approved", approvedBy: approvedBy.trim(), approvedAt: new Date().toISOString() })}>
            Mark Approved
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "approved") {
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Extend the Calling</p>
        <p className="text-sm text-muted-foreground">Which bishopric member is reaching out to <strong>{name}</strong>?</p>
        <div className="space-y-1.5">
          <Label htmlFor="extendedBy">Extended by</Label>
          <Input id="extendedBy" value={extendedBy} onChange={(e) => setExtendedBy(e.target.value)} placeholder="e.g. Counselor Hughes" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button disabled={!extendedBy.trim()} onClick={() => onSave({ stage: "extending", extendedBy: extendedBy.trim(), extendedAt: new Date().toISOString() })}>
            Mark Extended
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
        {!showDeclineForm ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400" onClick={() => setShowDeclineForm(true)}>
              Declined
            </Button>
            <Button className="flex-1" onClick={() => onSave({ stage: "accepted" })}>
              Accepted ✓
            </Button>
          </div>
        ) : (
          <div className="rounded-lg bg-muted/50 border p-3 space-y-3">
            <p className="text-sm font-medium">Record Decline</p>
            <div className="space-y-1.5">
              <Label htmlFor="declineReason">Reason (optional)</Label>
              <Input id="declineReason" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Optional reason" />
            </div>
            <div className="space-y-1.5">
              <Label>Next step</Label>
              <div className="flex gap-4">
                {(["vacant", "discussing"] as const).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="restart" value={opt} checked={declineRestart === opt} onChange={() => setDeclineRestart(opt)} />
                    {opt === "vacant" ? "Leave as vacant" : "Discuss new candidate"}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowDeclineForm(false)}>Back</Button>
              <Button variant="destructive" size="sm" onClick={() => onSave({ stage: declineRestart, declineReason: declineReason.trim() || undefined, declinedAt: new Date().toISOString(), memberName: declineRestart === "vacant" ? "" : calling.memberName })}>
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
        <p className="text-sm text-muted-foreground">Where and when will <strong>{name}</strong> be sustained?</p>
        <div className="space-y-1.5">
          <Label>Where</Label>
          <div className="flex gap-4">
            {([["sacrament_meeting", "Sacrament Meeting"], ["class", "Class / Quorum"]] as [SustainedVenue, string][]).map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="sustainedIn" value={val} checked={sustainedIn === val} onChange={() => setSustainedIn(val)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sustainedDate">Date</Label>
          <Input id="sustainedDate" type="date" value={sustainedDate} onChange={(e) => setSustainedDate(e.target.value)} />
        </div>
        {sustainedIn === "sacrament_meeting" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60 p-3 flex gap-2 text-sm text-amber-800 dark:text-amber-200">
            <ClipboardList className="h-4 w-4 shrink-0 mt-0.5" />
            <span><strong>Reminder:</strong> Add this to the business items document so counselors know to announce it.</span>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button onClick={() => onSave({ stage: "sustaining", sustainedIn, sustainedDate: sustainedDate || undefined, businessItemAdded: sustainedIn === "class" })}>
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
          Has <strong>{name}</strong> been sustained{calling.sustainedIn === "sacrament_meeting" ? " in sacrament meeting" : " in their class/quorum"}{calling.sustainedDate ? ` on ${calling.sustainedDate}` : ""}?
        </p>
        {needsBizItem && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/60 p-3 space-y-2">
            <div className="flex gap-2 text-sm text-red-800 dark:text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span><strong>Action required:</strong> This calling has not been added to the business items document yet.</span>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={bizAdded} onChange={(e) => setBizAdded(e.target.checked)} />
              I have added this to the business items document
            </label>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button disabled={needsBizItem && !bizAdded} onClick={() => onSave({ stage: "sustained", businessItemAdded: true })}>
            Confirm Sustained
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "sustained") {
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Record Setting Apart</p>
        <p className="text-sm text-muted-foreground">Who will set <strong>{name}</strong> apart, and when?</p>
        <div className="space-y-1.5">
          <Label htmlFor="setApartBy">Set apart by</Label>
          <Input id="setApartBy" value={setApartBy} onChange={(e) => setSetApartBy(e.target.value)} placeholder="e.g. Bishop Anderson" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="setApartDate">Date</Label>
          <Input id="setApartDate" type="date" value={setApartDate} onChange={(e) => setSetApartDate(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button disabled={!setApartBy.trim()} onClick={() => onSave({ stage: "set_apart", setApartBy: setApartBy.trim(), setApartDate: setApartDate || undefined })}>
            Mark Set Apart
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "set_apart") {
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Update LCR</p>
        <p className="text-sm text-muted-foreground">Has <strong>{name}&apos;s</strong> calling been recorded in LCR (Leader &amp; Clerk Resources)?</p>
        <div className="space-y-1.5">
          <Label htmlFor="lcrUpdatedBy">Updated by</Label>
          <Input id="lcrUpdatedBy" value={lcrUpdatedBy} onChange={(e) => setLcrUpdatedBy(e.target.value)} placeholder="e.g. Ward Clerk" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={lcrConfirmed} onChange={(e) => setLcrConfirmed(e.target.checked)} />
          I confirm LCR has been updated and {name} is marked as set apart
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button disabled={!lcrConfirmed || !lcrUpdatedBy.trim()} onClick={() => onSave({ stage: "lcr_updated", lcrUpdated: true, lcrUpdatedBy: lcrUpdatedBy.trim(), lcrUpdatedAt: new Date().toISOString() })}>
            Mark LCR Updated
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
          <span>All steps complete for <strong>{name}&apos;s</strong> calling as <strong>{calling.position}</strong>. Archive it to keep your pipeline clean.</span>
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

// ── Main page ─────────────────────────────────────────────────────────────────

type PageView = "pipeline" | "complete";

const EMPTY_FORM = { memberName: "", position: "", organization: "", notes: "", isVacant: false };

export default function CallingsPage() {
  const { user } = useAuth();
  const [callings, setCallings] = useState<Calling[]>(() =>
    MOCK_CALLINGS.map((c) => ({ ...c, stage: normalizeStage(c.stage as string) }))
  );
  const [selected, setSelected] = useState<Calling | null>(null);
  const [newOpen,  setNewOpen]  = useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [view,     setView]     = useState<PageView>("pipeline");

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleAdvance(updates: Partial<Calling> & { stage: CallingStage }) {
    if (!selected) return;
    const now = new Date().toISOString();
    setCallings((prev) =>
      prev.map((c) => c.id === selected.id ? { ...c, ...updates, updatedAt: now } : c)
    );
    setSelected(null);
  }

  async function handleCreate() {
    if (!form.position.trim()) return;
    if (!form.isVacant && !form.memberName.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 200)); // tiny fake delay
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
  const displayCallings   = view === "pipeline" ? pipelineCallings : completeCallings;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full p-4 lg:p-8 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Callings</h1>
          {vacantCallings.length > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">
              {vacantCallings.length} vacant position{vacantCallings.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Button onClick={() => setNewOpen(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Calling
        </Button>
      </div>

      {/* Business items banner */}
      {bizItemCallings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/60 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0" />
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Business Items — Sacrament Meeting Announcement Needed
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
                  {c.sustainedDate && <span className="text-amber-600 dark:text-amber-400"> ({c.sustainedDate})</span>}
                </span>
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-amber-300 dark:border-amber-700 shrink-0" onClick={() => setSelected(c)}>
                  Mark Added
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Attention banner */}
      {attentionCallings.length > 0 && bizItemCallings.length === 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>{attentionCallings.length}</strong> calling{attentionCallings.length !== 1 ? "s need" : " needs"} attention — open a card to take action.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([["pipeline", `Active (${pipelineCallings.length})`], ["complete", `Complete (${completeCallings.length})`]] as [PageView, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} className={cn("px-4 py-2 text-sm font-medium transition-colors rounded-t-lg", view === v ? "bg-background border border-b-background border-border text-foreground -mb-px" : "text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {/* Desktop kanban */}
      {view === "pipeline" && (
        <div className="hidden lg:block overflow-x-auto pb-2">
          <div className="flex gap-2.5" style={{ minWidth: "max-content" }}>
            {CALLING_PIPELINE.filter((s) => s !== "recorded").map((stage) => {
              const stageCalls = pipelineCallings.filter((c) => c.stage === stage);
              return (
                <div key={stage} className="w-44 flex-shrink-0 rounded-xl border border-border bg-muted/30 p-3" style={{ minHeight: 180 }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{stageLabel(stage)}</p>
                    {stageCalls.length > 0 && <span className="text-xs font-bold text-primary ml-1">{stageCalls.length}</span>}
                  </div>
                  <div className="space-y-2">
                    {stageCalls.map((c) => {
                      const urgent = attentionMessage(c);
                      return (
                        <div key={c.id} className={cn("rounded-lg bg-card border p-2.5 cursor-pointer hover:shadow-sm transition-shadow", urgent ? "border-amber-300 dark:border-amber-700" : "border-border")} onClick={() => setSelected(c)}>
                          {urgent && <div className="float-right h-2 w-2 rounded-full bg-amber-400 mt-0.5 ml-1" />}
                          <p className="text-xs font-medium leading-tight">{c.memberName || <span className="text-muted-foreground italic">Vacant</span>}</p>
                          <p className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">{c.position}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile + complete list */}
      <div className={cn("space-y-2", view === "pipeline" ? "lg:hidden" : "")}>
        {displayCallings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Church className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">{view === "pipeline" ? "No active callings" : "No completed callings"}</p>
            {view === "pipeline" && <Button onClick={() => setNewOpen(true)} variant="outline" size="sm">Add a calling</Button>}
          </div>
        ) : (
          displayCallings.map((calling) => {
            const idx      = pipelineIndex(calling.stage);
            const progress = Math.round((Math.max(0, idx) / (CALLING_PIPELINE.length - 1)) * 100);
            const urgent   = attentionMessage(calling);
            return (
              <div key={calling.id} className={cn("rounded-xl border bg-card p-4 space-y-3 cursor-pointer active:opacity-80 transition-opacity", urgent ? "border-amber-300 dark:border-amber-700" : "border-border")} onClick={() => setSelected(calling)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{calling.memberName || <span className="text-muted-foreground italic">Vacant Position</span>}</p>
                    <p className="text-xs text-muted-foreground truncate">{calling.position}</p>
                    {calling.organization && <p className="text-xs text-muted-foreground truncate">{calling.organization}</p>}
                  </div>
                  <Badge className={cn("text-xs shrink-0", STAGE_COLORS[calling.stage])}>{stageLabel(calling.stage)}</Badge>
                </div>
                {urgent && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>{urgent}</span>
                  </div>
                )}
                {view === "pipeline" && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{NEXT_ACTION[calling.stage] ?? "In progress"}</span>
                      <span>{progress}%</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-start justify-between gap-3 pr-2">
                  <span className="truncate">{selected.memberName || "Vacant Position"}</span>
                  <Badge className={cn("text-xs shrink-0 mt-0.5", STAGE_COLORS[selected.stage])}>{stageLabel(selected.stage)}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="text-sm space-y-1 text-muted-foreground">
                  <p><span className="font-medium text-foreground">Position:</span> {selected.position}</p>
                  {selected.organization && <p><span className="font-medium text-foreground">Organization:</span> {selected.organization}</p>}
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
                      <div key={s} title={stageLabel(s)} className={cn("h-2.5 w-2.5 rounded-full transition-colors", i < current ? "bg-green-500" : i === current ? "bg-primary" : "bg-muted")} />
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

      {/* New calling dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Calling</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <input type="checkbox" className="mt-0.5" checked={form.isVacant} onChange={(e) => setForm((f) => ({ ...f, isVacant: e.target.checked, memberName: "" })) } />
              <div>
                <p className="text-sm font-medium">Vacant position</p>
                <p className="text-xs text-muted-foreground">No candidate yet — start the process from scratch</p>
              </div>
            </label>
            {!form.isVacant && (
              <div className="space-y-1.5">
                <Label htmlFor="newMemberName">Member Name *</Label>
                <Input id="newMemberName" value={form.memberName} onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))} placeholder="Full name" autoFocus />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="newPosition">Position *</Label>
              <Input id="newPosition" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} placeholder="e.g. Sunday School Teacher" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newOrg">Organization</Label>
              <Input id="newOrg" value={form.organization} onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))} placeholder="e.g. Sunday School" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newNotes">Notes</Label>
              <Input id="newNotes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !form.position.trim() || (!form.isVacant && !form.memberName.trim())}>
              {saving ? "Creating…" : "Create Calling"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
