"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, CalendarPlus, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INTERVIEW_TYPE_LABELS } from "@/types";
import type { InterviewType } from "@/types";
import { BOOKING_PAGE_TYPES, type BookingPageUrls } from "@/lib/booking-pages";

/**
 * Google booking-page URLs, one per interview type. Members self-book through
 * these pages; the app emails each member the page for their interview type, and
 * the resulting bookings flow back in through the calendar subscription. A blank
 * field means that type has no booking page yet (the app falls back to its own
 * booking link where one still applies).
 */
export function BookingPagesCard() {
  const [urls, setUrls] = useState<BookingPageUrls>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/calendar")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setUrls(d.bookingPageUrls ?? {});
      })
      .catch(() => setError("Couldn't load booking-page settings."))
      .finally(() => setLoading(false));
  }, []);

  const setUrl = (type: InterviewType, value: string) =>
    setUrls((prev) => ({ ...prev, [type]: value }));

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/settings/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingPageUrls: urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
          <CalendarPlus className="h-4 w-4 text-primary" /> Google booking pages
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Paste the Google Calendar booking-page link for each interview type
          (Google Calendar → <span className="font-medium">Create</span> →
          <span className="font-medium"> Appointment schedule</span> → share the
          booking page). Members receive the page for their interview type and
          book themselves; the appointment then appears through the calendar
          subscription above. Leave a type blank if it has no booking page yet.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {BOOKING_PAGE_TYPES.map((type) => (
                <div key={type} className="space-y-1.5">
                  <Label htmlFor={`booking-${type}`} className="text-xs">
                    {INTERVIEW_TYPE_LABELS[type]}
                  </Label>
                  <Input
                    id={`booking-${type}`}
                    value={urls[type] ?? ""}
                    onChange={(e) => setUrl(type, e.target.value)}
                    placeholder="https://calendar.app.google/…"
                    className="font-mono text-xs"
                  />
                </div>
              ))}
            </div>

            <Button className="gap-1.5" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saved ? "Saved" : "Save booking pages"}
            </Button>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
