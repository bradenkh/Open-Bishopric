"use client";

import { useMemo, useState } from "react";
import { Mail, Copy, Check, Clock, MessageSquare } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useData, newId } from "@/contexts/DataContext";
import { ORG_UPDATES_SECTION } from "@/lib/agenda-templates";
import type { AgendaItem, AgendaSolicitation, Meeting } from "@/types";

/**
 * Pre-meeting agenda collection. For each organization leader, shows the items
 * they reported last time (keep / dismiss) and a pre-composed message asking for
 * updates. Sending opens the leader's email (mailto) and records the request;
 * kept items are written onto this meeting's agenda so nothing is lost. Their
 * reply can be pasted back here and handed to the AI assistant to parse into
 * agenda items.
 *
 * Deferred (see plan): a real email provider would replace `mailto:`, and an
 * inbound webhook would record replies automatically instead of pasting them in.
 */
export function CollectItemsDialog({
  open, onOpenChange, meeting: meetingProp,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: Meeting;
}) {
  const { user } = useAuth();
  const { wardInfo, members, meetings, solicitations } = useData();

  // Resolve the live meeting so sequential agenda writes (one per leader) build
  // on each other rather than clobbering from a stale prop snapshot.
  const meeting = meetings.items.find((m) => m.id === meetingProp.id) ?? meetingProp;

  const leaders = wardInfo?.leadership ?? [];
  const orgSection = ORG_UPDATES_SECTION[meeting.type];

  // The most recent earlier meeting of the same type — the source of "last
  // meeting's items" each leader can keep or dismiss.
  const previous = useMemo(() => {
    return meetings.items
      .filter((m) => m.type === meeting.type && m.id !== meeting.id && m.date < meeting.date)
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  }, [meetings.items, meeting.type, meeting.id, meeting.date]);

  // Local edit state keyed by leader.
  const keyOf = (org: string, name: string) => `${org}::${name}`;
  const [keep, setKeep] = useState<Record<string, Set<string>>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  function leaderEmail(name: string): string | undefined {
    const m = members.find((mm) => `${mm.firstName} ${mm.lastName}`.toLowerCase() === name.toLowerCase());
    return m?.email;
  }

  function priorItemsFor(org: string, name: string): AgendaItem[] {
    if (!previous) return [];
    return previous.agenda.filter(
      (i) => i.source === org || (i.presenter && i.presenter.toLowerCase() === name.toLowerCase()),
    );
  }

  function keptIds(org: string, name: string, prior: AgendaItem[]): Set<string> {
    const k = keyOf(org, name);
    return keep[k] ?? new Set(prior.map((i) => i.id)); // default: keep all
  }

  function toggleKeep(org: string, name: string, prior: AgendaItem[], itemId: string) {
    const k = keyOf(org, name);
    setKeep((prev) => {
      const current = new Set(prev[k] ?? new Set(prior.map((i) => i.id)));
      if (current.has(itemId)) current.delete(itemId); else current.add(itemId);
      return { ...prev, [k]: current };
    });
  }

  function defaultMessage(name: string, prior: AgendaItem[], kept: Set<string>): string {
    const first = name.split(" ")[0];
    const lines = prior.filter((i) => kept.has(i.id)).map((i) => `• ${i.title}`).join("\n");
    return [
      `Hi ${first},`,
      "",
      `We're preparing the agenda for ${meeting.title} on ${formatDate(meeting.date)}.`,
      prior.length
        ? "Here are your items from last time — let me know which to keep, which to drop, and any new items to add:"
        : "Please send any items you'd like on the agenda:",
      "",
      lines || "(no items carried from last meeting)",
      "",
      "Reply with your updates and we'll add them to the agenda. Thank you!",
    ].join("\n");
  }

  function messageFor(org: string, name: string, prior: AgendaItem[], kept: Set<string>): string {
    const k = keyOf(org, name);
    return messages[k] ?? defaultMessage(name, prior, kept);
  }

  function solicitationFor(org: string, name: string): AgendaSolicitation | undefined {
    return solicitations.items.find((s) => s.meetingId === meeting.id && s.org === org && s.leaderName === name);
  }

  async function upsertSolicitation(
    org: string, name: string, patch: Partial<AgendaSolicitation>, kept: AgendaItem[], message: string,
  ) {
    const existing = solicitationFor(org, name);
    const now = new Date().toISOString();
    if (existing) {
      await solicitations.update(existing.id, { ...patch, message, carriedItems: kept, updatedAt: now });
    } else {
      await solicitations.create({
        id: newId(),
        meetingId: meeting.id,
        org,
        leaderName: name,
        leaderEmail: leaderEmail(name),
        status: "draft",
        carriedItems: kept,
        message,
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
        ...patch,
      });
    }
  }

  /** Append kept prior items onto this meeting's agenda (skipping duplicates). */
  async function applyKeptToAgenda(org: string, kept: AgendaItem[]) {
    if (!kept.length) return;
    const existingTitles = new Set(
      meeting.agenda.filter((a) => a.source === org).map((a) => a.title.toLowerCase()),
    );
    const additions: AgendaItem[] = kept
      .filter((i) => !existingTitles.has(i.title.toLowerCase()))
      .map((i) => ({
        id: newId(),
        title: i.title,
        presenter: i.presenter,
        durationMins: i.durationMins,
        notes: i.notes,
        section: orgSection ?? i.section,
        source: org,
      }));
    if (additions.length) {
      await meetings.update(meeting.id, { agenda: [...meeting.agenda, ...additions], updatedAt: new Date().toISOString() });
    }
  }

  async function sendRequest(org: string, name: string, prior: AgendaItem[]) {
    const kept = keptIds(org, name, prior);
    const keptItems = prior.filter((i) => kept.has(i.id));
    const message = messageFor(org, name, prior, kept);
    await upsertSolicitation(org, name, { status: "sent", sentAt: new Date().toISOString() }, keptItems, message);
    await applyKeptToAgenda(org, keptItems);

    const email = leaderEmail(name);
    const subject = encodeURIComponent(`Agenda items — ${meeting.title} (${formatDate(meeting.date)})`);
    const body = encodeURIComponent(message);
    window.location.assign(`mailto:${email ?? ""}?subject=${subject}&body=${body}`);
  }

  async function saveReply(org: string, name: string, prior: AgendaItem[]) {
    const k = keyOf(org, name);
    const reply = replies[k] ?? "";
    if (!reply.trim()) return;
    const kept = keptIds(org, name, prior);
    const keptItems = prior.filter((i) => kept.has(i.id));
    await upsertSolicitation(org, name, { status: "replied", replyText: reply }, keptItems, messageFor(org, name, prior, kept));
  }

  async function copyMessage(org: string, name: string, prior: AgendaItem[]) {
    const message = messageFor(org, name, prior, keptIds(org, name, prior));
    try {
      await navigator.clipboard.writeText(message);
      setCopied(keyOf(org, name));
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Collect agenda items — {meeting.title}</DialogTitle>
        </DialogHeader>

        {leaders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Add organization leaders in Ward settings to send agenda requests.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Send each leader their items from {previous ? `the ${formatDate(previous.date)} meeting` : "last meeting"} to keep
              or dismiss, plus a request for new items. Paste their reply below and the assistant can add the items to the agenda.
            </p>

            {leaders.map((leader) => {
              const org = leader.role;
              const name = leader.name;
              const k = keyOf(org, name);
              const prior = priorItemsFor(org, name);
              const kept = keptIds(org, name, prior);
              const sol = solicitationFor(org, name);
              const email = leaderEmail(name);

              return (
                <div key={k} className="rounded-xl border border-border bg-card p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {org}{email ? ` · ${email}` : " · no email on file"}
                      </p>
                    </div>
                    {sol && (
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0",
                        sol.status === "replied"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : sol.status === "sent"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {sol.status}{sol.sentAt ? ` · ${formatDate(sol.sentAt.slice(0, 10))}` : ""}
                      </span>
                    )}
                  </div>

                  {prior.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Items from last meeting</p>
                      <ul className="space-y-1">
                        {prior.map((item) => {
                          const isKept = kept.has(item.id);
                          return (
                            <li key={item.id} className="flex items-center gap-2 text-sm">
                              <button
                                onClick={() => toggleKeep(org, name, prior, item.id)}
                                className="shrink-0"
                                title={isKept ? "Keep" : "Dismissed"}
                              >
                                {isKept
                                  ? <Check className="h-4 w-4 text-green-600" />
                                  : <span className="block h-4 w-4 rounded border border-muted-foreground/40" />}
                              </button>
                              <span className={cn(!isKept && "line-through text-muted-foreground")}>{item.title}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <Textarea
                    rows={5}
                    value={messageFor(org, name, prior, kept)}
                    onChange={(e) => setMessages((prev) => ({ ...prev, [k]: e.target.value }))}
                  />

                  <div className="flex items-center gap-2">
                    <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => sendRequest(org, name, prior)}>
                      <Mail className="h-3.5 w-3.5" /> Send request
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => copyMessage(org, name, prior)}>
                      {copied === k ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === k ? "Copied" : "Copy"}
                    </Button>
                  </div>

                  {/* Reply intake — paste the leader's response, then ask the assistant to add the items. */}
                  <div className="space-y-1.5 border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" /> Their reply
                    </p>
                    <Textarea
                      rows={2}
                      placeholder="Paste the leader's reply here, then ask the assistant to add the items…"
                      value={replies[k] ?? sol?.replyText ?? ""}
                      onChange={(e) => setReplies((prev) => ({ ...prev, [k]: e.target.value }))}
                    />
                    <Button
                      variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                      disabled={!(replies[k] ?? "").trim()}
                      onClick={() => saveReply(org, name, prior)}
                    >
                      <Clock className="h-3.5 w-3.5" /> Save reply
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
