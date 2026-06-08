"use client";

import { useState } from "react";
import {
  Music, Heart, Church, Gavel, Megaphone, Mic, Circle,
  Plus, Trash2, CheckCircle2, ChevronUp, ChevronDown, User,
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
import type { Announcement, ProgramItem, ProgramItemKind, SacramentProgram } from "@/types";
import { PROGRAM_KIND_LABELS } from "@/types";
import { isAnnouncementActive } from "@/lib/announcements";
import { cn } from "@/lib/utils";

const KINDS: ProgramItemKind[] = [
  "hymn", "prayer", "sacrament", "business", "announcements", "speaker", "musical_number", "other",
];

const KIND_ICON: Record<ProgramItemKind, typeof Music> = {
  hymn:           Music,
  prayer:         Heart,
  sacrament:      Church,
  business:       Gavel,
  announcements:  Megaphone,
  speaker:        Mic,
  musical_number: Music,
  other:          Circle,
};

type Draft = {
  kind: ProgramItemKind;
  label: string;
  person: string;
  hymnNumber: string;
  topic: string;
  notes: string;
  announcementIds: string[];
};

const EMPTY: Draft = {
  kind: "speaker", label: "", person: "", hymnNumber: "", topic: "", notes: "", announcementIds: [],
};

interface Props {
  program: SacramentProgram;
  announcements: Announcement[];
  onChange: (next: SacramentProgram) => void;
}

export function SacramentProgram({ program, announcements, onChange }: Props) {
  const [dialog, setDialog] = useState<{ item: ProgramItem | null } | null>(null);
  const [form, setForm]     = useState<Draft>(EMPTY);

  const annById = (id: string) => announcements.find((a) => a.id === id);
  const header = [
    ["Presiding", program.presiding],
    ["Conducting", program.conducting],
    ["Chorister", program.chorister],
    ["Organist", program.organist],
  ].filter(([, v]) => v) as [string, string][];

  function openNew() {
    setForm(EMPTY);
    setDialog({ item: null });
  }

  function openEdit(item: ProgramItem) {
    setForm({
      kind: item.kind,
      label: item.label ?? "",
      person: item.person ?? "",
      hymnNumber: item.hymnNumber ?? "",
      topic: item.topic ?? "",
      notes: item.notes ?? "",
      announcementIds: item.announcementIds ?? [],
    });
    setDialog({ item });
  }

  function save() {
    if (!dialog) return;
    const base: ProgramItem = {
      id: dialog.item?.id ?? `pi-${Date.now()}`,
      kind: form.kind,
      label: form.label.trim() || undefined,
      person: form.person.trim() || undefined,
      hymnNumber: form.hymnNumber.trim() || undefined,
      topic: form.topic.trim() || undefined,
      notes: form.notes.trim() || undefined,
      announcementIds: form.kind === "announcements" ? form.announcementIds : undefined,
      done: dialog.item?.done,
    };
    const items = dialog.item
      ? program.items.map((i) => (i.id === dialog.item!.id ? base : i))
      : [...program.items, base];
    onChange({ ...program, items });
    setDialog(null);
  }

  function update(items: ProgramItem[]) {
    onChange({ ...program, items });
  }

  function toggleDone(id: string) {
    update(program.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  function remove(id: string) {
    update(program.items.filter((i) => i.id !== id));
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...program.items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    update(next);
  }

  function toggleAnnouncement(id: string) {
    setForm((f) => ({
      ...f,
      announcementIds: f.announcementIds.includes(id)
        ? f.announcementIds.filter((x) => x !== id)
        : [...f.announcementIds, id],
    }));
  }

  // Announcements available to attach: active ones, plus any already attached
  // (so an expired-but-selected announcement still shows as checked).
  const selectable = announcements.filter(
    (a) => isAnnouncementActive(a) || form.announcementIds.includes(a.id),
  );

  return (
    <div className="space-y-3">
      {/* Program header */}
      {header.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-card border border-border px-3 py-2">
          {header.map(([k, v]) => (
            <p key={k} className="text-xs">
              <span className="text-muted-foreground">{k}:</span> <span className="font-medium">{v}</span>
            </p>
          ))}
        </div>
      )}

      {/* Program items */}
      {program.items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No program items yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {program.items.map((item, idx) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <li key={item.id} className="group flex items-start gap-2 rounded-lg bg-card px-3 py-2 border border-border">
                <button
                  className="mt-0.5 shrink-0"
                  onClick={() => toggleDone(item.id)}
                  title={item.done ? "Mark not done" : "Mark done"}
                >
                  {item.done
                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                    : <Circle className="h-4 w-4 text-muted-foreground/40 hover:text-primary" />}
                </button>

                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(item)}>
                  <p className={cn("text-sm", item.done && "line-through text-muted-foreground")}>
                    {item.label || PROGRAM_KIND_LABELS[item.kind]}
                    {item.hymnNumber && <span className="text-muted-foreground font-normal"> · #{item.hymnNumber}</span>}
                  </p>
                  <ProgramItemDetail item={item} annById={annById} />
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20" onClick={() => move(idx, -1)} disabled={idx === 0} title="Move up">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20" onClick={() => move(idx, 1)} disabled={idx === program.items.length - 1} title="Move down">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    className="text-muted-foreground/40 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => remove(item.id)}
                    title="Remove item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={openNew}>
        <Plus className="h-3 w-3" /> Add program item
      </Button>

      {/* Item editor */}
      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.item ? "Edit Program Item" : "Add Program Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as ProgramItemKind }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k} value={k}>{PROGRAM_KIND_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pi-label">Label</Label>
                <Input
                  id="pi-label"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder={LABEL_PLACEHOLDER[form.kind]}
                />
              </div>
            </div>

            {form.kind === "hymn" && (
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pi-num">Hymn #</Label>
                  <Input id="pi-num" value={form.hymnNumber} onChange={(e) => setForm((f) => ({ ...f, hymnNumber: e.target.value }))} placeholder="19" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pi-title">Hymn title</Label>
                  <Input id="pi-title" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} placeholder="We Thank Thee, O God…" />
                </div>
              </div>
            )}

            {form.kind === "prayer" && (
              <div className="space-y-1.5">
                <Label htmlFor="pi-person">Offered by</Label>
                <Input id="pi-person" value={form.person} onChange={(e) => setForm((f) => ({ ...f, person: e.target.value }))} placeholder="Name" />
              </div>
            )}

            {(form.kind === "speaker" || form.kind === "musical_number") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pi-person">{form.kind === "speaker" ? "Speaker" : "Performer"}</Label>
                  <Input id="pi-person" value={form.person} onChange={(e) => setForm((f) => ({ ...f, person: e.target.value }))} placeholder="Name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pi-topic">{form.kind === "speaker" ? "Topic" : "Title"}</Label>
                  <Input id="pi-topic" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} placeholder={form.kind === "speaker" ? "Topic" : "Number title"} />
                </div>
              </div>
            )}

            {form.kind === "announcements" && (
              <div className="space-y-1.5">
                <Label>Attach announcements</Label>
                {selectable.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active announcements to attach.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {selectable.map((a) => {
                      const on = form.announcementIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleAnnouncement(a.id)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs transition-colors",
                            on
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {a.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {form.kind !== "prayer" && (
              <div className="space-y-1.5">
                <Label htmlFor="pi-notes">Notes</Label>
                <Textarea id="pi-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes" />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={save}>{dialog?.item ? "Save Changes" : "Add Item"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const LABEL_PLACEHOLDER: Record<ProgramItemKind, string> = {
  hymn:           "Opening Hymn",
  prayer:         "Invocation",
  sacrament:      "Administration of the Sacrament",
  business:       "Ward Business",
  announcements:  "Announcements",
  speaker:        "First Speaker",
  musical_number: "Musical Number",
  other:          "Item",
};

function ProgramItemDetail({
  item,
  annById,
}: {
  item: ProgramItem;
  annById: (id: string) => Announcement | undefined;
}) {
  const bits: React.ReactNode[] = [];

  if (item.kind === "announcements") {
    const titles = (item.announcementIds ?? []).map((id) => annById(id)?.title).filter(Boolean);
    if (titles.length > 0) {
      return <p className="mt-0.5 text-xs text-muted-foreground">{titles.join(" · ")}</p>;
    }
    return <p className="mt-0.5 text-xs text-muted-foreground/70 italic">None attached</p>;
  }

  if (item.person) {
    bits.push(
      <span key="p" className="flex items-center gap-1">
        <User className="h-3 w-3" /> {item.person}
      </span>,
    );
  }
  if (item.kind !== "hymn" && item.topic) bits.push(<span key="t">{item.topic}</span>);
  if (item.kind === "hymn" && item.topic) bits.push(<span key="ht">{item.topic}</span>);
  if (item.notes) bits.push(<span key="n">{item.notes}</span>);

  if (bits.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {bits}
    </div>
  );
}
