"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Check, Copy, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { createClient } from "@/lib/supabase/client";
import type { WardInfo, WardLeader } from "@/types";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "bishop", label: "Bishop" },
  { value: "counselor", label: "Counselor" },
  { value: "clerk", label: "Clerk" },
  { value: "exec_secretary", label: "Executive Secretary" },
];

/** AppUser.role is hyphenated; the API + selects use the underscore DB form. */
const toDbRole = (appRole: string) => appRole.replace(/-/g, "_");

const BLANK_WARD: WardInfo = {
  wardName: "", churchName: "", stake: "", address: "",
  meetingTitle: "", meetingTime: "", leadership: [], submissionNote: "",
};

export default function SettingsPage() {
  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your account, ward details, and bishopric members.
        </p>
      </div>

      <AccountCard />
      <WardSettingsCard />
      <AIAssistantCard />
      <UsersCard />
    </div>
  );
}

// ── AI assistant ───────────────────────────────────────────────────────────────
const AI_PROVIDERS: { value: string; label: string }[] = [
  { value: "openai-compat", label: "Z.AI / GLM (OpenAI-compatible)" },
  { value: "deepseek", label: "DeepSeek" },
];

interface AIConfig {
  provider: string;
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
}

function AIAssistantCard() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/ai")
      .then((r) => r.json())
      .then((data) => { if (!data.error) setConfig(data); })
      .catch(() => setError("Couldn't load AI settings."));
  }, []);

  const set = (patch: Partial<AIConfig>) => {
    setConfig((c) => (c ? { ...c, ...patch } : c));
    setSaved(false);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.provider,
          model: config.model,
          baseUrl: config.baseUrl,
          // Only send the key when the user typed a new one.
          ...(apiKey ? { apiKey } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setConfig({ ...config, hasApiKey: apiKey ? true : config.hasApiKey });
      setApiKey("");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> AI assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Powers the chat assistant. The free GLM flash model works well and handles one
          request at a time — requests are queued automatically. Your API key is stored
          securely on the server and never shown here.
        </p>

        {!config ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Provider</Label>
                <Select value={config.provider} onValueChange={(v) => set({ provider: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-model">Model</Label>
                <Input id="ai-model" value={config.model}
                  onChange={(e) => set({ model: e.target.value })} placeholder="glm-4.7-flash" />
              </div>
            </div>

            {config.provider === "openai-compat" && (
              <div className="space-y-1.5">
                <Label htmlFor="ai-base-url">Base URL</Label>
                <Input id="ai-base-url" value={config.baseUrl}
                  onChange={(e) => set({ baseUrl: e.target.value })} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ai-api-key">API key</Label>
              <Input id="ai-api-key" type="password" autoComplete="off" value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
                placeholder={config.hasApiKey ? "•••••••• (leave blank to keep current key)" : "Paste your API key"} />
              {config.hasApiKey && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Check className="h-3 w-3 text-green-600" /> A key is configured.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save AI settings
              </Button>
              {saved && <span className="text-sm text-green-600 flex items-center gap-1"><Check className="h-4 w-4" /> Saved</span>}
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Account ──────────────────────────────────────────────────────────────────
function AccountCard() {
  const { appUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const changePassword = async () => {
    setMsg(null);
    if (password.length < 8) return setMsg({ ok: false, text: "Password must be at least 8 characters." });
    if (password !== confirm) return setMsg({ ok: false, text: "Passwords don't match." });
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setPassword(""); setConfirm("");
    setMsg({ ok: true, text: "Password updated." });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{appUser?.email}</span>
          {appUser && <Badge variant="outline" className="capitalize">{appUser.role.replace(/-/g, " ")}</Badge>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input id="new-password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input id="confirm-password" type="password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        {msg && (
          <p className={`text-sm ${msg.ok ? "text-green-600" : "text-destructive"}`}>{msg.text}</p>
        )}
        <Button onClick={changePassword} disabled={saving || !password}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Update password
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Ward settings ─────────────────────────────────────────────────────────────
function WardSettingsCard() {
  const { wardInfo, updateWardInfo } = useData();
  const [form, setForm] = useState<WardInfo>(wardInfo ?? BLANK_WARD);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Seed the form from ward info once it loads (render-time sync — no effect).
  const [seededFrom, setSeededFrom] = useState(wardInfo);
  if (wardInfo && wardInfo !== seededFrom) {
    setSeededFrom(wardInfo);
    setForm(wardInfo);
  }

  const set = (patch: Partial<WardInfo>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); };
  const setLeader = (i: number, patch: Partial<WardLeader>) =>
    set({ leadership: form.leadership.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) });
  const addLeader = () => set({ leadership: [...form.leadership, { name: "", role: "" }] });
  const removeLeader = (i: number) => set({ leadership: form.leadership.filter((_, idx) => idx !== i) });

  const save = async () => {
    setSaving(true);
    await updateWardInfo(form);
    setSaving(false);
    setSaved(true);
  };

  const field = (key: keyof WardInfo, label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} value={(form[key] as string) ?? ""} onChange={(e) => set({ [key]: e.target.value } as Partial<WardInfo>)} />
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Ward settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {field("wardName", "Ward name")}
          {field("stake", "Stake")}
          {field("churchName", "Church name")}
          {field("address", "Address")}
          {field("meetingTitle", "Meeting title")}
          {field("meetingTime", "Meeting time")}
        </div>

        <div className="space-y-1.5">
          <Label>Bulletin submission note</Label>
          <Input value={form.submissionNote} onChange={(e) => set({ submissionNote: e.target.value })} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Leadership (bulletin letterhead)</Label>
            <Button variant="outline" size="sm" onClick={addLeader} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {form.leadership.map((leader, i) => (
            <div key={i} className="flex gap-2">
              <Input placeholder="Name" value={leader.name} onChange={(e) => setLeader(i, { name: e.target.value })} />
              <Input placeholder="Role" value={leader.role} onChange={(e) => setLeader(i, { role: e.target.value })} />
              <Input placeholder="Phone" value={leader.phone ?? ""} onChange={(e) => setLeader(i, { phone: e.target.value })} />
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeLeader(i)} title="Remove">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save ward settings
          </Button>
          {saved && <span className="text-sm text-green-600 flex items-center gap-1"><Check className="h-4 w-4" /> Saved</span>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Users (bishop only) ───────────────────────────────────────────────────────
function UsersCard() {
  const { profiles, reloadProfiles } = useData();
  const { appUser } = useAuth();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("counselor");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const invite = async () => {
    setError(""); setCreated(null); setInviting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add user");
      setCreated({ email, tempPassword: data.tempPassword });
      setEmail(""); setDisplayName(""); setRole("counselor");
      await reloadProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add user");
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (id: string, newRole: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await reloadProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change role");
    } finally {
      setBusyId(null);
    }
  };

  const removeUser = async (id: string) => {
    if (!confirm("Remove this user's access?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      await reloadProfiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove user");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Bishopric members</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {profiles.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No users yet.</li>
          )}
          {profiles.map((p) => (
            <li key={p.uid} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{p.email}</p>
              </div>
              <Select value={toDbRole(p.role)} onValueChange={(v) => changeRole(p.uid, v)} disabled={busyId === p.uid}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {p.uid !== appUser?.uid && (
                <Button variant="ghost" size="icon" className="shrink-0" disabled={busyId === p.uid}
                  onClick={() => removeUser(p.uid)} title="Remove user">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>

        {/* Invite */}
        <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
          <p className="text-sm font-medium">Add a bishopric member</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={invite} disabled={inviting || !email} className="gap-1">
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add member
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {created && <TempPasswordNotice email={created.email} tempPassword={created.tempPassword} />}
        </div>
      </CardContent>
    </Card>
  );
}

function TempPasswordNotice({ email, tempPassword }: { email: string; tempPassword: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 p-3 text-sm">
      <p className="font-medium text-green-800 dark:text-green-300">
        Account created for {email}
      </p>
      <p className="text-green-700 dark:text-green-400 mt-1">
        Share this temporary password — they can change it under Settings → Account:
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="rounded bg-background px-2 py-1 font-mono text-xs">{tempPassword}</code>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => {
          navigator.clipboard?.writeText(tempPassword); setCopied(true);
        }}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
        </Button>
      </div>
    </div>
  );
}

