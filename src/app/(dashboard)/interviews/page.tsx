"use client";

import { useState, useEffect, useMemo } from "react";
import {
  RotateCcw, Loader2, Trash2, Mail, Send, Search, Download, User, CalendarClock, Check,
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
  SettlementRecord, SettlementStatus, DeclaredTithingStatus,
  Member, CalendarBooking,
} from "@/types";
import {
  INTERVIEW_TYPE_LABELS, SETTLEMENT_STATUS_LABELS, DECLARED_STATUS_LABELS,
} from "@/types";
import { formatDate, cn } from "@/lib/utils";
import { APP_TIME_ZONE, toDateStr, fromMinutes, nowInAppTz } from "@/lib/availability";
import { toZonedTime } from "date-fns-tz";
import {
  DEFAULT_SETTLEMENT_EMAIL, renderSettlementEmail, settlementTitle, withDefaults,
  type SettlementEmailTemplate,
} from "@/lib/settlement-email";
import { bookingLinkFor } from "@/lib/booking-pages";
import {
  householdKey, headOfHousehold, householdMembersOf, householdParents, householdLabel,
} from "@/lib/household";

// ── Shared helpers ─────────────────────────────────────────────────────────────

const TODAY = toDateStr(nowInAppTz());
const SETTLEMENT_YEAR = nowInAppTz().getFullYear();

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

/** "16:30" → "4:30 PM". */
function formatTime(time?: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

/** Short relative time, e.g. "3d ago". */
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

// ── Bookings (ingested from the bishop's Google Calendar) ──────────────────────

/** An ingested booking's ward-local date + time, from its absolute start. */
function bookingWhen(iso: string): { date: string; time: string } {
  const z = toZonedTime(new Date(iso), APP_TIME_ZONE);
  return { date: toDateStr(z), time: fromMinutes(z.getHours() * 60 + z.getMinutes()) };
}

function bookingTypeLabel(b: CalendarBooking): string {
  return b.interviewType ? INTERVIEW_TYPE_LABELS[b.interviewType] : "Appointment";
}

interface BookingsViewProps {
  bookings: CalendarBooking[];
  members: Member[];
  onLink: (bookingId: string, memberId: string | null) => void;
  onSync: () => void;
  syncing: boolean;
  syncedAt?: string | null;
}

/** One booking row: when, what, and who it's linked to (or a picker to link). */
function BookingRow({
  booking, members, onLink,
}: { booking: CalendarBooking; members: Member[]; onLink: BookingsViewProps["onLink"] }) {
  const { date, time } = bookingWhen(booking.startAt);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="shrink-0 text-center w-14">
        <div className="text-xs text-muted-foreground">{formatDate(date)}</div>
        <div className="text-sm font-medium tabular-nums">{formatTime(time)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">{bookingTypeLabel(booking)}</Badge>
          {booking.matchMethod && (
            <span className="text-[10px] text-muted-foreground">
              {booking.matchMethod === "manual" ? "linked by hand" : `matched by ${booking.matchMethod}`}
            </span>
          )}
        </div>
        <p className="text-sm truncate mt-0.5">{booking.summary ?? "(no title)"}</p>
        {booking.attendeeEmails?.length ? (
          <p className="text-xs text-muted-foreground truncate">{booking.attendeeEmails.join(", ")}</p>
        ) : null}
      </div>
      <div className="shrink-0">
        {booking.memberId ? (
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{booking.memberName}</span>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
              title="Unlink from member" onClick={() => onLink(booking.id, null)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Select value="" onValueChange={(v) => onLink(booking.id, v)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Link to member…" />
            </SelectTrigger>
            <SelectContent>
              {members
                .filter((m) => m.isActive)
                .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.firstName} {m.lastName}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

/** A titled group of booking rows (module-scope so it isn't recreated in render). */
function BookingSection({
  title, rows, members, onLink, tone,
}: {
  title: string; rows: CalendarBooking[]; members: Member[];
  onLink: BookingsViewProps["onLink"]; tone?: string;
}) {
  return (
    <div className="space-y-2">
      <h3 className={cn("text-sm font-semibold flex items-center gap-2", tone)}>
        {title} <span className="text-xs font-normal text-muted-foreground tabular-nums">({rows.length})</span>
      </h3>
      {rows.length === 0
        ? <p className="text-xs text-muted-foreground italic">None.</p>
        : <div className="space-y-2">{rows.map((b) => <BookingRow key={b.id} booking={b} members={members} onLink={onLink} />)}</div>}
    </div>
  );
}

/**
 * Read-only tracking of appointments members self-booked on Google. Bookings are
 * ingested from the bishop's calendar subscription; those the matcher couldn't
 * place surface in a "Needs linking" queue for a reviewer to attach by hand.
 */
function BookingsView({ bookings, members, onLink, onSync, syncing, syncedAt }: BookingsViewProps) {
  const active = bookings.filter((b) => b.status !== "cancelled");
  const byStartAsc = (a: CalendarBooking, b: CalendarBooking) => a.startAt.localeCompare(b.startAt);
  const byStartDesc = (a: CalendarBooking, b: CalendarBooking) => b.startAt.localeCompare(a.startAt);
  // Split upcoming/past by ward-local date against TODAY (a module-load anchor),
  // avoiding an impure clock read during render.
  const isPast = (b: CalendarBooking) => bookingWhen(b.startAt).date < TODAY;

  const unmatched = active.filter((b) => !b.memberId).sort(byStartAsc);
  const upcoming = active.filter((b) => b.memberId && !isPast(b)).sort(byStartAsc);
  const past = active.filter((b) => b.memberId && isPast(b)).sort(byStartDesc);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" className="gap-1.5" onClick={onSync} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Sync now
        </Button>
        {syncedAt && (
          <span className="text-xs text-muted-foreground">Last synced {new Date(syncedAt).toLocaleString()}</span>
        )}
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No bookings yet. Set the calendar subscription in Settings → Calendar, then Sync. Appointments members
          book through Google&rsquo;s booking pages will appear here.
        </div>
      ) : (
        <>
          {unmatched.length > 0 && (
            <BookingSection title="Needs linking" rows={unmatched} members={members} onLink={onLink} tone="text-amber-600 dark:text-amber-400" />
          )}
          <BookingSection title="Upcoming" rows={upcoming} members={members} onLink={onLink} />
          <BookingSection title="Past" rows={past} members={members} onLink={onLink} />
        </>
      )}
    </div>
  );
}

// ── Tithing settlement ─────────────────────────────────────────────────────────

const SETTLEMENT_STATUS_COLORS: Record<SettlementStatus, string> = {
  not_started:  "bg-muted text-muted-foreground",
  link_created: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  link_opened:  "bg-amber-200 text-amber-900 dark:bg-amber-800/70 dark:text-amber-100",
  scheduled:    "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200",
  completed:    "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200",
  declined:     "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  exempt:       "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
};

// Statuses a reviewer sets by hand (booking state comes from the calendar feed).
const SETTLEMENT_STATUSES: SettlementStatus[] = [
  "not_started", "link_created", "scheduled", "completed", "declined", "exempt",
];
const DECLARED_STATUSES: DeclaredTithingStatus[] = ["full", "partial", "non", "exempt"];
const TERMINAL_STATUSES = new Set<SettlementStatus>(["completed", "exempt", "declined"]);

type SettlementSegment = "all" | "not_started" | "link" | "scheduled" | "done";

interface SettlementRowState {
  member: Member;
  name: string;
  householdId: string;
  householdMembers: Member[];
  parents: Member[];
  record?: SettlementRecord;
  /** The household's matched tithing-settlement booking, if any (⇒ scheduled). */
  booking?: CalendarBooking;
  status: SettlementStatus;
}

/** Build and download a CSV of every household's settlement status. */
function downloadSettlementCsv(rows: SettlementRowState[]) {
  const header = ["Household", "Parents", "Parent Emails", "Members", "Status", "Emailed", "Scheduled"];
  const lines = rows.map((r) => {
    const emailed = r.record?.linkSentAt ? r.record.linkSentAt.slice(0, 10) : "";
    const sched = r.booking ? (() => { const w = bookingWhen(r.booking!.startAt); return `${w.date} ${w.time}`; })() : "";
    const parents = r.parents.map((p) => `${p.firstName} ${p.lastName}`).join("; ");
    const parentEmails = r.parents.map((p) => p.email).filter(Boolean).join("; ");
    return [r.name, parents, parentEmails, String(r.householdMembers.length),
      SETTLEMENT_STATUS_LABELS[r.status], emailed, sched]
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

/** Progress ring: a green arc showing percent complete, big % in center. */
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

const BREAKDOWN: { key: SettlementStatus[]; label: string; bar: string; dot: string }[] = [
  { key: ["completed", "exempt"], label: "Done",         bar: "bg-green-500",  dot: "bg-green-500" },
  { key: ["scheduled"],           label: "Scheduled",    bar: "bg-blue-500",   dot: "bg-blue-500" },
  { key: ["link_created"],        label: "Invited",      bar: "bg-amber-300",  dot: "bg-amber-300" },
  { key: ["declined"],            label: "Declined",     bar: "bg-red-400",    dot: "bg-red-400" },
  { key: ["not_started"],         label: "Not started",  bar: "bg-muted-foreground/30", dot: "bg-muted-foreground/40" },
];

function BreakdownBar({ rows }: { rows: SettlementRowState[] }) {
  const total = rows.length || 1;
  const seg = BREAKDOWN.map((b) => ({ ...b, n: rows.filter((r) => b.key.includes(r.status)).length }));
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

interface SettlementViewProps {
  members: Member[];
  settlements: SettlementRecord[];
  /** Ingested Google bookings — a matched tithing-settlement one marks a household scheduled. */
  calendarBookings: CalendarBooking[];
  emailTemplate: SettlementEmailTemplate;
  /** The Google booking-page URL emailed to members (from Settings). */
  bookingUrl?: string;
  onEmail: (member: Member, tpl: SettlementEmailTemplate) => Promise<boolean>;
  onEmailSelected: (members: Member[], tpl: SettlementEmailTemplate) => Promise<number>;
  onSetStatus: (member: Member, record: SettlementRecord | undefined, status: SettlementStatus) => void;
  onSetDeclared: (member: Member, record: SettlementRecord | undefined, declared: DeclaredTithingStatus) => void;
}

function SettlementView({
  members, settlements, calendarBookings, emailTemplate, bookingUrl,
  onEmail, onEmailSelected, onSetStatus, onSetDeclared,
}: SettlementViewProps) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<SettlementSegment>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailedId, setEmailedId] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  // Compose dialog.
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeRecipients, setComposeRecipients] = useState<Member[]>([]);
  const [composeHouseholdId, setComposeHouseholdId] = useState<string | null>(null);
  const [composeHouseholdName, setComposeHouseholdName] = useState("");
  const [draftSubject, setDraftSubject] = useState(emailTemplate.subject);
  const [draftBody, setDraftBody] = useState(emailTemplate.body);
  const [composeSending, setComposeSending] = useState(false);

  // Settlement bookings, keyed by member id → the household's booking.
  const settlementBookingByMember = useMemo(() => {
    const map = new Map<string, CalendarBooking>();
    for (const b of calendarBookings) {
      if (b.status === "cancelled" || b.interviewType !== "tithing_settlement" || !b.memberId) continue;
      map.set(b.memberId, b);
    }
    return map;
  }, [calendarBookings]);

  const rows: SettlementRowState[] = useMemo(() => {
    const active = members.filter((m) => m.isActive);
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
      const record = settlements.find((s) => s.memberId === head.id && s.year === SETTLEMENT_YEAR);
      const booking = houseMembers.map((m) => settlementBookingByMember.get(m.id)).find(Boolean);
      // A hand-set terminal status wins; otherwise a matched booking marks it
      // scheduled; otherwise fall back to the record's status.
      const status: SettlementStatus =
        record && TERMINAL_STATUSES.has(record.status) ? record.status
        : booking ? "scheduled"
        : record?.status ?? "not_started";
      out.push({ member: head, name, householdId: key, householdMembers: houseMembers, parents, record, booking, status });
    }
    return out.sort((a, b) =>
      a.member.lastName.localeCompare(b.member.lastName) ||
      a.member.firstName.localeCompare(b.member.firstName));
  }, [members, settlements, settlementBookingByMember]);

  const total = rows.length;
  const hasLink = (r: SettlementRowState) => r.status === "link_created";
  const inSegment = (r: SettlementRowState, s: SettlementSegment) =>
    s === "all" ? true
    : s === "done" ? (r.status === "completed" || r.status === "exempt" || r.status === "declined")
    : s === "link" ? hasLink(r)
    : r.status === s;

  const count = (s: SettlementSegment) => rows.filter((r) => inSegment(r, s)).length;
  const completedN = rows.filter((r) => r.status === "completed" || r.status === "exempt").length;
  const linkedN = count("link");
  const remaining = rows.filter((r) => r.status === "not_started" || hasLink(r));
  const pct = total > 0 ? Math.round((completedN / total) * 100) : 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => inSegment(r, segment) && (!q || r.name.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, segment, query]);

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
  // A household worth emailing: still awaiting a booking, has an email, and a
  // booking page is configured to point them at.
  const emailable = (r: SettlementRowState) =>
    !!bookingUrl && recipientsOf(r).length > 0
    && r.status !== "scheduled" && !TERMINAL_STATUSES.has(r.status);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectableIds = filtered.filter(emailable).map((r) => r.member.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
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

  function openCompose(recipients: Member[], household?: { id: string; name: string }) {
    if (recipients.length === 0) return;
    setComposeRecipients(recipients);
    setComposeHouseholdId(household?.id ?? null);
    setComposeHouseholdName(household?.name ?? "");
    setDraftSubject(emailTemplate.subject);
    setDraftBody(emailTemplate.body);
    setEmailMsg(null);
    setComposeOpen(true);
  }

  function openComposeSelected() {
    const toSend = rows.filter((r) => selected.has(r.member.id) && emailable(r)).flatMap(recipientsOf);
    openCompose(toSend);
  }

  async function sendCompose() {
    const tpl: SettlementEmailTemplate = { subject: draftSubject, body: draftBody };
    const recipients = composeRecipients;
    const householdId = composeHouseholdId;
    const householdName = composeHouseholdName;
    setComposeSending(true);
    setEmailMsg(null);
    try {
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

  const previewRecipient = composeRecipients[0];
  const preview = previewRecipient
    ? renderSettlementEmail(
        { subject: draftSubject, body: draftBody },
        {
          name: previewRecipient.firstName,
          lastName: previewRecipient.lastName,
          title: settlementTitle(previewRecipient.gender),
          link: bookingUrl ?? "",
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
    { seg: "link",        label: "Invited" },
    { seg: "scheduled",   label: "Scheduled" },
    { seg: "done",        label: "Done" },
  ];

  return (
    <div className="space-y-4">
      {!bookingUrl && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          Set a <strong>Tithing Settlement</strong> booking page in Settings → Google booking pages to email members
          their booking link. Bookings members make there appear on the Bookings tab.
        </div>
      )}

      {/* Progress header */}
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
                <Button size="sm" className="gap-1.5" disabled={selectedCount === 0} onClick={openComposeSelected}>
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

        {linkedN > 0 && (
          <button
            type="button"
            onClick={() => setSegment("link")}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            <Send className="h-3.5 w-3.5 shrink-0" />
            <span><strong>{linkedN}</strong> {linkedN === 1 ? "household has" : "households have"} been invited but haven&apos;t booked yet — good time to follow up.</span>
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
                  active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {label}
                <span className={cn("rounded-full px-1.5 text-[10px] font-bold tabular-nums", active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative sm:w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search households…" className="h-9 pl-8 text-sm" />
        </div>
      </div>

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
          {filtered.map((r) => (
            <div key={r.member.id} className="flex flex-wrap items-center gap-3 p-3">
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
                  title={
                    !bookingUrl ? "Set a settlement booking page first"
                    : recipientsOf(r).length > 0 ? "Already booked or complete"
                    : "No email on file for the household"
                  }
                  aria-label={`${r.name} can't be emailed`}
                />
              )}
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 bg-primary/10 text-primary">
                {getInitials(r.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{r.name}</p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                  <User className="h-3 w-3 shrink-0" />
                  {r.parents.length ? r.parents.map((p) => p.firstName).join(" & ") : "No parents on file"}
                  {r.householdMembers.length > 1 ? ` · ${r.householdMembers.length} in household` : ""}
                </p>
                {r.booking && (() => {
                  const w = bookingWhen(r.booking.startAt);
                  return (
                    <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                      <CalendarClock className="h-3 w-3 shrink-0" />
                      {formatDate(w.date)} · {formatTime(w.time)}
                    </p>
                  );
                })()}
                {!r.booking && r.record?.declaredStatus && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    Declared: {DECLARED_STATUS_LABELS[r.record.declaredStatus]}
                  </p>
                )}
                {r.record?.linkSentAt && r.status !== "scheduled" && !TERMINAL_STATUSES.has(r.status) && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                    <Mail className="h-3 w-3 shrink-0" /> Emailed {timeAgo(r.record.linkSentAt)}
                  </p>
                )}
              </div>

              <Badge className={cn("text-[10px] shrink-0", SETTLEMENT_STATUS_COLORS[r.status])}>
                {SETTLEMENT_STATUS_LABELS[r.status]}
              </Badge>

              {/* Email the household their booking link — until they've booked. */}
              {r.status !== "scheduled" && !TERMINAL_STATUSES.has(r.status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 text-xs"
                  disabled={!emailable(r)}
                  title={
                    !bookingUrl ? "Set a settlement booking page first"
                    : recipientsOf(r).length > 0 ? "Email the household their booking link"
                    : "No email on file for anyone in the household"
                  }
                  onClick={() => openCompose(recipientsOf(r), { id: r.householdId, name: r.name })}
                >
                  {emailedId === r.member.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Mail className="h-3.5 w-3.5" />}
                  {emailedId === r.member.id ? "Sent" : "Email household"}
                </Button>
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

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={(open) => { if (!open) setComposeOpen(false); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {composeHouseholdId
                ? `Email ${composeHouseholdName} their settlement link`
                : composeRecipients.length === 1
                  ? `Email ${composeRecipients[0]?.firstName} their settlement link`
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
              <Input id="compose-subject" value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compose-body" className="text-xs">Message</Label>
              <Textarea id="compose-body" rows={9} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} />
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
            <Button variant="outline" onClick={() => setComposeOpen(false)} disabled={composeSending}>Cancel</Button>
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

// ── Page ───────────────────────────────────────────────────────────────────────

type PageView = "bookings" | "settlement";

export default function InterviewsPage() {
  const { user } = useAuth();
  const data = useData();
  const settlementsCol = data.settlements;
  const settlements  = settlementsCol.items;
  const calendarBookings = data.calendarBookings.items;
  const members      = data.members;

  const [view, setView] = useState<PageView>("bookings");

  // Saved settlement-email template (Settings → Email).
  const [emailTemplate, setEmailTemplate] = useState<SettlementEmailTemplate>(DEFAULT_SETTLEMENT_EMAIL);
  useEffect(() => {
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((d) => { if (d && !d.error) setEmailTemplate(withDefaults({ subject: d.settlementEmailSubject, body: d.settlementEmailBody })); })
      .catch(() => { /* keep default */ });
  }, []);

  // The Google booking-page URL for tithing settlement (Settings → Google booking pages).
  const [settlementBookingUrl, setSettlementBookingUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    fetch("/api/settings/calendar")
      .then((r) => r.json())
      .then((d) => { if (d && !d.error) setSettlementBookingUrl(bookingLinkFor("tithing_settlement", d.bookingPageUrls)); })
      .catch(() => { /* unconfigured */ });
  }, []);

  // ── Calendar-booking ingest (the Bookings tab) ───────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/calendar/sync")
      .then((r) => r.json())
      .then((d) => { if (d && !d.error) setSyncedAt(d.syncedAt ?? null); })
      .catch(() => { /* not configured yet */ });
  }, []);

  async function syncBookings() {
    setSyncing(true);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const d = await res.json().catch(() => null);
      if (d?.syncedAt) setSyncedAt(d.syncedAt);
      await data.reloadAll();
    } catch {
      /* surfaced on Settings → Calendar; keep the board quiet */
    } finally {
      setSyncing(false);
    }
  }

  async function linkBooking(bookingId: string, memberId: string | null) {
    try {
      await fetch(`/api/calendar/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      await data.reloadAll();
    } catch {
      /* leave the row as-is on failure */
    }
  }

  // ── Settlement handlers ──────────────────────────────────────────────────────
  const memberName = (m: Member) => `${m.firstName} ${m.lastName}`;
  const recordFor = (memberId: string) =>
    settlements.find((s) => s.memberId === memberId && s.year === SETTLEMENT_YEAR);

  /** Ensure a member's settlement record for the year, advancing a fresh one to
   *  `link_created`. Returns the record (existing or created). */
  async function ensureRecord(m: Member): Promise<SettlementRecord> {
    const now = new Date().toISOString();
    let record = recordFor(m.id);
    if (!record) {
      record = {
        id: newId(), memberId: m.id, memberName: memberName(m), year: SETTLEMENT_YEAR,
        status: "link_created", createdBy: user?.uid ?? "mock", createdAt: now, updatedAt: now,
      };
      await settlementsCol.create(record);
    } else if (record.status === "not_started") {
      await settlementsCol.update(record.id, { status: "link_created" });
      record = { ...record, status: "link_created" };
    }
    return record;
  }

  /**
   * Email one member the household's Google settlement booking link and stamp
   * their record. Falls back to a mailto: window when Gmail isn't configured or
   * the send fails. `silent` suppresses that fallback (for bulk sends).
   */
  async function sendLinkEmail(
    m: Member, record: SettlementRecord | undefined, tpl: SettlementEmailTemplate, opts?: { silent?: boolean },
  ): Promise<boolean> {
    if (!m.email || !settlementBookingUrl) return false;
    const { subject, body } = renderSettlementEmail(tpl, {
      name: m.firstName, lastName: m.lastName, title: settlementTitle(m.gender), link: settlementBookingUrl,
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
    } catch {
      /* network error — fall through to mailto */
    }
    if (!opts?.silent) {
      window.location.assign(`mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    }
    return false;
  }

  /** Ensure records for the whole household (so each shows on the board), then send. */
  async function emailLink(m: Member, tpl: SettlementEmailTemplate, opts?: { silent?: boolean }): Promise<boolean> {
    if (!m.email) return false;
    const pool = members.filter((x) => x.isActive);
    const house = householdMembersOf(m, pool);
    const records = new Map<string, SettlementRecord>();
    for (const person of house) records.set(person.id, await ensureRecord(person));
    return sendLinkEmail(m, records.get(m.id), tpl, opts);
  }

  async function emailSelected(ms: Member[], tpl: SettlementEmailTemplate): Promise<number> {
    let sent = 0;
    const ensured = new Set<string>();
    for (const m of ms) {
      if (!m.email) continue;
      const key = householdKey(m);
      if (!ensured.has(key)) {
        const pool = members.filter((x) => x.isActive);
        for (const person of householdMembersOf(m, pool)) await ensureRecord(person);
        ensured.add(key);
      }
      const ok = await sendLinkEmail(m, recordFor(m.id), tpl, { silent: true });
      if (ok) sent += 1;
      else if (sent === 0) {
        throw new Error("Email isn't set up yet. Add a Gmail address in Settings → Email, then try again.");
      }
    }
    return sent;
  }

  async function setSettlementStatus(m: Member, record: SettlementRecord | undefined, status: SettlementStatus) {
    const now = new Date().toISOString();
    if (record) await settlementsCol.update(record.id, { status });
    else await settlementsCol.create({
      id: newId(), memberId: m.id, memberName: memberName(m), year: SETTLEMENT_YEAR,
      status, createdBy: user?.uid ?? "mock", createdAt: now, updatedAt: now,
    });
  }

  async function setDeclared(m: Member, record: SettlementRecord | undefined, declared: DeclaredTithingStatus) {
    const now = new Date().toISOString();
    if (record) await settlementsCol.update(record.id, { declaredStatus: declared });
    else await settlementsCol.create({
      id: newId(), memberId: m.id, memberName: memberName(m), year: SETTLEMENT_YEAR,
      status: "completed", declaredStatus: declared, createdBy: user?.uid ?? "mock", createdAt: now, updatedAt: now,
    });
  }

  // ── Header counts ────────────────────────────────────────────────────────────
  const unmatchedBookings = calendarBookings.filter((b) => b.status !== "cancelled" && !b.memberId).length;
  const upcomingBookings = calendarBookings.filter(
    (b) => b.status !== "cancelled" && b.memberId && bookingWhen(b.startAt).date >= TODAY,
  ).length;

  // Households still needing a settlement booking (for the tab badge).
  const settlementRemaining = (() => {
    const active = members.filter((m) => m.isActive);
    const groups = new Map<string, Member[]>();
    for (const m of active) {
      const key = householdKey(m);
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }
    const bookedMemberIds = new Set(
      calendarBookings
        .filter((b) => b.status !== "cancelled" && b.interviewType === "tithing_settlement" && b.memberId)
        .map((b) => b.memberId!),
    );
    let remaining = 0;
    for (const [, houseMembers] of groups) {
      const head = headOfHousehold(houseMembers);
      const rec = settlements.find((s) => s.memberId === head.id && s.year === SETTLEMENT_YEAR);
      const booked = houseMembers.some((m) => bookedMemberIds.has(m.id));
      const terminal = rec && TERMINAL_STATUSES.has(rec.status);
      if (!booked && !terminal) remaining += 1;
    }
    return remaining;
  })();

  const TAB_CONFIG: { view: PageView; label: string; count?: number }[] = [
    { view: "bookings",   label: "Bookings",           count: unmatchedBookings },
    { view: "settlement", label: "Tithing Settlement", count: settlementRemaining },
  ];

  return (
    <div className="h-full p-4 lg:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scheduling</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {upcomingBookings} upcoming
            {unmatchedBookings > 0 && (
              <span className="text-amber-600 dark:text-amber-400"> · {unmatchedBookings} to link</span>
            )}
            {settlementRemaining > 0 && (
              <span> · {settlementRemaining} settlement{settlementRemaining === 1 ? "" : "s"} to go</span>
            )}
          </p>
        </div>
      </div>

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
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {count != null && count > 0 && (
              <span className={cn(
                "text-[10px] font-bold px-1.5 rounded-full tabular-nums",
                view === v ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === "bookings" && (
        <BookingsView
          bookings={calendarBookings}
          members={members}
          onLink={(id, memberId) => { void linkBooking(id, memberId); }}
          onSync={() => { void syncBookings(); }}
          syncing={syncing}
          syncedAt={syncedAt}
        />
      )}

      {view === "settlement" && (
        <SettlementView
          members={members}
          settlements={settlements}
          calendarBookings={calendarBookings}
          emailTemplate={emailTemplate}
          bookingUrl={settlementBookingUrl}
          onEmail={(m, tpl) => emailLink(m, tpl)}
          onEmailSelected={(ms, tpl) => emailSelected(ms, tpl)}
          onSetStatus={(m, r, s) => { void setSettlementStatus(m, r, s); }}
          onSetDeclared={(m, r, d) => { void setDeclared(m, r, d); }}
        />
      )}
    </div>
  );
}
