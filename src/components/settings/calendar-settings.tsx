"use client";

import { useEffect, useState } from "react";
import {
  Loader2, Check, Copy, CalendarClock, RefreshCw, Trash2, Rss, Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Calendar settings — two panels reflecting the calendar strategy.
 *
 * 1. Subscribe to the bishop's calendar (current): the app reads the bishop's
 *    Google Calendar via its secret iCal address and ingests the appointments
 *    members self-book through Google's booking pages. One-way, read-only.
 *
 * 2. Outbound feed (legacy): the older direction — the app mirroring its own
 *    interview board out to Google as a subscribe-by-URL feed. Kept for now while
 *    the strategy transitions.
 */
export function CalendarSettingsCard() {
  // ── Inbound subscription state ──────────────────────────────────────────────
  const [icalUrl, setIcalUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ matched: number; unmatched: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncError, setSyncError] = useState("");

  // ── Outbound feed state ─────────────────────────────────────────────────────
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/calendar").then((r) => r.json()),
      fetch("/api/calendar/sync").then((r) => r.json()).catch(() => null),
    ])
      .then(([settings, sync]) => {
        if (settings.error) setError(settings.error);
        else {
          setToken(settings.token ?? null);
          setIcalUrl(settings.icalUrl ?? "");
          setSavedUrl(settings.icalUrl ?? "");
        }
        if (sync && !sync.error) {
          setSyncedAt(sync.syncedAt ?? null);
          setCounts({ matched: sync.matched ?? 0, unmatched: sync.unmatched ?? 0 });
        }
      })
      .catch(() => setError("Couldn't load calendar settings."))
      .finally(() => setLoading(false));
  }, []);

  const feedUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/api/calendar/${token}.ics`
      : "";

  // ── Inbound actions ─────────────────────────────────────────────────────────
  const saveUrl = async () => {
    setSavingUrl(true); setSyncError("");
    try {
      const res = await fetch("/api/settings/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icalUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save the URL");
      setSavedUrl(data.icalUrl ?? "");
      setUrlSaved(true);
      setTimeout(() => setUrlSaved(false), 2000);
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Failed to save the URL");
    } finally {
      setSavingUrl(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true); setSyncError(""); setSyncMsg("");
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setSyncedAt(data.syncedAt ?? null);
      setCounts({ matched: data.matched ?? 0, unmatched: data.unmatched ?? 0 });
      setSyncMsg(
        `Read ${data.fetched} appointment${data.fetched === 1 ? "" : "s"} — ` +
        `${data.matched} matched, ${data.unmatched} unmatched.`,
      );
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const urlDirty = icalUrl.trim() !== savedUrl.trim();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" /> Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Inbound subscription ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Rss className="h-4 w-4 text-primary" />
            <p className="font-medium text-sm">Subscribe to the bishop&rsquo;s calendar</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Paste the bishop&rsquo;s Google Calendar <span className="font-medium">secret iCal
            address</span> (Google Calendar → Settings → your calendar →
            &ldquo;Secret address in iCal format&rdquo;). The app reads the
            appointments members book through Google&rsquo;s booking pages and
            links each one to a ward member. It&rsquo;s one-way and read-only —
            the app never changes your calendar. Google refreshes this feed only
            every few hours, so new bookings can take a while to appear.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="ical-url" className="text-xs">Secret iCal URL</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ical-url"
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={saveUrl}
                disabled={savingUrl || !urlDirty}
                title="Save URL"
              >
                {savingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : urlSaved ? <Check className="h-4 w-4 text-green-600" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={syncNow}
              disabled={syncing || !savedUrl}
              title={savedUrl ? "Fetch the latest appointments now" : "Save a URL first"}
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync now
            </Button>
            {syncedAt && (
              <span className="text-xs text-muted-foreground">
                Last synced {new Date(syncedAt).toLocaleString()}
                {counts && ` · ${counts.matched} matched, ${counts.unmatched} unmatched`}
              </span>
            )}
          </div>

          {syncMsg && <p className="text-sm text-green-600">{syncMsg}</p>}
          {syncError && <p className="text-sm text-destructive">{syncError}</p>}
        </div>

        <div className="border-t border-border" />

        {/* ── Outbound feed (legacy) ───────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="font-medium text-sm">Outbound feed (legacy)</p>
          <p className="text-sm text-muted-foreground">
            The older direction — mirror the app&rsquo;s interview board out to
            Google Calendar as a read-only feed. Being phased out in favor of the
            subscription above. Anyone with the link can see the appointments, so
            share it only within the bishopric.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : token ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={feedUrl} readOnly onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                <Button variant="outline" size="icon" className="shrink-0" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(feedUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setError("Couldn't copy — select the link and copy manually.");
                  }
                }} title="Copy link">
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => {
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
                }} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Regenerate link
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={async () => {
                  if (!confirm("Disable the outbound feed? Anyone already subscribed will stop receiving updates, and the current link will stop working.")) return;
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
                }} disabled={busy}>
                  <Trash2 className="h-4 w-4" /> Disable feed
                </Button>
              </div>
            </>
          ) : (
            <Button variant="outline" className="gap-1.5" onClick={async () => {
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
            }} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              Generate feed link
            </Button>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
