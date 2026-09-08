"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, CalendarClock, RefreshCw, Rss, Save, Ban, X, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Calendar subscription settings. The app reads the bishop's Google Calendar via
 * its secret iCal address and ingests the appointments members self-book through
 * Google's booking pages. One-way and read-only — the app never changes the
 * calendar. Paste the URL, then Sync now (or let a periodic sync pick it up).
 */
export function CalendarSettingsCard() {
  const [icalUrl, setIcalUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ matched: number; unmatched: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [error, setError] = useState("");
  const [ignoredTitles, setIgnoredTitles] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [titleBusy, setTitleBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/calendar").then((r) => r.json()),
      fetch("/api/calendar/sync").then((r) => r.json()).catch(() => null),
      fetch("/api/calendar/ignored-titles").then((r) => r.json()).catch(() => null),
    ])
      .then(([settings, sync, ignored]) => {
        if (settings.error) setError(settings.error);
        else {
          setIcalUrl(settings.icalUrl ?? "");
          setSavedUrl(settings.icalUrl ?? "");
        }
        if (sync && !sync.error) {
          setSyncedAt(sync.syncedAt ?? null);
          setCounts({ matched: sync.matched ?? 0, unmatched: sync.unmatched ?? 0 });
        }
        if (ignored && !ignored.error) setIgnoredTitles(ignored.titles ?? []);
      })
      .catch(() => setError("Couldn't load calendar settings."))
      .finally(() => setLoading(false));
  }, []);

  const addTitle = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setTitleBusy(true); setError("");
    try {
      const res = await fetch("/api/calendar/ignored-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      setIgnoredTitles(data.titles ?? []);
      setNewTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setTitleBusy(false);
    }
  };

  const removeTitle = async (title: string) => {
    setTitleBusy(true); setError("");
    try {
      const res = await fetch("/api/calendar/ignored-titles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove");
      setIgnoredTitles(data.titles ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setTitleBusy(false);
    }
  };

  const saveUrl = async () => {
    setSavingUrl(true); setError("");
    try {
      const res = await fetch("/api/settings/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icalUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save the URL");
      setSavedUrl(icalUrl.trim());
      setUrlSaved(true);
      setTimeout(() => setUrlSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the URL");
    } finally {
      setSavingUrl(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true); setError(""); setSyncMsg("");
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
      setError(e instanceof Error ? e.message : "Sync failed");
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
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Rss className="h-4 w-4 text-primary" />
          <p className="font-medium text-sm">Subscribe to the bishop&rsquo;s calendar</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Paste the bishop&rsquo;s Google Calendar <span className="font-medium">secret iCal
          address</span> (Google Calendar → Settings → your calendar →
          &ldquo;Secret address in iCal format&rdquo;). The app reads the
          appointments members book through Google&rsquo;s booking pages and links
          each one to a ward member. It&rsquo;s one-way and read-only — the app
          never changes your calendar. Google refreshes this feed only every few
          hours, so new bookings can take a while to appear.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
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

            {/* Always-ignore rules by event title */}
            <div className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium text-sm">Always-ignored event titles</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Events with these titles are skipped when reading the calendar, so recurring
                non-interview events (a weekly council, say) never show up. Add one here, or use
                &ldquo;Always ignore&rdquo; on a booking in the Scheduling → Bookings tab.
              </p>
              {ignoredTitles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {ignoredTitles.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
                      {t}
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                        onClick={() => removeTitle(t)}
                        disabled={titleBusy}
                        aria-label={`Stop ignoring "${t}"`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTitle(); } }}
                  placeholder="Event title to ignore, e.g. Ward Council"
                  className="text-sm"
                />
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={addTitle} disabled={titleBusy || !newTitle.trim()}>
                  {titleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </Button>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
