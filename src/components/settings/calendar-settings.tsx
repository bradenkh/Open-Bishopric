"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Copy, CalendarClock, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Calendar feed panel. Turns the interview board into a read-only iCalendar
 * feed the bishopric can subscribe to from Google Calendar (or any calendar
 * app). The unguessable token in the URL is the credential — so the URL is
 * shown only to signed-in bishopric members, and can be rotated (invalidating
 * the old URL) or disabled entirely. One-way: the app never reads the calendar.
 */
export function CalendarSettingsCard() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/calendar")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setToken(data.token ?? null);
      })
      .catch(() => setError("Couldn't load calendar settings."))
      .finally(() => setLoading(false));
  }, []);

  // The full subscribe URL. The ".ics" suffix is cosmetic — the route strips it —
  // but it helps some clients recognize the feed.
  const feedUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/api/calendar/${token}.ics`
      : "";

  const generate = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/settings/calendar", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate feed");
      setToken(data.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate feed");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!confirm("Disable the calendar feed? Anyone already subscribed will stop receiving updates, and the current link will stop working.")) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/settings/calendar", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to disable feed");
      setToken(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable feed");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the link and copy manually.");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" /> Calendar feed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Subscribe to the ward&rsquo;s scheduled interviews from Google Calendar (or
          any calendar app). It&rsquo;s a one-way, read-only mirror — changes on the
          interview board flow to your calendar automatically; edits in your
          calendar never touch the app. Anyone with the link can see the
          appointments, so share it only within the bishopric.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : token ? (
          <>
            <div className="flex items-center gap-2">
              <Input value={feedUrl} readOnly onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button variant="outline" size="icon" className="shrink-0" onClick={copy} title="Copy link">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Add to Google Calendar</p>
              <ol className="list-decimal pl-5 space-y-0.5">
                <li>Open Google Calendar on the web.</li>
                <li>Next to <span className="font-medium">Other calendars</span>, click <span className="font-medium">+</span> → <span className="font-medium">From URL</span>.</li>
                <li>Paste the link above and click <span className="font-medium">Add calendar</span>.</li>
              </ol>
              <p className="pt-1">Google refreshes subscribed calendars every several hours, so new appointments may take a little while to appear.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={generate} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regenerate link
              </Button>
              <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={disable} disabled={busy}>
                <Trash2 className="h-4 w-4" /> Disable feed
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Regenerating creates a new link and immediately invalidates the old one —
              use it if a link was shared too widely.
            </p>
          </>
        ) : (
          <Button className="gap-1.5" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Generate feed link
          </Button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
