"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SETTLEMENT_EMAIL } from "@/lib/settlement-email";
import { DEFAULT_TASK_REMINDER } from "@/lib/task-reminder";

/**
 * Email templates. The app doesn't send email itself — these prefill the drafts
 * it opens in the user's own mail app from the Tasks and Tithing Settlement
 * pages. Email from the assistant goes through the client's email connector.
 */
export function EmailSettingsCard() {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // Settlement link email template — blank falls back to the built-in default.
  const [settlementSubject, setSettlementSubject] = useState(DEFAULT_SETTLEMENT_EMAIL.subject);
  const [settlementBody, setSettlementBody] = useState(DEFAULT_SETTLEMENT_EMAIL.body);
  // Task reminder email template — blank falls back to the built-in default.
  const [reminderSubject, setReminderSubject] = useState(DEFAULT_TASK_REMINDER.subject);
  const [reminderBody, setReminderBody] = useState(DEFAULT_TASK_REMINDER.body);

  useEffect(() => {
    fetch("/api/settings/email")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return setError(data.error);
        setLoaded(true);
        if (data.settlementEmailSubject) setSettlementSubject(data.settlementEmailSubject);
        if (data.settlementEmailBody) setSettlementBody(data.settlementEmailBody);
        if (data.taskReminderSubject) setReminderSubject(data.taskReminderSubject);
        if (data.taskReminderBody) setReminderBody(data.taskReminderBody);
      })
      .catch(() => setError("Couldn't load email settings."));
  }, []);

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settlementEmailSubject: settlementSubject,
          settlementEmailBody: settlementBody,
          taskReminderSubject: reminderSubject,
          taskReminderBody: reminderBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
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
          <Mail className="h-4 w-4 text-primary" /> Email templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          These prefill the email drafts the app opens in your own mail app from the
          Tasks and Tithing Settlement pages. You can still edit each draft before sending.
        </p>

        {!loaded ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Tithing-settlement link email — the draft opened when a member is
                emailed their booking link. Can also be tweaked per-send from the
                Tithing Settlement tab. */}
            <div className="space-y-3">
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
                Prefilled when you email a member their settlement booking link. Use{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{title}"}</code> for their
                courtesy title (Brother/Sister),{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{name}"}</code> for their
                first name,{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{lastName}"}</code> for their
                last name, and{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{link}"}</code> for their
                personal booking link — all filled in when the draft opens. When
                several people are emailed at once, the greeting reads &ldquo;Brothers and
                Sisters&rdquo; and they&rsquo;re added as BCC. When a member&rsquo;s gender isn&rsquo;t on
                file, <code className="rounded bg-muted px-1 py-0.5">{"{title}"}</code> is left blank.
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

            {/* Task reminder email — the default message prefilled when you send a
                task's owner a reminder from the Tasks page (editable per-send) and
                used by the AI assistant's reminder tool. Saved with the button below. */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Task reminder email</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setReminderSubject(DEFAULT_TASK_REMINDER.subject);
                    setReminderBody(DEFAULT_TASK_REMINDER.body);
                    setSaved(false);
                  }}
                >
                  Reset to default
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The default reminder prefilled when you email a task&rsquo;s owner from the
                Tasks page (you can still edit it before sending) and used by the AI
                assistant. Use{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{name}"}</code> for the
                owner&rsquo;s first name,{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{task}"}</code> for the task
                title,{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{description}"}</code> for its
                notes, and{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{due}"}</code> for a
                &ldquo;Due: &hellip;&rdquo; line — all filled in per task. Lines that hold only{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{description}"}</code> or{" "}
                <code className="rounded bg-muted px-1 py-0.5">{"{due}"}</code> are dropped when
                the task has none.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-subject" className="text-xs">Subject</Label>
                <Input id="reminder-subject" value={reminderSubject}
                  onChange={(e) => { setReminderSubject(e.target.value); setSaved(false); }}
                  placeholder={DEFAULT_TASK_REMINDER.subject} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-body" className="text-xs">Message</Label>
                <Textarea id="reminder-body" value={reminderBody} rows={9}
                  onChange={(e) => { setReminderBody(e.target.value); setSaved(false); }}
                  placeholder={DEFAULT_TASK_REMINDER.body} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save templates
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
