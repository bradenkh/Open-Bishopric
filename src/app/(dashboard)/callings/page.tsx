"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Plus, Church, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import type { Calling, CallingStage } from "@/types";
import { CALLING_STAGES } from "@/types";
import { cn } from "@/lib/utils";

const EMPTY_FORM = {
  memberName: "",
  position: "",
  organization: "",
  notes: "",
};

export default function CallingsPage() {
  const { user } = useAuth();
  const [callings, setCallings] = useState<Calling[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Calling | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function fetchCallings() {
    const snap = await getDocs(query(collection(db, "callings"), orderBy("createdAt", "desc")));
    setCallings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Calling)));
    setLoading(false);
  }

  useEffect(() => { fetchCallings(); }, []);

  async function advanceStage(calling: Calling) {
    const currentIndex = CALLING_STAGES.findIndex((s) => s.stage === calling.stage);
    if (currentIndex >= CALLING_STAGES.length - 1) return;
    const nextStage = CALLING_STAGES[currentIndex + 1].stage;
    await updateDoc(doc(db, "callings", calling.id), {
      stage: nextStage,
      updatedAt: new Date().toISOString(),
    });
    await fetchCallings();
  }

  async function handleCreate() {
    if (!form.memberName.trim() || !form.position.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    try {
      await addDoc(collection(db, "callings"), {
        ...form,
        stage: "identified" as CallingStage,
        memberId: "",
        createdBy: user?.uid ?? "",
        createdAt: now,
        updatedAt: now,
      });
      await fetchCallings();
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    } finally {
      setSaving(false);
    }
  }

  const activeCallings = callings.filter((c) => c.stage !== "recorded");
  const completedCallings = callings.filter((c) => c.stage === "recorded");

  return (
    <div className="h-full p-4 lg:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Callings</h1>
        <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Calling
        </Button>
      </div>

      {/* Desktop: pipeline view */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-7 gap-2">
          {CALLING_STAGES.filter((s) => s.stage !== "recorded").map(({ stage, label }) => {
            const stageCalls = activeCallings.filter((c) => c.stage === stage);
            return (
              <div key={stage} className="rounded-xl border border-border bg-muted/30 p-3 min-h-[200px]">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  {label}
                  {stageCalls.length > 0 && (
                    <span className="ml-1.5 text-primary">({stageCalls.length})</span>
                  )}
                </p>
                <div className="space-y-2">
                  {stageCalls.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg bg-card border border-border p-2.5 cursor-pointer hover:shadow-sm transition-shadow"
                      onClick={() => setSelected(c)}
                    >
                      <p className="text-xs font-medium leading-tight">{c.memberName}</p>
                      <p className="text-xs text-muted-foreground leading-tight mt-0.5 truncate">{c.position}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="rounded-xl border border-dashed border-border bg-muted/10 p-3 min-h-[200px]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Recorded
              {completedCallings.length > 0 && (
                <span className="ml-1.5">({completedCallings.length})</span>
              )}
            </p>
            <div className="space-y-2">
              {completedCallings.slice(0, 5).map((c) => (
                <div key={c.id} className="rounded-lg bg-card border border-border p-2.5 opacity-60">
                  <p className="text-xs font-medium">{c.memberName}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.position}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: list view */}
      <div className="lg:hidden space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : activeCallings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Church className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">No callings in progress</p>
            <Button onClick={() => setDialogOpen(true)} variant="outline" size="sm">
              Add a calling
            </Button>
          </div>
        ) : (
          activeCallings.map((calling) => {
            const stageIndex = CALLING_STAGES.findIndex((s) => s.stage === calling.stage);
            const progress = Math.round((stageIndex / (CALLING_STAGES.length - 1)) * 100);
            return (
              <div
                key={calling.id}
                className="rounded-xl border border-border bg-card p-4 space-y-3"
                onClick={() => setSelected(calling)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{calling.memberName}</p>
                    <p className="text-xs text-muted-foreground">{calling.position}</p>
                    {calling.organization && (
                      <p className="text-xs text-muted-foreground">{calling.organization}</p>
                    )}
                  </div>
                  <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full capitalize shrink-0">
                    {CALLING_STAGES[stageIndex].label}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Step {stageIndex + 1} of {CALLING_STAGES.length}</span>
                    <span>{progress}%</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Calling detail / advance stage dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.memberName}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Position:</span> {selected.position}</p>
                  {selected.organization && (
                    <p><span className="text-muted-foreground">Organization:</span> {selected.organization}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Progress</p>
                  <div className="space-y-1.5">
                    {CALLING_STAGES.map(({ stage, label }, i) => {
                      const current = CALLING_STAGES.findIndex((s) => s.stage === selected.stage);
                      return (
                        <div key={stage} className="flex items-center gap-2">
                          <div
                            className={cn(
                              "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0",
                              i < current
                                ? "border-green-500 bg-green-500"
                                : i === current
                                ? "border-primary bg-primary"
                                : "border-muted"
                            )}
                          >
                            {i <= current && (
                              <div className="h-2 w-2 rounded-full bg-white" />
                            )}
                          </div>
                          <span className={cn(
                            "text-sm",
                            i === current ? "font-medium" : i < current ? "text-muted-foreground line-through" : "text-muted-foreground"
                          )}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
                {selected.stage !== "recorded" && (
                  <Button
                    onClick={() => { advanceStage(selected); setSelected(null); }}
                    className="gap-2"
                  >
                    Advance Stage <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* New calling dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Calling</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="memberName">Member Name *</Label>
              <Input
                id="memberName"
                value={form.memberName}
                onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position">Position *</Label>
              <Input
                id="position"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                placeholder="e.g. Sunday School Teacher"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="organization">Organization</Label>
              <Input
                id="organization"
                value={form.organization}
                onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                placeholder="e.g. Sunday School"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="callingNotes">Notes</Label>
              <Input
                id="callingNotes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !form.memberName.trim() || !form.position.trim()}
            >
              {saving ? "Creating…" : "Create Calling"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
