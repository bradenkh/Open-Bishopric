"use client";

import { useState } from "react";
import { ChevronRight, Loader2, Check, AlertCircle, Wrench } from "lucide-react";
import { getToolName, type ToolUIPart, type DynamicToolUIPart } from "ai";
import { cn } from "@/lib/utils";

type AnyToolPart = ToolUIPart | DynamicToolUIPart;

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
  findInterviewSlots: "Finding open interview slots",
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
  rememberPreference: "Saving a preference",
  getRememberedPreferences: "Recalling preferences",
  forgetPreference: "Forgetting a preference",
};

function statusOf(state: AnyToolPart["state"]) {
  switch (state) {
    case "output-available":
      return { icon: <Check className="h-3 w-3 text-green-600" />, label: "Done" };
    case "output-error":
      return { icon: <AlertCircle className="h-3 w-3 text-destructive" />, label: "Error" };
    default:
      return { icon: <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />, label: "Working…" };
  }
}

/**
 * Renders one of the assistant's tool calls — name, status, and (expandable)
 * input/output. Equivalent to Vercel AI Elements' <Tool>, vendored locally.
 */
export function Tool({ part }: { part: AnyToolPart }) {
  const [open, setOpen] = useState(false);
  const name = getToolName(part);
  const label = TOOL_LABELS[name] ?? name;
  const { icon, label: statusLabel } = statusOf(part.state);
  const errorText = part.state === "output-error" ? part.errorText : undefined;

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
          {errorText && <p className="text-destructive">{errorText}</p>}
        </div>
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
