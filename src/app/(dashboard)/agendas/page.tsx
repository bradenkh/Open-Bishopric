"use client";

import { useState } from "react";
import {
  Plus, Filter, CalendarDays, Clock, MapPin, Pencil, Trash2,
  CheckCircle2, Circle, ChevronDown, ChevronRight, ChevronLeft, User, FileText, Settings, Gavel,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import type {
  Meeting, MeetingType, MeetingStatus, AgendaItem, Announcement, SacramentProgram, WardInfo,
} from "@/types";
import { MEETING_TYPE_LABELS, MEETING_STATUS_COLORS } from "@/types";
import { MOCK_MEETINGS, MOCK_ANNOUNCEMENTS, MOCK_CALLINGS } from "@/lib/mock-data";
import { DEFAULT_WARD_INFO, deriveWardBusiness } from "@/lib/ward";
import { isAnnouncementActive } from "@/lib/announcements";
import { defaultBulletin, addDays, upcomingSunday, todayISODate, formatSunday } from "@/lib/bulletin";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { AnnouncementsPanel, type AnnouncementDraft } from "@/components/agendas/announcements-panel";
import { BulletinEditor } from "@/components/agendas/sacrament-program";
import { BulletinDialog } from "@/components/agendas/bulletin";
import { BusinessDialog } from "@/components/agendas/business-doc";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPES: MeetingType[] = ["bishopric", "sacrament_meeting", "ward_council"];
const STATUSES: MeetingStatus[] = ["upcoming", "completed", "cancelled"];

const EMPTY_FORM = {
  title: "", type: "bishopric" as MeetingType, status: "upcoming" as MeetingStatus,
  date: "", time: "", location: "", notes: "",
  presiding: "", conducting: "", chorister: "", organist: "", quote: "", quoteBy: "",
};

const DEFAULT_TITLE: Record<MeetingType, string> = {
  bishopric:         "Bishopric Meeting",
  sacrament_meeting: "Sacrament Meeting",
  ward_council:      "Ward Council",
};

function formatTime(time?: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function totalMinutes(agenda: AgendaItem[]) {
  return agenda.reduce((sum, item) => sum + (item.durationMins ?? 0), 0);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgendasPage() {
  const { user } = useAuth();
  const [meetings,   setMeetings]   = useState<Meeting[]>([...MOCK_MEETINGS]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([...MOCK_ANNOUNCEMENTS]);
  const [activeTab,  setActiveTab]  = useState<MeetingType>("bishopric");
  const [filterStatus, setFilterStatus] = useState<MeetingStatus | "all">("upcoming");
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set([MOCK_MEETINGS[0]?.id]));

  // Meeting dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<Meeting | null>(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);

  // Agenda-item dialog
  const [itemDialog, setItemDialog] = useState<{ meetingId: string; item: AgendaItem | null } | null>(null);
  const [itemForm,   setItemForm]   = useState({ title: "", presenter: "", durationMins: "", notes: "" });

  // Bulletin + ward settings
  const [ward, setWard]               = useState<WardInfo>(DEFAULT_WARD_INFO);
  const [bulletinFor, setBulletinFor] = useState<Meeting | null>(null);
  const [businessFor, setBusinessFor] = useState<Meeting | null>(null);
  const [wardDialogOpen, setWardDialogOpen] = useState(false);
  const [wardForm, setWardForm]       = useState<WardInfo>(DEFAULT_WARD_INFO);

  // Sacrament tab navigates one Sunday at a time.
  const [selectedSunday, setSelectedSunday] = useState<string>(() => upcomingSunday(todayISODate()));
  const sacramentMeeting = meetings.find(
    (m) => m.type === "sacrament_meeting" && m.date === selectedSunday,
  ) ?? null;

  // Sustaining lines derived from callings (the separate Ward Business document).
  const wardBusiness = deriveWardBusiness(MOCK_CALLINGS).map((b) => b.line);
  const activeAnnouncements = announcements.filter((a) => isAnnouncementActive(a));

  const inTab = meetings.filter((m) => m.type === activeTab);
  const filtered =
    filterStatus === "all" ? inTab : inTab.filter((m) => m.status === filterStatus);

  // Sort by date ascending (soonest first) for upcoming, descending otherwise
  const sorted = [...filtered].sort((a, b) => {
    const cmp = new Date(`${a.date}T${a.time ?? "00:00"}`).getTime()
              - new Date(`${b.date}T${b.time ?? "00:00"}`).getTime();
    return filterStatus === "completed" ? -cmp : cmp;
  });

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Meeting CRUD ───────────────────────────────────────────────────────────

  function openNew() {
    setEditing(null);
    const base = { ...EMPTY_FORM, type: activeTab, title: DEFAULT_TITLE[activeTab] };
    // On the sacrament tab, prefill the currently selected Sunday.
    if (activeTab === "sacrament_meeting") base.date = selectedSunday;
    setForm(base);
    setDialogOpen(true);
  }

  function openEdit(m: Meeting) {
    setEditing(m);
    setForm({
      title: m.title, type: m.type, status: m.status,
      date: m.date, time: m.time ?? "", location: m.location ?? "", notes: m.notes ?? "",
      presiding:  m.program?.presiding  ?? "",
      conducting: m.program?.conducting ?? "",
      chorister:  m.program?.chorister  ?? "",
      organist:   m.program?.organist   ?? "",
      quote:      m.program?.quote      ?? "",
      quoteBy:    m.program?.quoteBy    ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 150));
    const now = new Date().toISOString();
    const { presiding, conducting, chorister, organist, quote, quoteBy, ...meetingFields } = form;
    const header = {
      presiding:  presiding  || undefined,
      conducting: conducting || undefined,
      chorister:  chorister  || undefined,
      organist:   organist   || undefined,
      quote:      quote      || undefined,
      quoteBy:    quoteBy    || undefined,
    };
    if (editing) {
      setMeetings((prev) => prev.map((m) => {
        if (m.id !== editing.id) return m;
        const program = form.type === "sacrament_meeting"
          ? { ...(m.program ?? defaultBulletin(header)), ...header }
          : m.program;
        return { ...m, ...meetingFields, program, updatedAt: now };
      }));
    } else {
      const newMeeting: Meeting = {
        id: `mtg-${Date.now()}`,
        ...meetingFields,
        agenda: [],
        program: form.type === "sacrament_meeting" ? defaultBulletin(header) : undefined,
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      };
      setMeetings((prev) => [...prev, newMeeting]);
      setExpanded((prev) => new Set(prev).add(newMeeting.id));
      setActiveTab(newMeeting.type);
      if (newMeeting.type === "sacrament_meeting") setSelectedSunday(newMeeting.date);
    }
    setDialogOpen(false);
    setSaving(false);
  }

  function deleteMeeting(id: string) {
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  }

  // ── Announcements ──────────────────────────────────────────────────────────

  function saveAnnouncement(draft: AnnouncementDraft, editingId: string | null) {
    const now = new Date().toISOString();
    const fields = {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      date: draft.date || undefined,
      time: draft.time || undefined,
      location: draft.location.trim() || undefined,
    };
    if (editingId) {
      setAnnouncements((prev) => prev.map((a) =>
        a.id === editingId ? { ...a, ...fields, updatedAt: now } : a));
    } else {
      setAnnouncements((prev) => [...prev, {
        id: `ann-${Date.now()}`,
        ...fields,
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      }]);
    }
  }

  function toggleArchiveAnnouncement(id: string) {
    const now = new Date().toISOString();
    setAnnouncements((prev) => prev.map((a) =>
      a.id === id ? { ...a, archived: !a.archived, updatedAt: now } : a));
  }

  function deleteAnnouncement(id: string) {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  }

  function updateProgram(meetingId: string, program: SacramentProgram) {
    const now = new Date().toISOString();
    setMeetings((prev) => prev.map((m) =>
      m.id === meetingId ? { ...m, program, updatedAt: now } : m));
  }

  // ── Ward settings ──────────────────────────────────────────────────────────

  function openWardSettings() {
    setWardForm(ward);
    setWardDialogOpen(true);
  }

  function saveWardSettings() {
    setWard(wardForm);
    setWardDialogOpen(false);
  }

  function updateLeader(idx: number, patch: Partial<WardInfo["leadership"][number]>) {
    setWardForm((w) => ({
      ...w,
      leadership: w.leadership.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  }

  // ── Agenda-item CRUD ───────────────────────────────────────────────────────

  function openNewItem(meetingId: string) {
    setItemForm({ title: "", presenter: "", durationMins: "", notes: "" });
    setItemDialog({ meetingId, item: null });
  }

  function openEditItem(meetingId: string, item: AgendaItem) {
    setItemForm({
      title: item.title,
      presenter: item.presenter ?? "",
      durationMins: item.durationMins ? String(item.durationMins) : "",
      notes: item.notes ?? "",
    });
    setItemDialog({ meetingId, item });
  }

  function handleSaveItem() {
    if (!itemDialog || !itemForm.title.trim()) return;
    const { meetingId, item } = itemDialog;
    const now = new Date().toISOString();
    const mins = itemForm.durationMins ? Number(itemForm.durationMins) : undefined;
    setMeetings((prev) => prev.map((m) => {
      if (m.id !== meetingId) return m;
      let agenda: AgendaItem[];
      if (item) {
        agenda = m.agenda.map((a) => a.id === item.id
          ? { ...a, title: itemForm.title, presenter: itemForm.presenter || undefined, durationMins: mins, notes: itemForm.notes || undefined }
          : a);
      } else {
        agenda = [...m.agenda, {
          id: `ai-${Date.now()}`,
          title: itemForm.title,
          presenter: itemForm.presenter || undefined,
          durationMins: mins,
          notes: itemForm.notes || undefined,
        }];
      }
      return { ...m, agenda, updatedAt: now };
    }));
    setItemDialog(null);
  }

  function toggleItemDone(meetingId: string, itemId: string) {
    setMeetings((prev) => prev.map((m) =>
      m.id === meetingId
        ? { ...m, agenda: m.agenda.map((a) => a.id === itemId ? { ...a, done: !a.done } : a) }
        : m
    ));
  }

  function deleteItem(meetingId: string, itemId: string) {
    setMeetings((prev) => prev.map((m) =>
      m.id === meetingId ? { ...m, agenda: m.agenda.filter((a) => a.id !== itemId) } : m
    ));
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-8 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agendas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {inTab.filter((m) => m.status === "upcoming").length} upcoming {MEETING_TYPE_LABELS[activeTab].toLowerCase()} meeting{inTab.filter((m) => m.status === "upcoming").length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Meeting
        </Button>
      </div>

      {/* Meeting-type tabs */}
      <div className="flex items-center gap-1 border-b border-border -mx-1 px-1 overflow-x-auto">
        {TYPES.map((t) => {
          const count = meetings.filter((m) => m.type === t && m.status === "upcoming").length;
          const active = activeTab === t;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors -mb-px",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {MEETING_TYPE_LABELS[t]}
              {count > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === "sacrament_meeting" ? (
        /* ── Sacrament Meeting: one Sunday at a time ── */
        <div className="space-y-4">
          {/* Ward settings */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Bulletins use <span className="font-medium">{ward.wardName}</span> details.
            </p>
            <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" onClick={openWardSettings}>
              <Settings className="h-3.5 w-3.5" /> Ward settings
            </Button>
          </div>

          {/* Sunday navigator */}
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedSunday(addDays(selectedSunday, -7))} title="Previous Sunday">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="min-w-[15rem] text-center text-sm font-semibold">{formatSunday(selectedSunday)}</p>
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedSunday(addDays(selectedSunday, 7))} title="Next Sunday">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {sacramentMeeting ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{sacramentMeeting.title}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {sacramentMeeting.time && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {formatTime(sacramentMeeting.time)}
                      </span>
                    )}
                    {sacramentMeeting.location && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {sacramentMeeting.location}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {sacramentMeeting.program?.rows.length ?? 0} rows
                    </span>
                  </div>
                </div>
                <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0 capitalize", MEETING_STATUS_COLORS[sacramentMeeting.status])}>
                  {sacramentMeeting.status}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setBusinessFor(sacramentMeeting)} title="Ward business document">
                  <Gavel className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setBulletinFor(sacramentMeeting)} title="View bulletin">
                  <FileText className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(sacramentMeeting)} title="Edit details">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-2">
                <BulletinEditor
                  program={sacramentMeeting.program ?? defaultBulletin({})}
                  onChange={(p) => updateProgram(sacramentMeeting.id, p)}
                />
                {sacramentMeeting.notes && (
                  <p className="text-xs text-muted-foreground pt-1 italic">Notes: {sacramentMeeting.notes}</p>
                )}
                <div className="pt-1">
                  <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-red-600" onClick={() => deleteMeeting(sacramentMeeting.id)}>
                    <Trash2 className="h-3 w-3" /> Delete meeting
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground">No bulletin for this Sunday yet</p>
              <Button onClick={openNew} variant="outline" size="sm">Create bulletin</Button>
            </div>
          )}

          {/* Announcements pane beneath the bulletin */}
          <AnnouncementsPanel
            announcements={announcements}
            onSave={saveAnnouncement}
            onArchiveToggle={toggleArchiveAnnouncement}
            onDelete={deleteAnnouncement}
          />
        </div>
      ) : (
        /* ── Bishopric / Ward Council: list view ── */
        <>
          {/* Status filter pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            {(["all", ...STATUSES] as (MeetingStatus | "all")[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize",
                  filterStatus === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground">
                No {filterStatus === "all" ? "" : `${filterStatus} `}{MEETING_TYPE_LABELS[activeTab].toLowerCase()} meetings
              </p>
              <Button onClick={openNew} variant="outline" size="sm">Schedule a meeting</Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {sorted.map((m) => {
                const isOpen = expanded.has(m.id);
                const mins = totalMinutes(m.agenda);
                return (
                  <li key={m.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-start gap-3 p-4">
                      <button
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleExpand(m.id)}
                        title={isOpen ? "Collapse" : "Expand"}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>

                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(m.id)}>
                        <p className="text-sm font-semibold">{m.title}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="h-3 w-3" /> {formatDate(m.date)}
                          </span>
                          {m.time && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" /> {formatTime(m.time)}
                            </span>
                          )}
                          {m.location && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" /> {m.location}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {m.agenda.length} item{m.agenda.length === 1 ? "" : "s"}{mins > 0 ? ` · ${mins} min` : ""}
                          </span>
                        </div>
                      </div>

                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full shrink-0 capitalize",
                        MEETING_STATUS_COLORS[m.status]
                      )}>
                        {m.status}
                      </span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {isOpen && (
                      <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-2">
                        {m.agenda.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No agenda items yet.</p>
                        ) : (
                          <ol className="space-y-1.5">
                            {m.agenda.map((item, idx) => (
                              <li key={item.id} className="group flex items-start gap-2 rounded-lg bg-card px-3 py-2 border border-border">
                                <button
                                  className="mt-0.5 shrink-0"
                                  onClick={() => toggleItemDone(m.id, item.id)}
                                  title={item.done ? "Mark not done" : "Mark done"}
                                >
                                  {item.done
                                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    : <Circle className="h-4 w-4 text-muted-foreground/40 hover:text-primary" />}
                                </button>
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditItem(m.id, item)}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-muted-foreground shrink-0">{idx + 1}.</span>
                                    <p className={cn("text-sm", item.done && "line-through text-muted-foreground")}>
                                      {item.title}
                                    </p>
                                    {item.durationMins ? (
                                      <span className="text-[10px] text-muted-foreground">{item.durationMins}m</span>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 mt-0.5 pl-5">
                                    {item.presenter && (
                                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <User className="h-3 w-3" /> {item.presenter}
                                      </span>
                                    )}
                                    {item.notes && (
                                      <span className="text-xs text-muted-foreground">{item.notes}</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  className="shrink-0 text-muted-foreground/40 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => deleteItem(m.id, item.id)}
                                  title="Remove item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </li>
                            ))}
                          </ol>
                        )}

                        {m.notes && (
                          <p className="text-xs text-muted-foreground pt-1 italic">Notes: {m.notes}</p>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => openNewItem(m.id)}>
                            <Plus className="h-3 w-3" /> Add item
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-red-600"
                            onClick={() => deleteMeeting(m.id)}
                          >
                            <Trash2 className="h-3 w-3" /> Delete meeting
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* ── Meeting dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Meeting" : "New Meeting"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Bishopric Meeting"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as MeetingType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{MEETING_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as MeetingStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="date">Date *</Label>
                <Input id="date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="time">Time</Label>
                <Input id="time" type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Bishop's Office" />
            </div>
            {form.type === "sacrament_meeting" && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="presiding">Presiding</Label>
                  <Input id="presiding" value={form.presiding} onChange={(e) => setForm((f) => ({ ...f, presiding: e.target.value }))} placeholder="Name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="conducting">Conducting</Label>
                  <Input id="conducting" value={form.conducting} onChange={(e) => setForm((f) => ({ ...f, conducting: e.target.value }))} placeholder="Name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="chorister">Chorister</Label>
                  <Input id="chorister" value={form.chorister} onChange={(e) => setForm((f) => ({ ...f, chorister: e.target.value }))} placeholder="Name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="organist">Organist</Label>
                  <Input id="organist" value={form.organist} onChange={(e) => setForm((f) => ({ ...f, organist: e.target.value }))} placeholder="Name" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="quote">Spiritual thought / quote (bulletin)</Label>
                  <Textarea id="quote" value={form.quote} onChange={(e) => setForm((f) => ({ ...f, quote: e.target.value }))} placeholder="Optional quote printed on the bulletin" rows={2} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="quoteBy">Attribution</Label>
                  <Input id="quoteBy" value={form.quoteBy} onChange={(e) => setForm((f) => ({ ...f, quoteBy: e.target.value }))} placeholder="e.g. President Oaks" />
                </div>
                {!editing && (
                  <p className="col-span-2 text-xs text-muted-foreground">
                    A standard order of service will be added — edit it after creating.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim() || !form.date}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Meeting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Agenda-item dialog ── */}
      <Dialog open={!!itemDialog} onOpenChange={(open) => !open && setItemDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{itemDialog?.item ? "Edit Agenda Item" : "Add Agenda Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="item-title">Item *</Label>
              <Input
                id="item-title"
                value={itemForm.title}
                onChange={(e) => setItemForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Review callings in progress"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-presenter">Presenter</Label>
                <Input id="item-presenter" value={itemForm.presenter} onChange={(e) => setItemForm((f) => ({ ...f, presenter: e.target.value }))} placeholder="Name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-mins">Minutes</Label>
                <Input id="item-mins" type="number" min="0" value={itemForm.durationMins} onChange={(e) => setItemForm((f) => ({ ...f, durationMins: e.target.value }))} placeholder="e.g. 10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-notes">Notes</Label>
              <Textarea id="item-notes" value={itemForm.notes} onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setItemDialog(null)}>Cancel</Button>
            <Button onClick={handleSaveItem} disabled={!itemForm.title.trim()}>
              {itemDialog?.item ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulletin preview ── */}
      {bulletinFor && (
        <BulletinDialog
          open={!!bulletinFor}
          onOpenChange={(o) => !o && setBulletinFor(null)}
          meeting={bulletinFor}
          ward={ward}
          announcements={activeAnnouncements}
        />
      )}

      {/* ── Ward business document ── */}
      {businessFor && (
        <BusinessDialog
          open={!!businessFor}
          onOpenChange={(o) => !o && setBusinessFor(null)}
          date={businessFor.date}
          items={wardBusiness}
          ward={ward}
        />
      )}

      {/* ── Ward settings dialog ── */}
      <Dialog open={wardDialogOpen} onOpenChange={setWardDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ward Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              These details appear on every sacrament meeting bulletin.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="w-ward">Ward name</Label>
              <Input id="w-ward" value={wardForm.wardName} onChange={(e) => setWardForm((w) => ({ ...w, wardName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="w-stake">Stake</Label>
                <Input id="w-stake" value={wardForm.stake} onChange={(e) => setWardForm((w) => ({ ...w, stake: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-church">Church name</Label>
                <Input id="w-church" value={wardForm.churchName} onChange={(e) => setWardForm((w) => ({ ...w, churchName: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-addr">Address</Label>
              <Input id="w-addr" value={wardForm.address} onChange={(e) => setWardForm((w) => ({ ...w, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="w-mtitle">Meeting heading</Label>
                <Input id="w-mtitle" value={wardForm.meetingTitle} onChange={(e) => setWardForm((w) => ({ ...w, meetingTitle: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-mtime">Time</Label>
                <Input id="w-mtime" value={wardForm.meetingTime} onChange={(e) => setWardForm((w) => ({ ...w, meetingTime: e.target.value }))} placeholder="9 a.m." />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-second">Second hour</Label>
              <Input id="w-second" value={wardForm.secondHour} onChange={(e) => setWardForm((w) => ({ ...w, secondHour: e.target.value }))} placeholder="Sunday School" />
            </div>

            <div className="space-y-2">
              <Label>Leadership</Label>
              {wardForm.leadership.map((l, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <Input value={l.name} onChange={(e) => updateLeader(i, { name: e.target.value })} placeholder="Name" />
                  <Input value={l.role} onChange={(e) => updateLeader(i, { role: e.target.value })} placeholder="Role" />
                  <Input value={l.phone ?? ""} onChange={(e) => updateLeader(i, { phone: e.target.value })} placeholder="Phone" />
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="w-note">Submission note</Label>
              <Textarea id="w-note" value={wardForm.submissionNote} onChange={(e) => setWardForm((w) => ({ ...w, submissionNote: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWardDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveWardSettings}>Save Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
