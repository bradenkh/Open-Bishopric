"use client";

import { useState } from "react";
import {
  Plus, CalendarDays, Clock, MapPin, Pencil, Trash2,
  ChevronLeft, ChevronRight, FileText, Settings,
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
  Meeting, MeetingType, MeetingStatus, SacramentProgram, WardInfo, WardBusiness,
} from "@/types";
import { MEETING_TYPE_LABELS, MEETING_STATUS_COLORS } from "@/types";
import { useData, newId } from "@/contexts/DataContext";
import { seedBusiness } from "@/lib/ward";
import { isAnnouncementActive } from "@/lib/announcements";
import { defaultBulletin, addDays, upcomingSunday, todayISODate, formatSunday } from "@/lib/bulletin";
import { cn } from "@/lib/utils";
import { AnnouncementsPanel, type AnnouncementDraft } from "@/components/agendas/announcements-panel";
import { BulletinEditor } from "@/components/agendas/sacrament-program";
import { BusinessEditor } from "@/components/agendas/business-editor";
import { BulletinDialog } from "@/components/agendas/bulletin";
import { BusinessDialog } from "@/components/agendas/business-doc";

const TYPES: MeetingType[] = ["bishopric", "sacrament_meeting", "ward_council"];
const STATUSES: MeetingStatus[] = ["upcoming", "completed", "cancelled"];

const EMPTY_FORM = {
  title: "Sacrament Meeting", type: "sacrament_meeting" as MeetingType, status: "upcoming" as MeetingStatus,
  date: "", time: "", location: "", notes: "",
};

const BLANK_WARD: WardInfo = {
  wardName: "", churchName: "", stake: "", address: "",
  meetingTitle: "", meetingTime: "", leadership: [], submissionNote: "",
};

function formatTime(time?: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

export default function SacramentPage() {
  const { user } = useAuth();
  const { wardInfo, updateWardInfo, callings: callingsCol } = useData();
  const meetingsCol = useData().meetings;
  const meetings = meetingsCol.items;
  const announcementsCol = useData().announcements;
  const announcements = announcementsCol.items;

  const [selectedSunday, setSelectedSunday] = useState<string>(() => upcomingSunday(todayISODate()));
  const [sacramentPanel, setSacramentPanel] = useState<"bulletin" | "business">("bulletin");

  const sacramentMeeting = meetings.find(
    (m) => m.type === "sacrament_meeting" && m.date === selectedSunday,
  ) ?? null;

  const ward = wardInfo ?? BLANK_WARD;
  const activeAnnouncements = announcements.filter((a) => isAnnouncementActive(a));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [bulletinFor, setBulletinFor] = useState<Meeting | null>(null);
  const [businessFor, setBusinessFor] = useState<Meeting | null>(null);
  const [wardDialogOpen, setWardDialogOpen] = useState(false);
  const [wardForm, setWardForm] = useState<WardInfo>(BLANK_WARD);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, date: selectedSunday });
    setDialogOpen(true);
  }

  function openEdit(m: Meeting) {
    setEditing(m);
    setForm({
      title: m.title, type: m.type, status: m.status,
      date: m.date, time: m.time ?? "", location: m.location ?? "", notes: m.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 150));
    const now = new Date().toISOString();
    if (editing) {
      await meetingsCol.update(editing.id, { ...form, updatedAt: now });
    } else {
      const newMeetingId = newId();
      const newMeeting: Meeting = {
        id: newMeetingId,
        ...form,
        agenda: [],
        program: defaultBulletin({}),
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      };
      await meetingsCol.create(newMeeting);
      setSelectedSunday(newMeeting.date);
    }
    setDialogOpen(false);
    setSaving(false);
  }

  async function deleteMeeting(id: string) {
    await meetingsCol.remove(id);
  }

  async function updateProgram(meetingId: string, program: SacramentProgram) {
    const now = new Date().toISOString();
    await meetingsCol.update(meetingId, { program, updatedAt: now });
  }

  async function updateBusiness(meetingId: string, business: WardBusiness) {
    const now = new Date().toISOString();
    await meetingsCol.update(meetingId, { business, updatedAt: now });
  }

  async function saveAnnouncement(draft: AnnouncementDraft, editingId: string | null) {
    const now = new Date().toISOString();
    const fields = {
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      date: draft.date || undefined,
      time: draft.time || undefined,
      location: draft.location.trim() || undefined,
    };
    if (editingId) {
      await announcementsCol.update(editingId, { ...fields, updatedAt: now });
    } else {
      await announcementsCol.create({
        id: newId(),
        ...fields,
        createdBy: user?.uid ?? "mock",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async function toggleArchiveAnnouncement(id: string) {
    const now = new Date().toISOString();
    const current = announcements.find((a) => a.id === id);
    await announcementsCol.update(id, { archived: !current?.archived, updatedAt: now });
  }

  async function deleteAnnouncement(id: string) {
    await announcementsCol.remove(id);
  }

  function openWardSettings() {
    setWardForm(wardInfo ?? BLANK_WARD);
    setWardDialogOpen(true);
  }

  async function saveWardSettings() {
    await updateWardInfo(wardForm);
    setWardDialogOpen(false);
  }

  function updateLeader(idx: number, patch: Partial<WardInfo["leadership"][number]>) {
    setWardForm((w) => ({
      ...w,
      leadership: w.leadership.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  }

  return (
    <div className="p-4 lg:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sacrament Meeting</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {meetings.filter((m) => m.type === "sacrament_meeting" && m.status === "upcoming").length} upcoming
          </p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Bulletin
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Bulletins use <span className="font-medium">{ward.wardName}</span> details.
        </p>
        <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" onClick={openWardSettings}>
          <Settings className="h-3.5 w-3.5" /> Ward settings
        </Button>
      </div>

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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() =>
                sacramentPanel === "business"
                  ? setBusinessFor(sacramentMeeting)
                  : setBulletinFor(sacramentMeeting)
              }
              title={sacramentPanel === "business" ? "Preview ward business" : "View bulletin"}
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(sacramentMeeting)} title="Edit details">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-3">
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
              {(["bulletin", "business"] as const).map((panel) => (
                <button
                  key={panel}
                  onClick={() => setSacramentPanel(panel)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize",
                    sacramentPanel === panel
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {panel === "bulletin" ? "Bulletin" : "Business"}
                </button>
              ))}
            </div>

            {sacramentPanel === "bulletin" ? (
              <BulletinEditor
                program={sacramentMeeting.program ?? defaultBulletin({})}
                onChange={(p) => updateProgram(sacramentMeeting.id, p)}
              />
            ) : (
              <BusinessEditor
                business={sacramentMeeting.business ?? seedBusiness(callingsCol.items)}
                callings={callingsCol.items}
                presiding={sacramentMeeting.program?.presiding ?? ""}
                onPresidingChange={(name) =>
                  updateProgram(sacramentMeeting.id, {
                    ...(sacramentMeeting.program ?? defaultBulletin({})),
                    presiding: name || undefined,
                  })
                }
                onChange={(b) => updateBusiness(sacramentMeeting.id, b)}
              />
            )}
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

      <AnnouncementsPanel
        announcements={announcements}
        onSave={saveAnnouncement}
        onArchiveToggle={toggleArchiveAnnouncement}
        onDelete={deleteAnnouncement}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Meeting" : "New Sacrament Meeting"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Sacrament Meeting"
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
              <Input id="location" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Chapel" />
            </div>
            {!editing && (
              <p className="text-xs text-muted-foreground">
                A standard order of service will be added. Edit the program, conducting, chorister, organist and second hour on the bulletin after creating. Presiding is set on the Business items.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim() || !form.date}>
              {saving ? "Saving..." : editing ? "Save Changes" : "Create Meeting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bulletinFor && (
        <BulletinDialog
          open={!!bulletinFor}
          onOpenChange={(o) => !o && setBulletinFor(null)}
          meeting={bulletinFor}
          ward={ward}
          announcements={activeAnnouncements}
        />
      )}

      {businessFor && (
        <BusinessDialog
          open={!!businessFor}
          onOpenChange={(o) => !o && setBusinessFor(null)}
          date={businessFor.date}
          presiding={businessFor.program?.presiding}
          business={businessFor.business ?? seedBusiness(callingsCol.items)}
          ward={ward}
        />
      )}

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
