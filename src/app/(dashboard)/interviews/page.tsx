"use client";

import { useState, useEffect, useMemo } from "react";
import {
  RotateCcw, Loader2, Trash2, Mail, Send, Search, Download, User, CalendarClock, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useData, newId } from "@/contexts/DataContext";
import type {
  SettlementRecord, SettlementStatus,
  Member, CalendarBooking,
} from "@/types";
import {
  INTERVIEW_TYPE_LABELS, SETTLEMENT_STATUS_LABELS,
} from "@/types";
import { formatDate, cn } from "@/lib/utils";
import { APP_TIME_ZONE, toDateStr, fromMinutes, nowInAppTz } from "@/lib/availability";
import { toZonedTime } from "date-fns-tz";
import {
  DEFAULT_SETTLEMENT_EMAIL, renderSettlementEmail, withDefaults,
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
  const header = ["Household", "Parents", "Members", "Status", "Emailed", "Scheduled"];
  const lines = rows.map((r) => {
    const emailed = r.record?.linkSentAt ? r.record.linkSentAt.slice(0, 10) : "";
    const sched = r.booking ? (() => { const w = bookingWhen(r.booking!.startAt); return `${w.date} ${w.time}`; })() : "";
    const parents = r.parents.map((p) => `${p.firstName} ${p.lastName}`).join("; ");
    return [r.name, parents, String(r.householdMembers.length),
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
  /** The Google booking-page URL sent to members (from Settings). */
  bookingUrl?: string;
  /** Mark these households' heads (and their households) as invited. */
  onMarkInvited: (heads: Member[]) => Promise<void>;
  onSetStatus: (member: Member, record: SettlementRecord | undefined, status: SettlementStatus) => void;
}

function SettlementView({
  members, settlements, calendarBookings, emailTemplate, bookingUrl,
  onMarkInvited, onSetStatus,
}: SettlementViewProps) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<SettlementSegment>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionMsg, setActionMsg] = useState<string | null>(null);

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

  // A household that still needs inviting or a nudge: not yet booked or done.
  const awaiting = (r: SettlementRowState) =>
    r.status !== "scheduled" && !TERMINAL_STATUSES.has(r.status);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectableIds = filtered.filter(awaiting).map((r) => r.member.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const selectedRows = rows.filter((r) => selected.has(r.member.id) && awaiting(r));
  const selectedCount = selectedRows.length;
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

  // The app keeps no member emails or phone numbers: invitations go out from LCR
  // or Member Tools. These copy what's needed there — the selected households'
  // names (to build a list) and the invitation text with the booking link filled in.
  async function copyText(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setActionMsg(done);
    } catch {
      setActionMsg("Couldn't copy to the clipboard.");
    }
  }

  function copyNames() {
    const names = selectedRows.flatMap((r) =>
      (r.parents.length ? r.parents : [r.member]).map((m) => `${m.firstName} ${m.lastName}`));
    void copyText(names.join("\n"),
      `Copied ${names.length} name${names.length === 1 ? "" : "s"} from ${selectedCount} household${selectedCount === 1 ? "" : "s"}.`);
  }

  function copyMessage() {
    const { subject, body } = renderSettlementEmail(emailTemplate, {
      name: "", lastName: "Brothers and Sisters", title: "", link: bookingUrl ?? "",
    });
    void copyText(`${subject}\n\n${body}`, "Copied the invitation message.");
  }

  async function markInvited() {
    await onMarkInvited(selectedRows.map((r) => r.member));
    setActionMsg(`Marked ${selectedCount} household${selectedCount === 1 ? "" : "s"} as invited.`);
    setSelected(new Set());
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
    { seg: "link",        label: "Invited" },
    { seg: "scheduled",   label: "Scheduled" },
    { seg: "done",        label: "Done" },
  ];

  return (
    <div className="space-y-4">
      {!bookingUrl && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          Set a <strong>Tithing Settlement</strong> booking page in Settings → Google booking pages so the
          invitation message includes the booking link. Bookings members make there appear on the Bookings tab.
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
                <Button size="sm" variant="outline" className="gap-1.5" onClick={copyMessage}>
                  <Mail className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Copy message</span>
                  <span className="sm:hidden">Message</span>
                </Button>
              </div>
            </div>
            <BreakdownBar rows={rows} />
            {actionMsg && <p className="text-xs text-muted-foreground">{actionMsg}</p>}
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
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={allSelected}
              onChange={toggleSelectAll}
              aria-label="Select all households still to book"
            />
            Select all shown ({selectableIds.length}) still to book
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={selectedCount === 0} onClick={copyNames}>
              <Copy className="h-3.5 w-3.5" /> Copy names{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={selectedCount === 0} onClick={() => { void markInvited(); }}>
              <Send className="h-3.5 w-3.5" /> Mark invited
            </Button>
          </div>
        </div>
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
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-primary"
                checked={awaiting(r) && selected.has(r.member.id)}
                disabled={!awaiting(r)}
                title={awaiting(r) ? undefined : "Already booked or complete"}
                onChange={() => toggleSelected(r.member.id)}
                aria-label={`Select ${r.name}`}
              />
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
                {r.record?.linkSentAt && r.status !== "scheduled" && !TERMINAL_STATUSES.has(r.status) && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                    <Mail className="h-3 w-3 shrink-0" /> Emailed {timeAgo(r.record.linkSentAt)}
                  </p>
                )}
              </div>

              <Badge className={cn("text-[10px] shrink-0", SETTLEMENT_STATUS_COLORS[r.status])}>
                {SETTLEMENT_STATUS_LABELS[r.status]}
              </Badge>

              {/* Status control */}
              <Select value={r.status} onValueChange={(v) => onSetStatus(r.member, r.record, v as SettlementStatus)}>
                <SelectTrigger className="h-8 w-[130px] text-xs shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SETTLEMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{SETTLEMENT_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

            </div>
          ))}
        </div>
      )}

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

  /** Mark each household as invited (records for every member, so each shows on the board). */
  async function markInvited(heads: Member[]) {
    const pool = members.filter((x) => x.isActive);
    for (const head of heads) {
      for (const person of householdMembersOf(head, pool)) await ensureRecord(person);
    }
  }

  async function setSettlementStatus(m: Member, record: SettlementRecord | undefined, status: SettlementStatus) {
    const now = new Date().toISOString();
    if (record) await settlementsCol.update(record.id, { status });
    else await settlementsCol.create({
      id: newId(), memberId: m.id, memberName: memberName(m), year: SETTLEMENT_YEAR,
      status, createdBy: user?.uid ?? "mock", createdAt: now, updatedAt: now,
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
          onMarkInvited={markInvited}
          onSetStatus={(m, r, s) => { void setSettlementStatus(m, r, s); }}
        />
      )}
    </div>
  );
}
