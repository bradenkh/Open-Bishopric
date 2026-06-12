"use client";

import { useMemo } from "react";
import {
  ClipboardList, CalendarClock, Church, Calendar, ArrowRight, MessageSquare,
  CalendarPlus, Plus, Settings,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { INTERVIEW_STAGE_COLORS, INTERVIEW_STAGES, INTERVIEW_TYPE_LABELS, MEETING_TYPE_LABELS } from "@/types";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const { appUser } = useAuth();
  const data = useData();
  const callings = data.callings.items;
  const meetings = data.meetings.items;
  const interviews = data.interviews.items;

  // Compute stats from live ward data.
  const stats = useMemo(() => {
    const upcomingMeetings   = meetings.filter((m) => m.status === "upcoming").length;
    const needsScheduling    = interviews.filter((i) => i.stage === "schedule_any" || i.stage === "schedule_bishop").length;
    const upcomingInterviews = interviews.filter((i) => i.stage === "scheduled" || i.stage === "pending_confirmation").length;
    const callingsInProgress = callings.filter((c) => c.stage !== "recorded" && c.stage !== "needs_calling").length;
    const vacantCallings     = callings.filter((c) => c.stage === "needs_calling").length;
    return { upcomingMeetings, needsScheduling, upcomingInterviews, callingsInProgress, vacantCallings };
  }, [callings, meetings, interviews]);

  const upcomingMeetings = meetings
    .filter((m) => m.status === "upcoming")
    .sort((a, b) => new Date(`${a.date}T${a.time ?? "00:00"}`).getTime() - new Date(`${b.date}T${b.time ?? "00:00"}`).getTime())
    .slice(0, 4);

  const upcomingInterviews = interviews
    .filter((i) => i.stage === "schedule_any" || i.stage === "schedule_bishop" || i.stage === "pending_confirmation" || i.stage === "scheduled")
    .sort((a, b) => {
      // Unscheduled interviews surface first, then upcoming ones by date.
      const rank = (s: string) => (s === "schedule_any" || s === "schedule_bishop" ? 0 : 1);
      if (rank(a.stage) !== rank(b.stage)) return rank(a.stage) - rank(b.stage);
      return new Date(`${a.scheduledDate ?? "9999"}T${a.scheduledTime ?? "00:00"}`).getTime()
           - new Date(`${b.scheduledDate ?? "9999"}T${b.scheduledTime ?? "00:00"}`).getTime();
    })
    .slice(0, 5);

  const interviewStageLabel = (s: string) =>
    INTERVIEW_STAGES.find((x) => x.stage === s)?.label ?? s.replace("_", " ");

  const statCards = [
    { label: "Upcoming Meetings",   value: stats.upcomingMeetings,   icon: ClipboardList,  href: "/agendas",    color: "text-blue-600",   badge: undefined },
    { label: "Interviews to Set",   value: stats.needsScheduling,    icon: CalendarClock,  href: "/interviews", color: "text-amber-600",  badge: stats.upcomingInterviews > 0 ? `${stats.upcomingInterviews} scheduled` : undefined },
    { label: "Callings In Progress",value: stats.callingsInProgress, icon: Church,         href: "/callings",   color: "text-purple-600", badge: stats.vacantCallings > 0 ? `${stats.vacantCallings} need calling` : undefined },
    { label: "Scheduled Interviews",value: stats.upcomingInterviews, icon: Calendar,       href: "/interviews", color: "text-green-600",  badge: undefined },
  ];

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            Good {getTimeOfDay()}, {appUser?.displayName?.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Here&apos;s what&apos;s happening in the ward today.
          </p>
        </div>
        <Button variant="outline" size="icon" asChild className="shrink-0" title="Settings">
          <Link href="/settings" aria-label="Settings">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, href, color, badge }) => (
          <Link key={label} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold mt-1">{value}</p>
                    {badge && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 font-medium">{badge}</p>
                    )}
                  </div>
                  <Icon className={`h-5 w-5 ${color} shrink-0`} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild className="flex-1 sm:flex-none gap-2">
          <Link href="/interviews?new=1">
            <CalendarPlus className="h-4 w-4" />
            Add Interview
          </Link>
        </Button>
        <Button variant="outline" asChild className="flex-1 sm:flex-none gap-2">
          <Link href="/chat">
            <MessageSquare className="h-4 w-4" />
            Ask AI Assistant
          </Link>
        </Button>
        <Button variant="outline" asChild className="flex-1 sm:flex-none gap-2">
          <Link href="/agendas">
            <ClipboardList className="h-4 w-4" />
            View Agendas
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Upcoming Meetings</CardTitle>
            <Link href="/agendas" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingMeetings.length === 0 ? (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">No upcoming meetings</div>
            ) : (
              <ul className="divide-y divide-border">
                {upcomingMeetings.map((meeting) => {
                  const itemCount = meeting.type === "sacrament_meeting"
                    ? (meeting.program?.rows.length ?? 0)
                    : meeting.agenda.length;
                  return (
                  <li key={meeting.id} className="flex items-start gap-3 px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{meeting.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDate(meeting.date)} · {itemCount} item{itemCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {MEETING_TYPE_LABELS[meeting.type]}
                    </Badge>
                  </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Interviews</CardTitle>
            <div className="flex items-center gap-3">
              <Link href="/interviews?new=1" className="text-xs text-primary flex items-center gap-1 hover:underline">
                <Plus className="h-3 w-3" /> Add
              </Link>
              <Link href="/interviews" className="text-xs text-primary flex items-center gap-1 hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingInterviews.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <p className="text-muted-foreground text-sm">No interviews</p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/interviews?new=1">Add an interview</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {upcomingInterviews.map((interview) => (
                  <li key={interview.id} className="flex items-start gap-3 px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{interview.memberName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {INTERVIEW_TYPE_LABELS[interview.type]}
                        {interview.scheduledDate ? ` · ${formatDate(interview.scheduledDate)}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${INTERVIEW_STAGE_COLORS[interview.stage]}`}>
                      {interviewStageLabel(interview.stage)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
