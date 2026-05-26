"use client";

import { useState } from "react";
import { Search, Plus, UserCircle, Phone, Mail, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import type { Member } from "@/types";
import { MOCK_MEMBERS } from "@/lib/mock-data";

const EMPTY_FORM = { firstName: "", lastName: "", email: "", phone: "", address: "", notes: "" };

export default function MembersPage() {
  const { user } = useAuth();
  const [members,    setMembers]   = useState<Member[]>([...MOCK_MEMBERS]);
  const [search,     setSearch]    = useState("");
  const [dialogOpen, setDialogOpen]= useState(false);
  const [editing,    setEditing]   = useState<Member | null>(null);
  const [form,       setForm]      = useState(EMPTY_FORM);
  const [saving,     setSaving]    = useState(false);

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    return (
      m.firstName.toLowerCase().includes(q) ||
      m.lastName.toLowerCase().includes(q)  ||
      m.email?.toLowerCase().includes(q)    ||
      m.phone?.includes(q)
    );
  });

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    setForm({ firstName: m.firstName, lastName: m.lastName, email: m.email ?? "", phone: m.phone ?? "", address: m.address ?? "", notes: m.notes ?? "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 150));
    const now = new Date().toISOString();
    if (editing) {
      setMembers((prev) => prev.map((m) => m.id === editing.id ? { ...m, ...form, updatedAt: now } : m));
    } else {
      const newMember: Member = { id: `m-${Date.now()}`, ...form, isActive: true, createdBy: user?.uid ?? "mock", createdAt: now, updatedAt: now } as Member & { createdBy: string };
      // Sort new member into the list by last name
      setMembers((prev) => [...prev, newMember].sort((a, b) => a.lastName.localeCompare(b.lastName)));
    }
    setDialogOpen(false);
    setSaving(false);
  }

  return (
    <div className="p-4 lg:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
        <Button onClick={openNew} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Add Member
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <UserCircle className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">{search ? "No members match your search" : "No members yet"}</p>
          {!search && <Button onClick={openNew} variant="outline" size="sm">Add your first member</Button>}
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          {filtered.map((m) => (
            <li key={m.id} className="flex items-center gap-3 bg-card px-4 py-3 hover:bg-accent/50 transition-colors">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary uppercase">
                {m.firstName[0]}{m.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{m.firstName} {m.lastName}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  {m.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {m.email}</span>}
                  {m.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" /> {m.phone}</span>}
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => openEdit(m)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Member" : "Add Member"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.firstName.trim() || !form.lastName.trim()}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
