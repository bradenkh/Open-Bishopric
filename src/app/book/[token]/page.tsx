"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { CalendarClock, Clock, User, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatDateWithWeekday } from "@/lib/utils";

// ── Public, token-authenticated self-signup page (no login) ──────────────────
// It talks only to /api/book/[token]; the token in the URL is the credential.

interface Slot {
  date: string;
  time: string;
  endTime: string;
  memberId: string;
  memberName: string;
}
interface DayGroup {
  date: string;
  slots: Slot[];
}
interface BookingInfo {
  memberName: string;
  purpose: string;
  year?: number;
  durationMins?: number;
  days?: DayGroup[];
  state: "used" | "expired" | null;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function dayHeading(dateStr: string): string {
  return formatDateWithWeekday(dateStr);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Image src="/logo.png" alt="" width={48} height={48} priority className="h-12 w-12 rounded-2xl" />
          <h1 className="text-xl font-bold tracking-tight">Tithing Settlement</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      {children}
    </div>
  );
}

export default function BookingPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState<{ date: string; time: string; interviewer: string } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/book/${token}`);
        if (!active) return;
        if (res.status === 404) {
          setError("This scheduling link isn’t valid. Please check with the bishopric.");
          return;
        }
        if (!res.ok) {
          setError("Something went wrong loading your scheduling page.");
          return;
        }
        setInfo(await res.json());
      } catch {
        if (active) setError("Couldn’t reach the server. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const totalSlots = useMemo(
    () => (info?.days ?? []).reduce((n, d) => n + d.slots.length, 0),
    [info],
  );

  async function handleBook() {
    if (!selected) return;
    setBooking(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selected.date,
          time: selected.time,
          interviewer: selected.memberName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Booking failed. Please try again.");
        // A 409 means the slot/link changed — refresh the open slots.
        if (res.status === 409) {
          const refreshed = await fetch(`/api/book/${token}`).then((r) => r.json()).catch(() => null);
          if (refreshed) setInfo(refreshed);
          setSelected(null);
        }
        return;
      }
      setConfirmed({ date: data.date, time: data.time, interviewer: data.interviewer });
    } catch {
      setError("Couldn’t reach the server. Please try again.");
    } finally {
      setBooking(false);
    }
  }

  // ── Render states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Shell>
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (error && !info) {
    return (
      <Shell>
        <Card className="text-center">
          <p className="text-sm text-muted-foreground">{error}</p>
        </Card>
      </Shell>
    );
  }

  if (confirmed) {
    return (
      <Shell>
        <Card className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
          <div className="space-y-1">
            <p className="text-lg font-semibold">You’re booked!</p>
            <p className="text-sm text-muted-foreground">
              {info?.memberName}, your tithing settlement is scheduled for{" "}
              <strong>{formatDate(confirmed.date)}</strong> at{" "}
              <strong>{formatTime(confirmed.time)}</strong> with{" "}
              <strong>{confirmed.interviewer}</strong>.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            You can close this page. If you need to change your time, contact the bishopric.
          </p>
        </Card>
      </Shell>
    );
  }

  if (info?.state === "used") {
    return (
      <Shell>
        <Card className="text-center space-y-2">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
          <p className="text-sm text-muted-foreground">
            This link has already been used to book a time. If that wasn’t you or you
            need to reschedule, please contact the bishopric.
          </p>
        </Card>
      </Shell>
    );
  }

  if (info?.state === "expired") {
    return (
      <Shell>
        <Card className="text-center">
          <p className="text-sm text-muted-foreground">
            This scheduling link has expired. Please contact the bishopric for a new one.
          </p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="space-y-2">
        <p className="text-sm">
          Hi <strong>{info?.memberName}</strong> — pick a time for your
          {info?.year ? ` ${info.year}` : ""} tithing settlement
          {info?.durationMins ? ` (${info.durationMins} min)` : ""}.
        </p>
        <p className="text-xs text-muted-foreground">
          {totalSlots > 0
            ? `${totalSlots} open time${totalSlots !== 1 ? "s" : ""} available.`
            : "No open times right now."}
        </p>
      </Card>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {totalSlots === 0 ? (
        <Card className="text-center">
          <p className="text-sm text-muted-foreground">
            There aren’t any open times available yet. Please check back soon, or reach
            out to the bishopric.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {(info?.days ?? []).map(({ date, slots }) => (
            <Card key={date} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {dayHeading(date)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {slots.map((s) => {
                  const isSel =
                    selected?.date === s.date &&
                    selected?.time === s.time &&
                    selected?.memberName === s.memberName;
                  return (
                    <button
                      key={`${s.date}-${s.time}-${s.memberId}`}
                      type="button"
                      onClick={() => setSelected(s)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-left",
                        isSel
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-foreground border-border hover:bg-accent",
                      )}
                    >
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatTime(s.time)}
                      </span>
                      <span
                        className={cn(
                          "flex items-center gap-1 text-[11px]",
                          isSel ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        <User className="h-3 w-3" /> {s.memberName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <div className="sticky bottom-4 space-y-2">
          <Card className="border-primary/30">
            <p className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-primary shrink-0" />
              <span>
                <strong>{formatDate(selected.date)}</strong> at{" "}
                <strong>{formatTime(selected.time)}</strong> with{" "}
                <strong>{selected.memberName}</strong>
              </span>
            </p>
          </Card>
          <Button className="w-full rounded-xl" size="lg" onClick={handleBook} disabled={booking}>
            {booking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Booking…
              </>
            ) : (
              "Confirm this time"
            )}
          </Button>
        </div>
      )}
    </Shell>
  );
}
