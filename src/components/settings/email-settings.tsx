"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Mail, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SETTLEMENT_EMAIL } from "@/lib/settlement-email";

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
  // Settlement link email template — blank falls back to the built-in default.
  const [settlementSubject, setSettlementSubject] = useState(DEFAULT_SETTLEMENT_EMAIL.subject);
  const [settlementBody, setSettlementBody] = useState(DEFAULT_SETTLEMENT_EMAIL.body);

  useEffect(() => {
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return setError(data.error);
        setConfig(data);
        setAddress(data.gmailAddress ?? "");
        if (data.settlementEmailSubject) setSettlementSubject(data.settlementEmailSubject);
        if (data.settlementEmailBody) setSettlementBody(data.settlementEmailBody);
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
          settlementEmailSubject: settlementSubject,
          settlementEmailBody: settlementBody,
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

            {/* Tithing-settlement link email — the message sent when a member is
                emailed their booking link. Saved with the button above; can also
                be tweaked per-send from the Tithing Settlement tab. */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Tithing settlement link email</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setSettlementSubject(DEFAULT_SETTLEMENT_EMAIL.subject);
                    setSettlementBody(DEFAULT_SETTLEMENT_EMAIL.body);
                    setSaved(false);
                  }}
                >
                  Reset to default
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Sent when you email a member their settlement booking link. Use{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{name}"}</code> for the
                member&rsquo;s first name and{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{link}"}</code> for their
                personal booking link — both are filled in per recipient when the email is sent.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="settlement-subject" className="text-xs">Subject</Label>
                <Input id="settlement-subject" value={settlementSubject}
                  onChange={(e) => { setSettlementSubject(e.target.value); setSaved(false); }}
                  placeholder={DEFAULT_SETTLEMENT_EMAIL.subject} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settlement-body" className="text-xs">Message</Label>
                <Textarea id="settlement-body" value={settlementBody} rows={9}
                  onChange={(e) => { setSettlementBody(e.target.value); setSaved(false); }}
                  placeholder={DEFAULT_SETTLEMENT_EMAIL.body} />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
