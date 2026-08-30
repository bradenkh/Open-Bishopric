"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Mail, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EmailConfig {
  gmailAddress: string;
  connected: boolean;
}

/**
 * Email (Gmail) configuration panel. The bishopric enters a Gmail address and a
 * 16-character app password (2FA required — Google Account → Security → App
 * passwords); the app then sends and receives on that mailbox with no domain and
 * no OAuth. The password is write-only: it's stored server-side and never sent
 * back to the browser (GET reports only whether one is configured).
 */
export function EmailSettingsCard() {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [address, setAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return setError(data.error);
        setConfig(data);
        setAddress(data.gmailAddress ?? "");
      })
      .catch(() => setError("Couldn't load email settings."));
  }, []);

  const save = async () => {
    setSaving(true); setError(""); setSaved(false); setTestMsg("");
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gmailAddress: address,
          // Only send the password when the user typed a new one.
          ...(appPassword ? { appPassword } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setConfig({
        gmailAddress: address,
        connected: Boolean(address) && (Boolean(appPassword) || (config?.connected ?? false)),
      });
      setAppPassword("");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true); setError(""); setTestMsg(""); setSaved(false);
    try {
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setTestMsg(`Test email sent to ${data.to}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send test email");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" /> Email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Lets the app send agenda requests, to-do reminders, and interview times —
          and read the replies — from a Gmail account. Turn on{" "}
          <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="underline">
            2-Step Verification
          </a>
          , then create an{" "}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline">
            App Password
          </a>{" "}
          and paste it below. It never expires and is stored securely on the server.
          Tip: use a dedicated ward Gmail so mail doesn&rsquo;t come from a personal address.
        </p>

        {!config ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gmail-address">Gmail address</Label>
                <Input id="gmail-address" type="email" autoComplete="off" value={address}
                  onChange={(e) => { setAddress(e.target.value); setSaved(false); }}
                  placeholder="firstwardbishopric@gmail.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gmail-app-password">App password</Label>
                <Input id="gmail-app-password" type="password" autoComplete="off" value={appPassword}
                  onChange={(e) => { setAppPassword(e.target.value); setSaved(false); }}
                  placeholder={config.connected ? "•••••••• (leave blank to keep current)" : "abcd efgh ijkl mnop"} />
                {config.connected && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Check className="h-3 w-3 text-green-600" /> An app password is configured.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={save} disabled={saving || !address}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save email settings
              </Button>
              <Button variant="outline" onClick={sendTest} disabled={testing || !config.connected} className="gap-1.5">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test email
              </Button>
              {saved && <span className="text-sm text-green-600 flex items-center gap-1"><Check className="h-4 w-4" /> Saved</span>}
              {testMsg && <span className="text-sm text-green-600 flex items-center gap-1"><Check className="h-4 w-4" /> {testMsg}</span>}
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
