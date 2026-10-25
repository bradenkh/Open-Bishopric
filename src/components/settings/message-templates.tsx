"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_SETTLEMENT_EMAIL } from "@/lib/settlement-email";
import { DEFAULT_TASK_REMINDER } from "@/lib/task-reminder";

/**
 * Message templates panel. The app sends no email: the tithing-settlement
 * invitation and task reminders are copied from the app and sent through LCR,
 * Member Tools or the user's own mail client. Blank fields fall back to the
 * built-in defaults.
 */
export function MessageTemplatesCard() {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [settlementSubject, setSettlementSubject] = useState(DEFAULT_SETTLEMENT_EMAIL.subject);
  const [settlementBody, setSettlementBody] = useState(DEFAULT_SETTLEMENT_EMAIL.body);
  const [reminderSubject, setReminderSubject] = useState(DEFAULT_TASK_REMINDER.subject);
  const [reminderBody, setReminderBody] = useState(DEFAULT_TASK_REMINDER.body);

  useEffect(() => {
    fetch("/api/settings/templates")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return setError(data.error);
        if (data.settlementSubject) setSettlementSubject(data.settlementSubject);
        if (data.settlementBody) setSettlementBody(data.settlementBody);
        if (data.taskReminderSubject) setReminderSubject(data.taskReminderSubject);
        if (data.taskReminderBody) setReminderBody(data.taskReminderBody);
        setLoaded(true);
      })
      .catch(() => setError("Couldn't load message templates."));
  }, []);

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/settings/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settlementSubject, settlementBody,
          taskReminderSubject: reminderSubject, taskReminderBody: reminderBody,
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

  const code = (s: string) => <code className="rounded bg-muted px-1 py-0.5">{s}</code>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" /> Message templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The app doesn&rsquo;t send email. These are the messages you copy from the app
          and send through LCR, Member Tools, or your own email.
        </p>

        {!loaded && !error ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Tithing-settlement invitation — copied from the Tithing Settlement tab. */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Tithing settlement invitation</Label>
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs"
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
                Copied from the Tithing Settlement tab (&ldquo;Copy message&rdquo;). Use{" "}
                {code("{link}")} for the booking link. In a copied message,{" "}
                {code("{title} {lastName}")} becomes &ldquo;Brothers and Sisters&rdquo; and{" "}
                {code("{name}")} is left blank.
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

            {/* Task reminder — prefilled when you copy a reminder from the Tasks page. */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Task reminder</Label>
                <Button
                  variant="ghost" size="sm" className="h-7 text-xs"
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
                Prefilled when you copy a reminder from the Tasks page (editable before you
                copy it). Use {code("{name}")} for the owner&rsquo;s first name,{" "}
                {code("{task}")} for the task title, {code("{description}")} for its notes,
                and {code("{due}")} for a &ldquo;Due: &hellip;&rdquo; line. Lines that hold
                only {code("{description}")} or {code("{due}")} are dropped when the task has
                none.
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

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save templates
              </Button>
              {saved && <span className="text-sm text-green-600 flex items-center gap-1"><Check className="h-4 w-4" /> Saved</span>}
            </div>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
