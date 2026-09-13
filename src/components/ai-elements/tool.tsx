"use client";

import { useState } from "react";
import {
  ChevronRight,
  Loader2,
  Check,
  AlertCircle,
  Wrench,
  Mail,
  Send,
  X,
} from "lucide-react";
import { getToolName, type ToolUIPart, type DynamicToolUIPart } from "ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type AnyToolPart = ToolUIPart | DynamicToolUIPart;

/** A user's decision on a tool that's waiting for review (e.g. sending email). */
export type ApprovalDecision = (opts: {
  id: string;
  approved: boolean;
  reason?: string;
}) => void;

/** Friendly labels for the agent's tools, keyed by tool name. */
const TOOL_LABELS: Record<string, string> = {
  getMembers: "Looking up members",
  getTasks: "Reading tasks",
  createTask: "Creating a task",
  updateTaskStatus: "Updating a task",
  getCallings: "Reading callings",
  createCalling: "Creating a calling",
  updateCalling: "Updating a calling",
  advanceCalling: "Advancing a calling",
  deleteCalling: "Removing a calling",
  getRoster: "Reading the org chart",
  importRoster: "Importing the org chart",
  getInterviews: "Reading interviews",
  getInterviewers: "Checking who can interview",
  createInterview: "Adding an interview to schedule",
  scheduleInterview: "Scheduling the interview",
  updateInterview: "Updating an interview",
  advanceInterview: "Advancing an interview",
  deleteInterview: "Removing an interview",
  getSacramentBulletin: "Reading the bulletin",
  updateSacramentBulletin: "Updating the bulletin",
  getAnnouncements: "Reading announcements",
  createAnnouncement: "Adding an announcement",
  updateAnnouncement: "Updating an announcement",
  getMeetingAgenda: "Reading the agenda",
  addAgendaItems: "Adding agenda items",
  recordSolicitationReply: "Recording a reply",
  sendTaskReminder: "Sending a task reminder",
  emailInterviewTimes: "Emailing interview times",
  sendEmail: "Sending an email",
  searchInbox: "Searching the inbox",
  readEmail: "Reading an email",
  rememberPreference: "Saving a preference",
  getRememberedPreferences: "Recalling preferences",
  forgetPreference: "Forgetting a preference",
};

/** Tools whose approval prompt should render a full email preview. */
const EMAIL_TOOLS = new Set(["sendEmail", "sendTaskReminder", "emailInterviewTimes"]);

function statusOf(state: AnyToolPart["state"]) {
  switch (state) {
    case "output-available":
      return { icon: <Check className="h-3 w-3 text-green-600" />, label: "Done" };
    case "output-error":
      return { icon: <AlertCircle className="h-3 w-3 text-destructive" />, label: "Error" };
    case "output-denied":
      return { icon: <X className="h-3 w-3 text-muted-foreground" />, label: "Declined" };
    case "approval-responded":
      return { icon: <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />, label: "Sending…" };
    default:
      return { icon: <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />, label: "Working…" };
  }
}

/**
 * Renders one of the assistant's tool calls — name, status, and (expandable)
 * input/output. Equivalent to Vercel AI Elements' <Tool>, vendored locally.
 *
 * When a tool needs approval before it runs (e.g. sending an email), it renders
 * a review panel instead: the drafted action is shown and the user can approve
 * it — which lets the tool run — or send feedback for the assistant to revise.
 */
export function Tool({
  part,
  onApproval,
}: {
  part: AnyToolPart;
  onApproval?: ApprovalDecision;
}) {
  const [open, setOpen] = useState(false);
  const name = getToolName(part);
  const label = TOOL_LABELS[name] ?? name;
  const { icon, label: statusLabel } = statusOf(part.state);
  const errorText = part.state === "output-error" ? part.errorText : undefined;

  // A tool waiting for the user's approval gets a dedicated, always-open panel.
  if (part.state === "approval-requested" && onApproval) {
    return (
      <ApprovalPanel
        toolName={name}
        label={label}
        input={part.input}
        approvalId={part.approval.id}
        onApproval={onApproval}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/60 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="font-medium">{label}</span>
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          {icon} {statusLabel}
        </span>
        <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-2.5 py-2">
          {part.input != null && (
            <ToolBlock title="Input" value={part.input} />
          )}
          {part.state === "output-available" && part.output != null && (
            <ToolBlock title="Result" value={part.output} />
          )}
          {part.state === "output-denied" && (
            <p className="text-muted-foreground">You declined this — nothing was sent.</p>
          )}
          {errorText && <p className="text-destructive">{errorText}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * The review card shown while a sensitive tool (currently: sending email) waits
 * for the user. Shows what will happen, then Approve (run it) or send feedback
 * (decline with a note the assistant uses to revise and try again).
 */
function ApprovalPanel({
  toolName,
  label,
  input,
  approvalId,
  onApproval,
}: {
  toolName: string;
  label: string;
  input: unknown;
  approvalId: string;
  onApproval: ApprovalDecision;
}) {
  const [decided, setDecided] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const isEmail = EMAIL_TOOLS.has(toolName);

  const approve = () => {
    setDecided(true);
    onApproval({ id: approvalId, approved: true });
  };

  const sendFeedback = () => {
    const reason = feedback.trim();
    if (!reason) return;
    setDecided(true);
    onApproval({ id: approvalId, approved: false, reason });
  };

  const decline = () => {
    setDecided(true);
    onApproval({ id: approvalId, approved: false, reason: "The user declined to send this." });
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 text-xs">
      <div className="flex items-center gap-2 border-b border-amber-500/30 px-2.5 py-1.5">
        {isEmail ? (
          <Mail className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        ) : (
          <Wrench className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        )}
        <span className="font-medium">{label}</span>
        <span className="ml-auto font-medium text-amber-700 dark:text-amber-500">
          Needs your review
        </span>
      </div>

      <div className="space-y-2 px-2.5 py-2">
        {isEmail ? (
          <EmailPreview input={input} />
        ) : (
          <ToolBlock title="Details" value={input} />
        )}

        {decided ? (
          <p className="text-muted-foreground">Thanks — the assistant is continuing…</p>
        ) : (
          <div className="space-y-2">
            {showFeedback ? (
              <div className="space-y-2">
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={
                    isEmail
                      ? "What should change? e.g. make it warmer, fix the date…"
                      : "What should the assistant change?"
                  }
                  className="min-h-[60px] resize-none text-xs"
                  rows={2}
                  autoFocus
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={sendFeedback}
                    disabled={!feedback.trim()}
                  >
                    <Send className="h-3 w-3" /> Send feedback
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setShowFeedback(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={approve}
                >
                  <Send className="h-3 w-3" /> {isEmail ? "Allow & send" : "Allow"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setShowFeedback(true)}
                >
                  Provide feedback
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs text-muted-foreground"
                  onClick={decline}
                >
                  <X className="h-3 w-3" /> Don&apos;t send
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Renders an outbound email draft (to / subject / body) for review. */
function EmailPreview({ input }: { input: unknown }) {
  const email = (input ?? {}) as {
    to?: string;
    subject?: string;
    body?: string;
    note?: string;
    proposedTimes?: string[];
  };
  const rows: { label: string; value: string }[] = [];
  if (email.to) rows.push({ label: "To", value: email.to });
  if (email.subject) rows.push({ label: "Subject", value: email.subject });

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="space-y-0.5">
          {rows.map((r) => (
            <div key={r.label} className="flex gap-2">
              <span className="w-14 shrink-0 font-medium text-muted-foreground">{r.label}</span>
              <span className="break-words">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {email.proposedTimes && email.proposedTimes.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-muted-foreground">Proposed times</p>
          <ul className="list-inside list-disc space-y-0.5">
            {email.proposedTimes.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {(email.body || email.note) && (
        <div>
          <p className="mb-1 font-medium text-muted-foreground">Message</p>
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-background/70 p-2 leading-relaxed">
            {email.body ?? email.note}
          </div>
        </div>
      )}
      {rows.length === 0 && !email.body && !email.note && !email.proposedTimes && (
        <ToolBlock title="Details" value={input} />
      )}
    </div>
  );
}

function ToolBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 font-medium text-muted-foreground">{title}</p>
      <pre className="overflow-x-auto rounded bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
