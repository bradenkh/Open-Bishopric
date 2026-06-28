"use client";

import { useState, useMemo } from "react";
import {
  Plus, AlertTriangle, CheckCircle2, ClipboardList,
  GripVertical, User, ArrowRight, Search, X, UserPlus, UserMinus,
  Eye, EyeOff, Trash2,
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
import { useData, useTasks, newId } from "@/contexts/DataContext";
import type { Calling, CallingStage, Task, RosterGroup, RosterEntry } from "@/types";
import { CALLING_STAGES, CALLING_PIPELINE } from "@/types";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeStage(stage: string): CallingStage {
  const legacy: Record<string, CallingStage> = {
    identified:  "vacant",
    discussing:  "vacant",
    approved:    "extending",
    extended:    "extending",
    responded:   "sustaining",
    accepted:    "sustaining",
    sustained:   "set_apart",
    lcr_updated: "lcr_update",
  };
  return (legacy[stage] ?? stage) as CallingStage;
}

/** ISO date (yyyy-mm-dd) of the upcoming Sunday — used as the default sustaining date. */
function upcomingSundayISO(): string {
  const d = new Date();
  const offset = (7 - d.getDay()) % 7; // 0 if today is Sunday
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
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
  needs_calling: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  vacant:      "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  needs_release: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200",
  extending:   "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
  sustaining:  "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200",
  set_apart:   "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200",
  lcr_update:  "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200",
  recorded:    "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200",
};

// Per-stage column header styling
const STAGE_COLUMN_COLORS: Record<CallingStage, { header: string; ring: string; drop: string }> = {
  needs_calling: { header: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800", ring: "ring-amber-400", drop: "bg-amber-50/60 dark:bg-amber-950/20" },
  vacant:      { header: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",       ring: "ring-red-400",    drop: "bg-red-50/60 dark:bg-red-950/20" },
  needs_release: { header: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800", ring: "ring-orange-400", drop: "bg-orange-50/60 dark:bg-orange-950/20" },
  extending:   { header: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",   ring: "ring-blue-400",   drop: "bg-blue-50/60 dark:bg-blue-950/20" },
  sustaining:  { header: "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800", ring: "ring-purple-400", drop: "bg-purple-50/60 dark:bg-purple-950/20" },
  set_apart:   { header: "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800", ring: "ring-indigo-400", drop: "bg-indigo-50/60 dark:bg-indigo-950/20" },
  lcr_update:  { header: "bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-800",   ring: "ring-teal-400",   drop: "bg-teal-50/60 dark:bg-teal-950/20" },
  recorded:    { header: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800", ring: "ring-green-400", drop: "bg-green-50/60 dark:bg-green-950/20" },
};

const NEXT_ACTION: Partial<Record<CallingStage, string>> = {
  needs_calling: "Assign a calling & extend",
  vacant:      "Suggest a candidate & extend",
  needs_release: "Suggest & choose a replacement",
  extending:   "Follow up — awaiting response",
  sustaining:  "Confirm sustained at meeting",
  set_apart:   "Confirm they were set apart",
  lcr_update:  "Clerk: update LCR",
};

function attentionMessage(c: Calling): string | null {
  if (c.stage === "set_apart")  return "Confirm set apart";
  if (c.stage === "lcr_update") return "Awaiting LCR update";
  return null;
}

// ── Stage Advance Panel ───────────────────────────────────────────────────────

interface AdvancePanelProps {
  calling: Calling;
  onSave: (updates: Partial<Calling> & { stage: CallingStage }) => void;
  onClose: () => void;
}

function makeCallingTask(calling: Calling, overrides: Partial<Task>): Task {
  const now = new Date().toISOString();
  return {
    id:        newId(),
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

function StageAdvancePanel({ calling, onSave, onClose }: AdvancePanelProps) {
  const stage = calling.stage;
  const name  = calling.memberName || "this person";

  const { addTask, completeCallingTasks } = useTasks();
  const { bishopric } = useData();

  // Members who can extend callings or set apart (bishop + counselors).
  // Derived at runtime from the live bishopric roster.
  const EXTENDING_MEMBERS = useMemo(
    () => bishopric.filter((m) => m.role === "bishop" || m.role === "counselor"),
    [bishopric]
  );
  // All bishopric members (for set-apart — could include stake members in real use).
  const SET_APART_MEMBERS = useMemo(
    () => bishopric.filter((m) => m.role === "bishop" || m.role === "counselor"),
    [bishopric]
  );

  // ── Form state ────────────────────────────────────────────────────────────
  // Suggested candidates / replacements (needs_release + vacant)
  const [replacements,    setReplacements]    = useState<string[]>(calling.suggestedReplacements ?? []);
  const [replacementInput,setReplacementInput]= useState("");
  const [chosen,          setChosen]          = useState(calling.replacementName ?? "");
  // Extending — bishopric member who contacts the new person
  const [extendingMember, setExtendingMember] = useState(
    EXTENDING_MEMBERS.find((m) => m.name === calling.extendedBy)?.id ?? ""
  );
  // Releasing — bishopric member who informs the outgoing holder (runs in parallel)
  const [releasingMember, setReleasingMember] = useState(
    EXTENDING_MEMBERS.find((m) => m.name === calling.releasedBy)?.id ?? ""
  );
  // Set apart — bishopric member dropdown
  const [setApartMember,  setSetApartMember]  = useState(
    SET_APART_MEMBERS.find((m) => m.name === calling.setApartBy)?.id ?? ""
  );
  const [setApartDate,    setSetApartDate]    = useState(calling.setApartDate ?? "");
  const [lcrConfirmed,    setLcrConfirmed]    = useState(false);
  const [declineReason,   setDeclineReason]   = useState("");
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  // Assign a calling to a member who needs one (needs_calling stage)
  const [position,        setPosition]        = useState(calling.position ?? "");
  const [organization,    setOrganization]    = useState(calling.organization ?? "");

  // ── Stages ────────────────────────────────────────────────────────────────

  // ── Suggest candidates → assign a counselor to extend (needs_release + vacant)
  const addSuggestion = () => {
    const v = replacementInput.trim();
    if (!v || replacements.includes(v)) { setReplacementInput(""); return; }
    setReplacements((prev) => [...prev, v]);
    setReplacementInput("");
  };
  const removeSuggestion = (n: string) => {
    setReplacements((prev) => prev.filter((r) => r !== n));
    if (chosen === n) setChosen("");
  };

  function suggestExtendBody(isRelease: boolean) {
    const released  = calling.memberName || "the current holder";
    const noun      = isRelease ? "replacement" : "candidate";
    const extender  = EXTENDING_MEMBERS.find((m) => m.id === extendingMember);
    const releaser  = EXTENDING_MEMBERS.find((m) => m.id === releasingMember);
    const orgSuffix = calling.organization ? ` (${calling.organization})` : "";
    const releaseNote = () => {
      const note = `Released ${released}${releaser ? ` — informed by ${releaser.name}` : ""}`;
      return calling.notes ? `${calling.notes} · ${note}` : note;
    };
    const memberSelect = (
      value: string,
      onChange: (v: string) => void,
      placeholder: string,
    ) => (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {EXTENDING_MEMBERS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name} <span className="text-muted-foreground capitalize">({m.role})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
    // Adds the parallel "inform the outgoing holder" task.
    const addReleaseTask = (member: { id: string; name: string }) =>
      addTask(makeCallingTask(calling, {
        title:        `Inform of release — ${calling.position}`,
        description:  `Contact ${released} to let them know they're being released as ${calling.position}${orgSuffix}.`,
        assigneeId:   member.id,
        assigneeName: member.name,
        memberName:   calling.memberName || undefined,
        context: { callingId: calling.id, taskType: "release_inform", position: calling.position },
      }));

    return (
      <div className="border-t pt-4 space-y-4">
        <div>
          <p className="text-sm font-semibold">{isRelease ? "Release & Replace" : "Fill This Position"}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isRelease ? (
              <><strong>{released}</strong> is being released from {calling.position}. Assign someone to inform them, suggest replacements, then assign a counselor to extend — these happen in parallel.</>
            ) : (
              <>Suggest candidates for {calling.position}, choose one, then assign a counselor to extend.</>
            )}
          </p>
        </div>

        {/* Suggestions */}
        <div className="space-y-2">
          <Label>{isRelease ? "Suggested replacements" : "Suggested candidates"}</Label>
          <div className="flex gap-2">
            <Input
              value={replacementInput}
              onChange={(e) => setReplacementInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSuggestion(); } }}
              placeholder="Add a name…"
            />
            <Button type="button" variant="outline" onClick={addSuggestion} disabled={!replacementInput.trim()}>
              Add
            </Button>
          </div>
          {replacements.length === 0 ? (
            <p className="text-xs text-muted-foreground">No suggestions yet — add a few names to consider.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">Tap a name to choose the {noun}.</p>
              <div className="flex flex-wrap gap-1.5">
                {replacements.map((nm) => (
                  <span
                    key={nm}
                    className={cn(
                      "inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer",
                      chosen === nm
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-transparent hover:bg-accent"
                    )}
                    onClick={() => setChosen((c) => (c === nm ? "" : nm))}
                  >
                    {chosen === nm && <CheckCircle2 className="h-3 w-3" />}
                    {nm}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeSuggestion(nm); }}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                      aria-label={`Remove ${nm}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Release: who informs the outgoing holder (runs in parallel) */}
        {isRelease && (
          <div className="space-y-1.5">
            <Label>Who will inform {released} of their release?</Label>
            {memberSelect(releasingMember, setReleasingMember, "Select a counselor…")}
          </div>
        )}

        {/* Who extends the calling to the chosen person */}
        {chosen && (
          <div className="space-y-1.5">
            <Label>Who will extend the calling to {chosen}?</Label>
            {memberSelect(extendingMember, setExtendingMember, "Select a counselor…")}
          </div>
        )}

        {/* Summary of the tasks that will be created */}
        {((isRelease && releaser) || (chosen && extender)) && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60 p-3 text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <ul className="space-y-1 list-disc pl-4">
              {isRelease && releaser && (
                <li><strong>{releaser.name}</strong> contacts {released} about the release.</li>
              )}
              {chosen && extender && (
                <li><strong>{extender.name}</strong> extends {calling.position} to {chosen}.</li>
              )}
            </ul>
            {isRelease && releaser && chosen && extender && (
              <p className="text-[11px] opacity-80">Both tasks are created together and can happen in parallel.</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1">
          <Button
            disabled={!chosen || !extendingMember || (isRelease && !releasingMember)}
            onClick={() => {
              const exMember = EXTENDING_MEMBERS.find((m) => m.id === extendingMember)!;
              addTask(makeCallingTask(calling, {
                title:        `Extend calling — ${calling.position} → ${chosen}`,
                description:  `Contact ${chosen} to extend the calling of ${calling.position}${orgSuffix}. Once they respond, record the outcome in the pipeline.`,
                assigneeId:   exMember.id,
                assigneeName: exMember.name,
                memberName:   chosen,
                context: { callingId: calling.id, taskType: "extend", position: calling.position },
              }));
              if (isRelease) addReleaseTask(releaser!);
              onSave({
                stage:                 "extending",
                memberName:            chosen,
                suggestedReplacements: replacements,
                extendedBy:            exMember.name,
                extendedAt:            new Date().toISOString(),
                ...(isRelease
                  ? { replacementName: chosen, releasedName: calling.memberName || undefined, releasedBy: releaser!.name, notes: releaseNote() }
                  : {}),
              });
            }}
          >
            {!chosen
              ? `Choose a ${noun} to continue`
              : !extendingMember
                ? "Assign a counselor to extend"
                : (isRelease && !releasingMember)
                  ? "Assign a counselor to release"
                  : `Assign & extend to ${chosen}`}
          </Button>
          {isRelease && (
            <Button
              variant="outline"
              disabled={!releasingMember}
              onClick={() => {
                addReleaseTask(releaser!);
                onSave({
                  stage:                 "needs_calling",
                  memberName:            "",
                  releasedName:          calling.memberName || undefined,
                  releasedBy:            releaser!.name,
                  suggestedReplacements: replacements,
                  notes:                 releaseNote(),
                });
              }}
            >
              Release &amp; leave open
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Not Yet</Button>
        </div>
      </div>
    );
  }

  if (stage === "needs_release") return suggestExtendBody(true);
  if (stage === "vacant")        return suggestExtendBody(false);

  if (stage === "needs_calling") {
    return (
      <div className="border-t pt-4 space-y-4">
        <div>
          <p className="text-sm font-semibold">Assign a Calling</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Decide which calling to extend to <strong>{name}</strong>, then assign a counselor to extend it.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ncPosition">Calling / position</Label>
          <Input
            id="ncPosition"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="e.g. Sunday School Teacher"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ncOrg">Organization</Label>
          <Input
            id="ncOrg"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="e.g. Sunday School"
          />
        </div>
        {position.trim() && (
          <div className="space-y-1.5">
            <Label>Who will extend {position.trim()} to {name}?</Label>
            <Select value={extendingMember} onValueChange={setExtendingMember}>
              <SelectTrigger>
                <SelectValue placeholder="Select a counselor…" />
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
        )}
        <div className="flex flex-col gap-2 pt-1">
          <Button
            disabled={!position.trim() || !extendingMember}
            onClick={() => {
              const member = EXTENDING_MEMBERS.find((m) => m.id === extendingMember)!;
              const pos    = position.trim();
              const org    = organization.trim();
              addTask(makeCallingTask(calling, {
                title:        `Extend calling — ${pos} → ${name}`,
                description:  `Contact ${name} to extend the calling of ${pos}${org ? ` (${org})` : ""}. Once they respond, record the outcome in the pipeline.`,
                assigneeId:   member.id,
                assigneeName: member.name,
                memberName:   calling.memberName || undefined,
                context: { callingId: calling.id, taskType: "extend", position: pos },
              }));
              onSave({
                stage:        "extending",
                position:     pos,
                organization: org,
                extendedBy:   member.name,
                extendedAt:   new Date().toISOString(),
              });
            }}
          >
            {!position.trim()
              ? "Enter a calling to continue"
              : !extendingMember
                ? "Assign a counselor to extend"
                : `Assign & extend to ${name}`}
          </Button>
          <Button variant="ghost" onClick={onClose}>Not Yet</Button>
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
                // Accepting jumps straight to sustaining and is automatically
                // added to the upcoming sacrament-meeting business items.
                onSave({
                  stage:             "sustaining",
                  sustainedIn:       "sacrament_meeting",
                  sustainedDate:     upcomingSundayISO(),
                  businessItemAdded: true,
                });
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
            <p className="text-xs text-muted-foreground">
              The position will return to <strong>Needs Calling</strong> so you can suggest another candidate.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowDeclineForm(false)}>Back</Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  // Auto-complete the open extend task
                  completeCallingTasks(calling.id);
                  onSave({
                    stage:         "needs_calling",
                    declineReason: declineReason.trim() || undefined,
                    declinedAt:    new Date().toISOString(),
                    memberName:    "",
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

  if (stage === "sustaining") {
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Confirm Sustained</p>
        <p className="text-sm text-muted-foreground">
          Has <strong>{name}</strong> been sustained in sacrament meeting
          {calling.sustainedDate ? ` on ${calling.sustainedDate}` : ""}?
        </p>
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/60 p-3 flex gap-2 text-xs text-blue-800 dark:text-blue-200">
          <ClipboardList className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            This calling is on the sacrament-meeting business items
            {calling.sustainedDate ? ` for ${calling.sustainedDate}` : " for the upcoming meeting"}.
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button onClick={() => onSave({ stage: "set_apart" })}>Confirm Sustained</Button>
        </div>
      </div>
    );
  }

  if (stage === "set_apart") {
    const selectedMember = SET_APART_MEMBERS.find((m) => m.id === setApartMember);
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Confirm Setting Apart</p>
        <p className="text-sm text-muted-foreground">
          Who set <strong>{name}</strong> apart, and when?
        </p>
        <div className="space-y-1.5">
          <Label>Set apart by</Label>
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
          <Label htmlFor="setApartDate">Date set apart</Label>
          <Input
            id="setApartDate"
            type="date"
            value={setApartDate}
            onChange={(e) => setSetApartDate(e.target.value)}
          />
        </div>
        {selectedMember && (
          <div className="rounded-lg border border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/60 p-3 text-xs text-teal-800 dark:text-teal-200">
            Once confirmed, this moves to <strong>Update LCR</strong> so the ward clerk can record the
            calling in Leader &amp; Clerk Resources.
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Not Yet</Button>
          <Button
            disabled={!setApartMember}
            onClick={() => {
              const member = SET_APART_MEMBERS.find((m) => m.id === setApartMember)!;
              onSave({ stage: "lcr_update", setApartBy: member.name, setApartDate: setApartDate || undefined });
            }}
          >
            Confirm Set Apart
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "lcr_update") {
    const clerk = bishopric.find((m) => m.role === "clerk");
    return (
      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-semibold">Update LCR</p>
        <p className="text-sm text-muted-foreground">
          <strong>{name}</strong> was set apart
          {calling.setApartBy ? <> by <strong>{calling.setApartBy}</strong></> : null}
          {calling.setApartDate ? ` on ${calling.setApartDate}` : ""}. Awaiting the ward clerk to record
          it in Leader &amp; Clerk Resources.
        </p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={lcrConfirmed}
            onChange={(e) => setLcrConfirmed(e.target.checked)}
          />
          I confirm {name} has been updated in LCR
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            disabled={!lcrConfirmed}
            onClick={() => onSave({
              stage:        "recorded",
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

  return null;
}

// ── Shared Calling Card ───────────────────────────────────────────────────────

interface CallingCardProps {
  calling: Calling;
  onClick: () => void;
  onDelete?: () => void;
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
  onDelete,
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
            <p className="text-[11px] text-muted-foreground leading-tight truncate">
              {calling.position || (
                calling.stage === "needs_calling"
                  ? <span className="italic">Needs a calling</span>
                  : null
              )}
            </p>
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
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                "inline-flex items-center justify-center h-6 w-6 rounded-md transition-colors",
                "text-muted-foreground/50 hover:bg-muted hover:text-red-600 dark:hover:text-red-400",
                "opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
              )}
              title="Delete this calling"
              aria-label="Delete this calling"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {(calling.stage === "needs_release" || calling.stage === "vacant") && (() => {
        const isRelease   = calling.stage === "needs_release";
        const suggestions = calling.suggestedReplacements ?? [];
        const chosenExtra =
          calling.replacementName && !suggestions.includes(calling.replacementName)
            ? [calling.replacementName]
            : [];
        const all = [...suggestions, ...chosenExtra];
        if (all.length === 0) {
          return (
            <div className="mt-2 pl-5">
              <p className="text-[10px] text-muted-foreground/60 italic">
                No {isRelease ? "replacement" : "candidate"} suggested yet
              </p>
            </div>
          );
        }
        return (
          <div className="mt-2 pl-5 space-y-1">
            <p className="text-[10px] text-muted-foreground">
              {isRelease ? "Suggested replacements" : "Suggested candidates"}
            </p>
            <div className="flex flex-wrap gap-1">
              {all.map((nm) => {
                const isChosen = nm === calling.replacementName;
                return (
                  <span
                    key={nm}
                    className={cn(
                      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium max-w-full truncate",
                      isChosen
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                    title={isChosen ? `${nm} (chosen)` : nm}
                  >
                    {isChosen && <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />}
                    <span className="truncate">{nm}</span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}

      {calling.stage !== "needs_release" && calling.releasedName && (
        <div className="mt-2 pl-5 text-[10px] text-muted-foreground truncate">
          Replacing {calling.releasedName}
        </div>
      )}

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
  onDelete: (c: Calling) => void;
}

function KanbanView({ callings, onSelect, onMove, onDelete }: KanbanViewProps) {
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
                      onDelete={() => onDelete(c)}
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

// ── Chart View (full ward roster) ─────────────────────────────────────────────
// A complete, organization-grouped roster of every calling and who holds it.
// Built for the bishopric to see the whole ward at a glance — spot vacancies,
// find who holds what, and weigh options when moving people around.

interface ChartRowProps {
  entry: RosterEntry;
  org: string;
  holdCount: number;
  isActiveMember: boolean;
  isHighlighted: boolean;
  /** The current holder is in the pipeline at the "needs release" stage. */
  needsRelease: boolean;
  onMemberClick: (member: string) => void;
  onAction: (action: "release" | "fill", entry: RosterEntry, org: string) => void;
}

function ChartRow({ entry, org, holdCount, isActiveMember, isHighlighted, needsRelease, onMemberClick, onAction }: ChartRowProps) {
  const isVacant = !entry.member;
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors",
        // Search highlight takes precedence so matches stand out everywhere.
        isHighlighted
          ? "bg-yellow-200/80 ring-1 ring-yellow-400 dark:bg-yellow-500/25 dark:ring-yellow-500/50"
          : needsRelease
            ? "bg-orange-50/80 ring-1 ring-orange-300 dark:bg-orange-950/25 dark:ring-orange-800/60"
            : isVacant
              ? "bg-red-50/70 dark:bg-red-950/20"
              : isActiveMember
                ? "bg-primary/10 ring-1 ring-primary/40"
                : "hover:bg-muted/60"
      )}
    >
      <p className={cn("min-w-0 flex-1 truncate", isVacant && "text-muted-foreground")}>
        {entry.position}
        {entry.custom && (
          <span className="text-muted-foreground/40" title="Custom (ward-defined) calling"> *</span>
        )}
      </p>

      <div className="flex items-center gap-2 shrink-0">
        {isVacant ? (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200 text-[10px] h-5 px-2">
            Vacant
          </Badge>
        ) : (
          <>
            <button
              onClick={() => onMemberClick(entry.member!)}
              className={cn(
                "font-medium hover:underline truncate max-w-[10rem] sm:max-w-none text-right",
                isActiveMember && "text-primary"
              )}
              title="Highlight every calling this person holds"
            >
              {entry.member}
            </button>
            {needsRelease && (
              <Badge
                className="bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200 text-[10px] h-5 px-2 gap-1 shrink-0"
                title="Marked for release — in the pipeline"
              >
                <UserMinus className="h-3 w-3" />
                <span className="hidden sm:inline">Needs release</span>
              </Badge>
            )}
            {holdCount > 1 && (
              <span
                className="text-[10px] font-bold tabular-nums px-1.5 h-4 inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                title={`Holds ${holdCount} callings`}
              >
                ×{holdCount}
              </span>
            )}
            {entry.sustained && (
              <span className="hidden md:inline text-[11px] text-muted-foreground tabular-nums w-20 text-right">
                {entry.sustained}
              </span>
            )}
            {entry.setApart ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" aria-label="Set apart" />
            ) : (
              <span
                className="h-2 w-2 rounded-full bg-amber-400/70 shrink-0"
                title="Not yet set apart"
                aria-label="Not yet set apart"
              />
            )}
          </>
        )}

        {/* Per-calling action — visible on hover (always on touch) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction(isVacant ? "fill" : "release", entry, org);
          }}
          className={cn(
            "shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-md transition-colors",
            "text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:opacity-100",
            "opacity-100 md:opacity-0 md:group-hover:opacity-100",
            isVacant
              ? "hover:text-green-700 dark:hover:text-green-300"
              : "hover:text-orange-700 dark:hover:text-orange-300"
          )}
          title={isVacant ? "Add to pipeline to fill" : "Mark for release"}
          aria-label={isVacant ? "Add to pipeline to fill" : "Mark for release"}
        >
          {isVacant ? <UserPlus className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

/** Build the lookup key for a roster entry's holder against the needs-release set. */
function releaseKey(org: string, position: string, member: string): string {
  return `${org}|||${position}|||${member}`;
}

interface ChartViewProps {
  roster: RosterGroup[];
  /** Keys (org|position|member) for holders currently at the "needs release" stage. */
  needsReleaseSet: Set<string>;
  onAction: (action: "release" | "fill", entry: RosterEntry, org: string) => void;
}

function ChartView({ roster: fullRoster, needsReleaseSet, onAction }: ChartViewProps) {
  // Entries hidden in settings are dropped entirely from the chart.
  const roster = useMemo(
    () => fullRoster.map((g) => ({ ...g, entries: g.entries.filter((e) => !e.hidden) })),
    [fullRoster],
  );
  const [query, setQuery]               = useState("");
  const [vacantOnly, setVacantOnly]     = useState(false);
  const [activeMember, setActiveMember] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  // Flat list + per-person calling counts (over the full roster, not filtered).
  const { allEntries, holdCounts } = useMemo(() => {
    const entries = roster.flatMap((g) => g.entries);
    const counts = new Map<string, number>();
    for (const e of entries) {
      if (e.member) counts.set(e.member, (counts.get(e.member) ?? 0) + 1);
    }
    return { allEntries: entries, holdCounts: counts };
  }, [roster]);

  const totalCount  = allEntries.length;
  const filledCount = allEntries.filter((e) => e.member).length;
  const vacantCount = totalCount - filledCount;

  // Filters that hide rows (explicit, opt-in). Search is NOT one of them.
  const passesFilter = (e: RosterEntry): boolean => {
    if (vacantOnly && e.member) return false;
    if (activeMember && e.member !== activeMember) return false;
    return true;
  };

  // Search highlights matching rows without removing anything from view.
  const isHighlighted = (e: RosterEntry): boolean =>
    q !== "" && `${e.position} ${e.member ?? "vacant"}`.toLowerCase().includes(q);

  // Order orgs by first appearance; keep their sub-groups in order.
  const orgs = useMemo(() => {
    const order: string[] = [];
    const byOrg = new Map<string, RosterGroup[]>();
    for (const g of roster) {
      if (!byOrg.has(g.org)) { byOrg.set(g.org, []); order.push(g.org); }
      byOrg.get(g.org)!.push(g);
    }
    return order.map((org) => ({ org, groups: byOrg.get(org)! }));
  }, [roster]);

  const filtering = vacantOnly || activeMember !== null;
  const matchCount = filtering ? allEntries.filter(passesFilter).length : totalCount;
  const highlightCount = q !== "" ? allEntries.filter(isHighlighted).length : 0;

  return (
    <div className="space-y-4">
      {/* Summary + controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-medium">{totalCount} positions</span>
          <span className="text-green-600 dark:text-green-400">{filledCount} filled</span>
          <span className="text-red-600 dark:text-red-400">{vacantCount} vacant</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search to highlight a person or calling…"
              className="pl-9 pr-16"
            />
            {q !== "" && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground tabular-nums">
                {highlightCount} match{highlightCount !== 1 ? "es" : ""}
              </span>
            )}
          </div>
          <button
            onClick={() => setVacantOnly((v) => !v)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 whitespace-nowrap",
              vacantOnly
                ? "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            Vacancies only
          </button>
        </div>
      </div>

      {/* Active member banner */}
      {activeMember && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <p className="text-sm">
            Showing <strong>{holdCounts.get(activeMember) ?? 0}</strong>{" "}
            calling{(holdCounts.get(activeMember) ?? 0) !== 1 ? "s" : ""} held by{" "}
            <strong>{activeMember}</strong>
          </p>
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setActiveMember(null)}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}

      {filtering && matchCount === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No callings match your filters</p>
        </div>
      ) : (
        // Masonry-style columns so every organization is visible at once on a
        // wide desktop screen — nothing is collapsed or hidden.
        <div className="gap-3 columns-1 md:columns-2 xl:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
          {orgs.map(({ org, groups }) => {
            const orgEntries = groups.flatMap((g) => g.entries);
            const orgVacant  = orgEntries.filter((e) => !e.member).length;
            const orgFilled  = orgEntries.length - orgVacant;

            // Sub-groups with at least one row left after filtering.
            const visibleGroups = groups
              .map((g) => ({ ...g, shown: g.entries.filter(passesFilter) }))
              .filter((g) => g.shown.length > 0);
            if (filtering && visibleGroups.length === 0) return null;

            return (
              <div key={org} className="rounded-xl border border-border bg-card overflow-hidden inline-block w-full align-top">
                {/* Org header */}
                <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border-b border-border">
                  <span className="font-semibold flex-1 truncate">{org}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {orgFilled}/{orgEntries.length}
                  </span>
                  {orgVacant > 0 && (
                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200 text-[10px] h-5 px-2 shrink-0">
                      {orgVacant} vacant
                    </Badge>
                  )}
                </div>

                {/* Org body — always expanded */}
                <div className="px-2 py-2 space-y-2">
                  {visibleGroups.map((g, gi) => (
                    <div key={`${g.subOrg ?? "_"}-${gi}`}>
                      {g.subOrg && (
                        <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          {g.subOrg}
                        </p>
                      )}
                      {(filtering ? g.shown : g.entries).map((entry, ei) => (
                        <ChartRow
                          key={`${entry.position}-${entry.member ?? "vacant"}-${ei}`}
                          entry={entry}
                          org={org}
                          holdCount={entry.member ? holdCounts.get(entry.member) ?? 1 : 0}
                          isActiveMember={!!entry.member && entry.member === activeMember}
                          isHighlighted={isHighlighted(entry)}
                          needsRelease={!!entry.member && needsReleaseSet.has(releaseKey(org, entry.position, entry.member))}
                          onMemberClick={(m) => setActiveMember((cur) => (cur === m ? null : m))}
                          onAction={onAction}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Settings View (edit the chart's callings) ─────────────────────────────────
// Lets the bishopric curate the standing roster that drives the Chart: rename a
// calling, add or remove positions, and hide callings they don't want cluttering
// the chart. Edits persist to the same roster groups the Chart reads.

interface SettingsEntryRowProps {
  entry: RosterEntry;
  disabled: boolean;
  onRename: (position: string) => void;
  onToggleHidden: () => void;
  onRemove: () => void;
}

function SettingsEntryRow({ entry, disabled, onRename, onToggleHidden, onRemove }: SettingsEntryRowProps) {
  const [name, setName] = useState(entry.position);

  const commit = () => {
    const v = name.trim();
    if (!v) { setName(entry.position); return; }   // never allow an empty name
    if (v !== entry.position) onRename(v);
  };

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg", entry.hidden && "opacity-50")}>
      <Input
        value={name}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { setName(entry.position); (e.target as HTMLInputElement).blur(); }
        }}
        className="h-8 text-sm flex-1"
      />
      {entry.member && (
        <span className="text-[11px] text-muted-foreground truncate max-w-[7rem] hidden sm:block" title={entry.member}>
          {entry.member}
        </span>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onToggleHidden}
        title={entry.hidden ? "Hidden from the chart — click to show" : "Shown on the chart — click to hide"}
        aria-label={entry.hidden ? "Show on chart" : "Hide from chart"}
        className={cn(
          "shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors",
          "hover:bg-muted disabled:opacity-40",
          entry.hidden ? "text-muted-foreground/60" : "text-foreground"
        )}
      >
        {entry.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        title="Remove this calling"
        aria-label="Remove calling"
        className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground/60 hover:bg-muted hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-40"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

interface SettingsGroupCardProps {
  group: RosterGroup;
  onUpdate: (id: string, patch: Partial<RosterGroup>) => void;
  onRemove: (group: RosterGroup) => void;
}

function SettingsGroupCard({ group, onUpdate, onRemove }: SettingsGroupCardProps) {
  const canEdit   = !!group.id;
  const hiddenCt  = group.entries.filter((e) => e.hidden).length;
  const setEntries = (entries: RosterEntry[]) => { if (group.id) onUpdate(group.id, { entries }); };

  // Editable org / sub-org names (committed on blur).
  const [orgName, setOrgName]       = useState(group.org);
  const [subOrgName, setSubOrgName] = useState(group.subOrg ?? "");

  const commitOrg = () => {
    const v = orgName.trim();
    if (!v) { setOrgName(group.org); return; }     // never allow an empty org name
    if (group.id && v !== group.org) onUpdate(group.id, { org: v });
  };
  const commitSubOrg = () => {
    const v = subOrgName.trim();
    if (group.id && v !== (group.subOrg ?? "")) onUpdate(group.id, { subOrg: v || undefined });
  };

  const renameEntry = (i: number, position: string) =>
    setEntries(group.entries.map((e, idx) => (idx === i ? { ...e, position } : e)));
  const toggleHidden = (i: number) =>
    setEntries(group.entries.map((e, idx) => (idx === i ? { ...e, hidden: !e.hidden } : e)));
  const removeEntry = (i: number) =>
    setEntries(group.entries.filter((_, idx) => idx !== i));
  const addEntry = () =>
    setEntries([...group.entries, { position: "New calling", custom: true }]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden inline-block w-full align-top">
      <div className="flex items-start gap-2 px-3 py-3 bg-muted/40 border-b border-border">
        <div className="min-w-0 flex-1 space-y-1">
          <Input
            value={orgName}
            disabled={!canEdit}
            onChange={(e) => setOrgName(e.target.value)}
            onBlur={commitOrg}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === "Escape") { setOrgName(group.org); (e.target as HTMLInputElement).blur(); }
            }}
            placeholder="Organization name"
            className="h-8 text-sm font-semibold"
          />
          <Input
            value={subOrgName}
            disabled={!canEdit}
            onChange={(e) => setSubOrgName(e.target.value)}
            onBlur={commitSubOrg}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === "Escape") { setSubOrgName(group.subOrg ?? ""); (e.target as HTMLInputElement).blur(); }
            }}
            placeholder="Sub-section (optional)"
            className="h-7 text-[11px] text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hiddenCt > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">{hiddenCt} hidden</span>
          )}
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onRemove(group)}
            title="Delete this organization"
            aria-label="Delete this organization"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground/60 hover:bg-muted hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="p-1.5 space-y-0.5">
        {group.entries.map((entry, i) => (
          <SettingsEntryRow
            key={`${i}-${entry.position}`}
            entry={entry}
            disabled={!canEdit}
            onRename={(p) => renameEntry(i, p)}
            onToggleHidden={() => toggleHidden(i)}
            onRemove={() => removeEntry(i)}
          />
        ))}
        <button
          type="button"
          disabled={!canEdit}
          onClick={addEntry}
          className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add calling
        </button>
      </div>
    </div>
  );
}

interface SettingsViewProps {
  roster: RosterGroup[];
  onCreateGroup: (group: Omit<RosterGroup, "id">) => void;
  onUpdateGroup: (id: string, patch: Partial<RosterGroup>) => void;
  onRemoveGroup: (group: RosterGroup) => void;
}

function SettingsView({ roster, onCreateGroup, onUpdateGroup, onRemoveGroup }: SettingsViewProps) {
  const hiddenTotal = useMemo(
    () => roster.reduce((n, g) => n + g.entries.filter((e) => e.hidden).length, 0),
    [roster],
  );

  const [newOrg, setNewOrg]       = useState("");
  const [newSubOrg, setNewSubOrg] = useState("");

  const addOrg = () => {
    const org = newOrg.trim();
    if (!org) return;
    onCreateGroup({ org, subOrg: newSubOrg.trim() || undefined, entries: [] });
    setNewOrg("");
    setNewSubOrg("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        Edit the standing list of organizations and callings that drives the{" "}
        <strong className="text-foreground">Chart</strong> and the{" "}
        <strong className="text-foreground">New Calling</strong> dropdowns.
        Add or rename an organization, rename a calling, add or remove positions, or hide
        callings you don&apos;t want on the chart. Hidden callings stay in your records but
        won&apos;t appear there.
        {hiddenTotal > 0 && (
          <span className="block mt-1 text-foreground/80">
            {hiddenTotal} calling{hiddenTotal !== 1 ? "s" : ""} currently hidden from the chart.
          </span>
        )}
      </div>

      {/* Add a new organization */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Add an organization</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="newOrgName">Organization *</Label>
            <Input
              id="newOrgName"
              value={newOrg}
              onChange={(e) => setNewOrg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOrg(); } }}
              placeholder="e.g. Primary"
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="newSubOrgName">Sub-section (optional)</Label>
            <Input
              id="newSubOrgName"
              value={newSubOrg}
              onChange={(e) => setNewSubOrg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOrg(); } }}
              placeholder="e.g. Presidency"
            />
          </div>
          <Button type="button" onClick={addOrg} disabled={!newOrg.trim()} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div className="gap-3 columns-1 md:columns-2 xl:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid">
        {roster.map((group) => (
          <SettingsGroupCard
            key={group.id ?? `${group.org}-${group.subOrg ?? ""}`}
            group={group}
            onUpdate={onUpdateGroup}
            onRemove={onRemoveGroup}
          />
        ))}
      </div>
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

type PageView = "pipeline" | "chart" | "complete" | "settings";

const EMPTY_FORM = {
  // "vacant"  → an open position to fill (optionally with a candidate in mind)
  // "member"  → a member who needs a calling (no position assigned yet)
  kind: "vacant" as "vacant" | "member",
  memberName: "",
  position: "",
  organization: "",
  notes: "",
};

export default function CallingsPage() {
  const { user } = useAuth();
  const callingsCollection = useData().callings;
  const { roster, createRosterGroup, updateRosterGroup, removeRosterGroup } = useData();
  // Items come from the DB already valid; normalizeStage is a cheap defensive
  // map to coerce any legacy stage values to the current enum.
  const callings = useMemo(
    () => callingsCollection.items.map((c) => ({ ...c, stage: normalizeStage(c.stage as string) })),
    [callingsCollection.items]
  );
  const [selected, setSelected] = useState<Calling | null>(null);
  const [newOpen,  setNewOpen]  = useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [view,     setView]     = useState<PageView>("pipeline");
  const [confirmDelete, setConfirmDelete] = useState<Calling | null>(null);
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState<RosterGroup | null>(null);

  // ── Org / calling options for the New Calling dropdowns ─────────────────────
  // Sourced from the standing roster (managed under Settings). Org first, then
  // the callings within the chosen org.
  const orgOptions = useMemo(() => {
    const seen = new Set<string>();
    const orgs: string[] = [];
    for (const g of roster) {
      if (g.org && !seen.has(g.org)) { seen.add(g.org); orgs.push(g.org); }
    }
    return orgs;
  }, [roster]);

  const positionsByOrg = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of roster) {
      if (!g.org) continue;
      const list = map.get(g.org) ?? [];
      for (const e of g.entries) {
        if (e.hidden) continue;
        if (!list.includes(e.position)) list.push(e.position);
      }
      map.set(g.org, list);
    }
    return map;
  }, [roster]);

  const positionOptions = form.organization ? positionsByOrg.get(form.organization) ?? [] : [];

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleAdvance(updates: Partial<Calling> & { stage: CallingStage }) {
    if (!selected) return;
    const now = new Date().toISOString();
    void callingsCollection.update(selected.id, { ...updates, updatedAt: now });
    setSelected(null);
  }

  function handleMove(callingId: string, toStage: CallingStage) {
    const now = new Date().toISOString();
    void callingsCollection.update(callingId, { stage: toStage, updatedAt: now });
  }

  function handleDelete(id: string) {
    void callingsCollection.remove(id);
    if (selected?.id === id) setSelected(null);
    setConfirmDelete(null);
  }

  function handleDeleteOrg(group: RosterGroup) {
    if (group.id) void removeRosterGroup(group.id);
    setConfirmDeleteOrg(null);
  }

  async function handleCreate() {
    const isMember = form.kind === "member";
    if (isMember ? !form.memberName.trim() : !form.position.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 200));
    const now = new Date().toISOString();
    const base = {
      id:           newId(),
      memberId:     "",
      organization: form.organization.trim(),
      notes:        form.notes.trim(),
      createdBy:    user?.uid ?? "mock",
      createdAt:    now,
      updatedAt:    now,
    };
    const newCalling: Calling = isMember
      ? {
          // A member who needs a calling — position is assigned later.
          ...base,
          memberName: form.memberName.trim(),
          position:   "",
          stage:      "needs_calling",
        }
      : {
          // An open position. A named candidate seeds the suggestion list; the
          // bishopric then chooses them and assigns a counselor to extend.
          ...base,
          memberName: "",
          position:   form.position.trim(),
          stage:      "vacant",
          suggestedReplacements: form.memberName.trim() ? [form.memberName.trim()] : [],
        };
    await callingsCollection.create(newCalling);
    setNewOpen(false);
    setForm(EMPTY_FORM);
    setSaving(false);
  }

  /** Bring a chart position into the pipeline — either to release its holder or to fill it. */
  function handleChartAction(action: "release" | "fill", entry: RosterEntry, org: string) {
    // Don't duplicate a position that's already moving through the pipeline.
    const existing = callings.find(
      (c) => c.stage !== "recorded" && c.position === entry.position && (c.organization ?? "") === org
    );
    if (existing) {
      setSelected(existing);
      // Filling drops you into the pipeline; marking a release stays on the chart.
      if (action === "fill") setView("pipeline");
      return;
    }
    const now = new Date().toISOString();
    const newCalling: Calling = {
      id:           newId(),
      memberName:   action === "release" ? entry.member ?? "" : "",
      memberId:     "",
      position:     entry.position,
      organization: org,
      notes:        "",
      stage:        action === "release" ? "needs_release" : "vacant",
      createdBy:    user?.uid ?? "mock",
      createdAt:    now,
      updatedAt:    now,
    };
    void callingsCollection.create(newCalling);
    // A release just gets flagged on the chart (orange "Needs release" badge);
    // filling a vacancy jumps to the pipeline to suggest a candidate.
    if (action === "fill") setView("pipeline");
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const pipelineCallings  = callings.filter((c) => c.stage !== "recorded");
  const completeCallings  = callings.filter((c) => c.stage === "recorded");
  const needsCallingCallings = callings.filter((c) => c.stage === "needs_calling");
  const vacantCallings    = callings.filter((c) => c.stage === "vacant");
  const attentionCallings = pipelineCallings.filter((c) => attentionMessage(c));

  const rosterVacancies = useMemo(
    () => roster.reduce((n, g) => n + g.entries.filter((e) => !e.member && !e.hidden).length, 0),
    [roster]
  );

  // Keys (org|position|member) for holders the bishopric has marked for release.
  // Used to flag those callings on the Chart.
  const needsReleaseSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of callings) {
      if (c.stage === "needs_release" && c.memberName) {
        set.add(releaseKey(c.organization ?? "", c.position, c.memberName));
      }
    }
    return set;
  }, [callings]);

  const TAB_CONFIG: { view: PageView; label: string; count?: number }[] = [
    { view: "pipeline", label: "Pipeline",                                    },
    { view: "chart",    label: "Chart",    count: rosterVacancies             },
    { view: "complete", label: "Complete", count: completeCallings.length     },
    { view: "settings", label: "Settings",                                    },
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
            {needsCallingCallings.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400"> · {needsCallingCallings.length} need a calling</span>
            )}
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

      {/* Attention banner (pipeline-related — hidden on the chart) */}
      {view !== "chart" && attentionCallings.length > 0 && (
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
          onDelete={setConfirmDelete}
        />
      )}

      {view === "chart" && (
        <ChartView roster={roster} needsReleaseSet={needsReleaseSet} onAction={handleChartAction} />
      )}

      {view === "complete" && (
        <CompleteView
          callings={completeCallings}
          onSelect={setSelected}
        />
      )}

      {view === "settings" && (
        <SettingsView
          roster={roster}
          onCreateGroup={createRosterGroup}
          onUpdateGroup={updateRosterGroup}
          onRemoveGroup={setConfirmDeleteOrg}
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
                  <p><span className="font-medium text-foreground">Position:</span> {selected.position || (selected.stage === "needs_calling" ? "Not assigned yet" : "—")}</p>
                  {selected.organization && <p><span className="font-medium text-foreground">Organization:</span> {selected.organization}</p>}
                  {selected.releasedName  && <p><span className="font-medium text-foreground">Replacing:</span> {selected.releasedName}</p>}
                  {selected.releasedBy    && <p><span className="font-medium text-foreground">Release handled by:</span> {selected.releasedBy}</p>}
                  {selected.replacementName && <p><span className="font-medium text-foreground">Replacement:</span> {selected.replacementName}</p>}
                  {selected.stage === "needs_release" && (selected.suggestedReplacements?.length ?? 0) > 0 && (
                    <p><span className="font-medium text-foreground">Suggested:</span> {selected.suggestedReplacements!.join(", ")}</p>
                  )}
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

                {/* Delete — removes the card from the pipeline entirely */}
                <div className="border-t pt-3">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(selected)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete this calling
                  </button>
                </div>
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
            {/* What are we adding? */}
            <div className="grid grid-cols-2 gap-2">
              {([
                ["vacant", "Vacant position", "An open position to fill"],
                ["member", "Member needs a calling", "A person to find a calling for"],
              ] as [typeof form.kind, string, string][]).map(([kind, title, desc]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kind }))}
                  className={cn(
                    "text-left rounded-lg border p-3 transition-colors",
                    form.kind === kind
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/30"
                  )}
                >
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </button>
              ))}
            </div>

            {form.kind === "member" ? (
              <div className="space-y-1.5">
                <Label htmlFor="newMemberName">Member Name *</Label>
                <Input
                  id="newMemberName"
                  value={form.memberName}
                  onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))}
                  placeholder="Full name"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  You&apos;ll choose which calling to extend later, once they&apos;re in the pipeline.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="newCandidate">Candidate in mind (optional)</Label>
                <Input
                  id="newCandidate"
                  value={form.memberName}
                  onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))}
                  placeholder="Seeds the suggestion list"
                />
              </div>
            )}

            {/* Organization → Calling dropdowns. Org first, then the callings in
                that org. Sourced from the roster managed under Settings. */}
            <div className="space-y-1.5">
              <Label htmlFor="newOrg">Organization{form.kind === "vacant" ? " *" : ""}</Label>
              {orgOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border p-3">
                  No organizations yet. Add one under the <strong className="text-foreground">Settings</strong> tab first.
                </p>
              ) : (
                <Select
                  value={form.organization || undefined}
                  onValueChange={(org) =>
                    // Changing the org clears the chosen calling (it may not exist there).
                    setForm((f) => ({ ...f, organization: org, position: "" }))
                  }
                >
                  <SelectTrigger id="newOrg">
                    <SelectValue placeholder="Select an organization…" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgOptions.map((org) => (
                      <SelectItem key={org} value={org}>{org}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {form.kind === "vacant" && (
              <div className="space-y-1.5">
                <Label htmlFor="newPosition">Calling *</Label>
                <Select
                  value={form.position || undefined}
                  onValueChange={(position) => setForm((f) => ({ ...f, position }))}
                  disabled={!form.organization || positionOptions.length === 0}
                >
                  <SelectTrigger id="newPosition">
                    <SelectValue
                      placeholder={
                        !form.organization
                          ? "Choose an organization first…"
                          : positionOptions.length === 0
                            ? "No callings in this organization yet"
                            : "Select a calling…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {positionOptions.map((pos) => (
                      <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.organization && positionOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Add callings to this organization under the <strong>Settings</strong> tab.
                  </p>
                )}
              </div>
            )}

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
              disabled={saving || (form.kind === "member" ? !form.memberName.trim() : !form.position.trim())}
            >
              {saving ? "Creating…" : "Create Calling"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this calling?</DialogTitle>
          </DialogHeader>
          {confirmDelete && (
            <p className="text-sm text-muted-foreground">
              This permanently removes the <strong className="text-foreground">{confirmDelete.position}</strong> card
              {confirmDelete.memberName ? <> for <strong className="text-foreground">{confirmDelete.memberName}</strong></> : null}
              {" "}from the pipeline. This can&apos;t be undone, and any tasks already created stay as they are.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDelete && handleDelete(confirmDelete.id)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete organization confirmation ── */}
      <Dialog open={!!confirmDeleteOrg} onOpenChange={(open) => !open && setConfirmDeleteOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this organization?</DialogTitle>
          </DialogHeader>
          {confirmDeleteOrg && (
            <p className="text-sm text-muted-foreground">
              This permanently removes <strong className="text-foreground">{confirmDeleteOrg.org}</strong>
              {confirmDeleteOrg.subOrg ? <> ({confirmDeleteOrg.subOrg})</> : null}
              {" "}and its {confirmDeleteOrg.entries.length} calling{confirmDeleteOrg.entries.length !== 1 ? "s" : ""}{" "}
              from the roster, the Chart, and the New Calling dropdowns. This can&apos;t be undone.
              Callings already in the pipeline stay as they are.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteOrg(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteOrg && handleDeleteOrg(confirmDeleteOrg)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
