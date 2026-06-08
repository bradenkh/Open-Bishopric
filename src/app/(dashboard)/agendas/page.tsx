"use client";

import { useState } from "react";
import {
  Plus, Filter, CalendarDays, Clock, MapPin, Pencil, Trash2,
  CheckCircle2, Circle, ChevronDown, ChevronRight, User,
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
  Meeting, MeetingType, MeetingStatus, AgendaItem, Announcement, SacramentProgram,
} from "@/types";
import { MEETING_TYPE_LABELS, MEETING_STATUS_COLORS } from "@/types";
import { MOCK_MEETINGS, MOCK_ANNOUNCEMENTS } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { AnnouncementsPanel } from "@/components/agendas/announcements-panel";
import { SacramentProgram as SacramentProgramView } from "@/components/agendas/sacrament-program";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPES: MeetingType[] = ["bishopric", "sacrament_meeting", "ward_council"];
const STATUSES: MeetingStatus[] = ["upcoming", "completed", "cancelled"];

const EMPTY_FORM = {
  title: "", type: "bishopric" as MeetingType, status: "upcoming" as MeetingStatus,
  date: "", time: "", location: "", notes: "",
  presiding: "", conducting: "", chorister: "", organist: "",
};

const DEFAULT_TITLE: Record<MeetingType, string> = {
  bishopric:         "Bishopric Meeting",
  sacrament_meeting: "Sacrament Meeting",
  ward_council:      "Ward Council",
};

/** A blank but ordered sacrament program to seed new sacrament meetings. */
function defaultProgram(header: Partial<SacramentProgram>): SacramentProgram {
  const mk = (kind: SacramentProgram["items"][number]["kind"], label: string) =>
    ({ id: `pi-${Math.random().toString(36).slice(2, 8)}`, kind, label });
  return {
    presiding: header.presiding,
    conducting: header.conducting,
    chorister: header.chorister,
    organist: header.organist,
    items: [
      mk("hymn", "Opening Hymn"),
      mk("prayer", "Invocation"),
      mk("business", "Ward Business"),
      mk("announcements", "Announcements"),
      mk("hymn", "Sacrament Hymn"),
      mk("sacrament", "Administration of the Sacrament"),
      mk("speaker", "First Speaker"),
      mk("hymn", "Intermediate Hymn"),
      mk("speaker", "Concluding Speaker"),
      mk("hymn", "Closing Hymn"),
      mk("prayer", "Benediction"),
    ],
  };
}

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
    setForm({ ...EMPTY_FORM, type: activeTab, title: DEFAULT_TITLE[activeTab] });
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
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 150));
    const now = new Date().toISOString();
    const { presiding, conducting, chorister, organist, ...meetingFields } = form;
    const header = {
      presiding:  presiding  || undefined,
      conducting: conducting || undefined,
      chorister:  chorister  || undefined,
      organist:   organist   || undefined,
    };
    if (editing) {
      setMeetings((prev) => prev.map((m) => {
        if (m.id !== editing.id) return m;
        const program = form.type === "sacrament_meeting"
          ? { ...(m.program ?? defaultProgram(header)), ...header }
          : m.program;
        return { ...m, ...meetingFields, program, updatedAt: now };
      }));
    } else {
      const newMeeting: Meeting = {
        id: `mtg-${Date.now()}`,
        ...meetingFields,
        agenda: [],
        program: form.type === "sacrament_meeting" ? defaultProgram(header) : undefined,
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      };
      setMeetings((prev) => [...prev, newMeeting]);
      setExpanded((prev) => new Set(prev).add(newMeeting.id));
      setActiveTab(newMeeting.type);
    }
    setDialogOpen(false);
    setSaving(false);
  }

  function deleteMeeting(id: string) {
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  }

  // ── Announcements ──────────────────────────────────────────────────────────

  function saveAnnouncement(
    draft: { title: string; details: string; startDate: string; expiresOn: string },
    editingId: string | null,
  ) {
    const now = new Date().toISOString();
    if (editingId) {
      setAnnouncements((prev) => prev.map((a) => a.id === editingId ? {
        ...a,
        title: draft.title.trim(),
        details: draft.details.trim() || undefined,
        startDate: draft.startDate || undefined,
        expiresOn: draft.expiresOn || undefined,
        updatedAt: now,
      } : a));
    } else {
      setAnnouncements((prev) => [...prev, {
        id: `ann-${Date.now()}`,
        title: draft.title.trim(),
        details: draft.details.trim() || undefined,
        startDate: draft.startDate || undefined,
        expiresOn: draft.expiresOn || undefined,
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
    // Detach from any meeting program that referenced it.
    setMeetings((prev) => prev.map((m) => m.program ? {
      ...m,
      program: {
        ...m.program,
        items: m.program.items.map((it) => it.announcementIds
          ? { ...it, announcementIds: it.announcementIds.filter((x) => x !== id) }
          : it),
      },
    } : m));
  }

  function updateProgram(meetingId: string, program: SacramentProgram) {
    const now = new Date().toISOString();
    setMeetings((prev) => prev.map((m) =>
      m.id === meetingId ? { ...m, program, updatedAt: now } : m));
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

      {/* Announcements — managed within the Sacrament Meeting tab */}
      {activeTab === "sacrament_meeting" && (
        <AnnouncementsPanel
          announcements={announcements}
          onSave={saveAnnouncement}
          onArchiveToggle={toggleArchiveAnnouncement}
          onDelete={deleteAnnouncement}
        />
      )}

      {/* Meeting list */}
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
            const isSacrament = m.type === "sacrament_meeting";
            const mins = totalMinutes(m.agenda);
            const itemCount = isSacrament ? (m.program?.items.length ?? 0) : m.agenda.length;
            return (
              <li key={m.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Meeting header */}
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
                        {itemCount} item{itemCount === 1 ? "" : "s"}{!isSacrament && mins > 0 ? ` · ${mins} min` : ""}
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

                {/* Body */}
                {isOpen && (
                  <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-2">
                    {isSacrament ? (
                      <SacramentProgramView
                        program={m.program ?? { items: [] }}
                        announcements={announcements}
                        onChange={(p) => updateProgram(m.id, p)}
                      />
                    ) : m.agenda.length === 0 ? (
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
                      {!isSacrament && (
                        <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => openNewItem(m.id)}>
                          <Plus className="h-3 w-3" /> Add item
                        </Button>
                      )}
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
    </div>
  );
}
