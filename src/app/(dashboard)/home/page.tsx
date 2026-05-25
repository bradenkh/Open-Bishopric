"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  CheckSquare,
  Users,
  Church,
  Calendar,
  ArrowRight,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import type { Task, Calling } from "@/types";
import { TASK_STATUS_COLORS } from "@/types";

export default function DashboardPage() {
  const { appUser } = useAuth();
  const [stats, setStats] = useState({
    activeTasks: 0,
    members: 0,
    callingsInProgress: 0,
    vacantCallings: 0,
    interviews: 0,
  });
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [recentCallings, setRecentCallings] = useState<Calling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [tasksSnap, membersSnap, callingsSnap] = await Promise.all([
          getDocs(query(collection(db, "tasks"), where("status", "in", ["active", "in_progress", "waiting"]))),
          getDocs(collection(db, "members")),
          getDocs(query(collection(db, "callings"), where("stage", "not-in", ["recorded"]))),
        ]);

        const tasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
        const callings = callingsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Calling));

        setStats({
          activeTasks: tasks.length,
          members: membersSnap.size,
          callingsInProgress: callings.filter((c) => c.stage !== "vacant").length,
          vacantCallings: callings.filter((c) => c.stage === "vacant").length,
          interviews: tasks.filter((t) => t.type === "interview").length,
        });
        setRecentTasks(tasks.slice(0, 5));
        setRecentCallings(callings.slice(0, 3));
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const statCards = [
    {
      label: "Active Tasks",
      value: stats.activeTasks,
      icon: CheckSquare,
      href: "/tasks",
      color: "text-blue-600",
    },
    {
      label: "Members",
      value: stats.members,
      icon: Users,
      href: "/members",
      color: "text-green-600",
    },
    {
      label: "Callings In Progress",
      value: stats.callingsInProgress,
      icon: Church,
      href: "/callings",
      color: "text-purple-600",
      badge: stats.vacantCallings > 0 ? `${stats.vacantCallings} vacant` : undefined,
    },
    {
      label: "Pending Interviews",
      value: stats.interviews,
      icon: Calendar,
      href: "/tasks?type=interview",
      color: "text-orange-600",
    },
  ];

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Good {getTimeOfDay()}, {appUser?.displayName?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here&apos;s what&apos;s happening in the ward today.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, href, color, badge }) => (
          <Link key={label} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className={`text-2xl font-bold mt-1 ${loading ? "opacity-0" : ""}`}>
                      {loading ? "—" : value}
                    </p>
                    {"badge" in { badge } && badge && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 font-medium">
                        {badge}
                      </p>
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
          <Link href="/chat">
            <MessageSquare className="h-4 w-4" />
            Ask AI Assistant
          </Link>
        </Button>
        <Button variant="outline" asChild className="flex-1 sm:flex-none gap-2">
          <Link href="/tasks">
            <CheckSquare className="h-4 w-4" />
            View All Tasks
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Recent Tasks</CardTitle>
            <Link href="/tasks" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : recentTasks.length === 0 ? (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">No active tasks</div>
            ) : (
              <ul className="divide-y divide-border">
                {recentTasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-3 px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.memberName && (
                        <p className="text-xs text-muted-foreground truncate">{task.memberName}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${TASK_STATUS_COLORS[task.status]}`}>
                      {task.status.replace("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Callings In Progress</CardTitle>
            <Link href="/callings" className="text-xs text-primary flex items-center gap-1 hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : recentCallings.length === 0 ? (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">No callings in progress</div>
            ) : (
              <ul className="divide-y divide-border">
                {recentCallings.map((calling) => (
                  <li key={calling.id} className="flex items-start gap-3 px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {calling.memberName || (
                          <span className="text-muted-foreground italic">Vacant Position</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{calling.position}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-xs shrink-0 capitalize ${
                        calling.stage === "vacant" ? "border-red-300 text-red-700 dark:text-red-400" : ""
                      }`}
                    >
                      {calling.stage.replace("_", " ")}
                    </Badge>
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
