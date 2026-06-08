"use client";

import { useState } from "react";
import {
  Megaphone, Plus, Pencil, Trash2, Archive, ArchiveRestore, CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { Announcement } from "@/types";
import { isAnnouncementActive, sortAnnouncements } from "@/lib/announcements";
import { formatDate, cn } from "@/lib/utils";

type Draft = { title: string; details: string; startDate: string; expiresOn: string };
const EMPTY: Draft = { title: "", details: "", startDate: "", expiresOn: "" };

interface Props {
  announcements: Announcement[];
  onSave: (draft: Draft, editingId: string | null) => void;
  onArchiveToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function AnnouncementsPanel({ announcements, onSave, onArchiveToggle, onDelete }: Props) {
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm]       = useState<Draft>(EMPTY);

  const sorted = sortAnnouncements(announcements);
  const activeCount = announcements.filter((a) => isAnnouncementActive(a)).length;

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setForm({
      title: a.title,
      details: a.details ?? "",
      startDate: a.startDate ?? "",
      expiresOn: a.expiresOn ?? "",
    });
    setOpen(true);
  }

  function save() {
    if (!form.title.trim()) return;
    onSave(form, editing?.id ?? null);
    setOpen(false);
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Megaphone className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Announcements</p>
          <p className="text-xs text-muted-foreground">
            {activeCount} active · read at the pulpit and attached to programs
          </p>
        </div>
        <Button onClick={openNew} size="sm" variant="outline" className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {sorted.length > 0 && (
        <ul className="border-t border-border divide-y divide-border">
          {sorted.map((a) => {
            const active = isAnnouncementActive(a);
            return (
              <li key={a.id} className="group flex items-start gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("text-sm font-medium", !active && "text-muted-foreground line-through")}>
                      {a.title}
                    </p>
                    {!active && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {a.archived ? "Archived" : "Expired"}
                      </span>
                    )}
                  </div>
                  {a.details && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.details}</p>
                  )}
                  {a.expiresOn && (
                    <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <CalendarClock className="h-3 w-3" /> Through {formatDate(a.expiresOn)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)} title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onArchiveToggle(a.id)}
                    title={a.archived ? "Restore" : "Archive"}
                  >
                    {a.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-600"
                    onClick={() => onDelete(a.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Announcement" : "New Announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title">Title *</Label>
              <Input
                id="ann-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Ward Temple Day"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-details">Details</Label>
              <Textarea
                id="ann-details"
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                placeholder="What should be read at the pulpit?"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ann-start">Starts</Label>
                <Input id="ann-start" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-expires">Expires</Label>
                <Input id="ann-expires" type="date" value={form.expiresOn} onChange={(e) => setForm((f) => ({ ...f, expiresOn: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave expiry blank for a standing announcement. Expired items drop off the active list automatically.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.title.trim()}>
              {editing ? "Save Changes" : "Add Announcement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
