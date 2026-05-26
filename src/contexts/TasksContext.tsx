"use client";

import { createContext, useContext, useState } from "react";
import type { Task } from "@/types";
import { MOCK_TASKS } from "@/lib/mock-data";
import { MOCK_BISHOPRIC_MEMBERS } from "@/lib/mock-data";

// ── Context shape ─────────────────────────────────────────────────────────────

interface TasksContextValue {
  tasks: Task[];
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  /** Mark a task complete. If it's a set_apart task, auto-creates a clerk LCR task. */
  completeTask: (id: string) => void;
  /** Complete all open tasks whose context.callingId matches. Called when a
   *  calling advances past the stage that originally created the tasks. */
  completeCallingTasks: (callingId: string) => void;
}

const TasksContext = createContext<TasksContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([...MOCK_TASKS]);

  function addTask(task: Task) {
    setTasks((prev) => [task, ...prev]);
  }

  function updateTask(id: string, updates: Partial<Task>) {
    const now = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: now } : t))
    );
  }

  function completeTask(id: string) {
    const now = new Date().toISOString();

    setTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      if (!task) return prev;

      const updated = prev.map((t) =>
        t.id === id ? { ...t, status: "completed" as const, updatedAt: now } : t
      );

      // ── Auto-create clerk LCR task when a set-apart task is checked off ──
      if (task.context?.taskType === "set_apart") {
        const clerk = MOCK_BISHOPRIC_MEMBERS.find((m) => m.role === "clerk");
        const position    = task.context?.position as string | undefined;
        const memberName  = task.memberName ?? "Unknown";
        const setApartDate = task.context?.setApartDate as string | undefined;
        const setApartBy   = task.context?.setApartBy  as string | undefined;

        const clerkTask: Task = {
          id:           `t-lcr-${Date.now()}`,
          title:        `Update LCR — ${memberName}${position ? ` / ${position}` : ""}`,
          description:  [
            `${memberName} was set apart${setApartDate ? ` on ${setApartDate}` : ""}${setApartBy ? ` by ${setApartBy}` : ""}.`,
            "Please record the calling in LCR (Leader & Clerk Resources) and mark them as set apart.",
          ].join(" "),
          type:         "calling",
          status:       "active",
          memberName,
          assigneeId:   clerk?.id,
          assigneeName: clerk?.name ?? "Ward Clerk",
          context: {
            callingId:  task.context?.callingId,
            taskType:   "lcr_update",
            position,
          },
          createdBy: "system",
          createdAt: now,
          updatedAt: now,
        };

        return [...updated, clerkTask];
      }

      return updated;
    });
  }

  function completeCallingTasks(callingId: string) {
    const now = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) =>
        t.context?.callingId === callingId && t.status !== "completed"
          ? { ...t, status: "completed" as const, updatedAt: now }
          : t
      )
    );
  }

  return (
    <TasksContext.Provider
      value={{ tasks, addTask, updateTask, completeTask, completeCallingTasks }}
    >
      {children}
    </TasksContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasks must be used inside <TasksProvider>");
  return ctx;
}
