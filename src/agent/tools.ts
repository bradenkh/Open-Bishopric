import { tool } from "ai";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";

export const getMembers = tool({
  description: "Search or list ward members by name. Use to find member information.",
  inputSchema: z.object({
    search: z.string().optional().describe("Optional name to search for"),
    limitCount: z.number().optional().default(10),
  }),
  execute: async ({ search, limitCount = 10 }) => {
    const snap = await adminDb
      .collection("members")
      .orderBy("lastName")
      .limit(limitCount)
      .get();
    const members = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter((m) => {
      const first = String((m as Record<string, unknown>).firstName ?? "").toLowerCase();
      const last = String((m as Record<string, unknown>).lastName ?? "").toLowerCase();
      return first.includes(q) || last.includes(q) || `${first} ${last}`.includes(q);
    });
  },
});

export const getTasks = tool({
  description: "Get tasks filtered by status and/or type.",
  inputSchema: z.object({
    status: z
      .enum(["active", "in_progress", "waiting", "completed", "cancelled", "all"])
      .optional()
      .default("active"),
    type: z
      .enum(["interview", "follow_up", "contact", "todo", "calling", "agenda_item", "announcement", "general", "all"])
      .optional()
      .default("all"),
    limitCount: z.number().optional().default(20),
  }),
  execute: async ({ status, type, limitCount = 20 }) => {
    let ref = adminDb.collection("tasks").orderBy("createdAt", "desc").limit(limitCount);

    if (status && status !== "all") {
      ref = adminDb
        .collection("tasks")
        .where("status", "==", status)
        .orderBy("createdAt", "desc")
        .limit(limitCount);
    }

    const snap = await ref.get();
    let tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (type && type !== "all") {
      tasks = tasks.filter((t) => (t as Record<string, unknown>).type === type);
    }

    return tasks;
  },
});

export const createTask = tool({
  description: "Create a new task for the bishopric.",
  inputSchema: z.object({
    title: z.string().describe("Short descriptive title"),
    description: z.string().optional(),
    type: z.enum(["interview", "follow_up", "contact", "todo", "calling", "agenda_item", "announcement", "general"]),
    memberName: z.string().optional().describe("Name of the ward member this task relates to"),
    dueDate: z.string().optional().describe("ISO date string for the due date"),
  }),
  execute: async ({ title, description, type, memberName, dueDate }) => {
    const now = new Date().toISOString();
    const ref = await adminDb.collection("tasks").add({
      title,
      description: description ?? "",
      type,
      status: "active",
      memberName: memberName ?? "",
      dueDate: dueDate ?? "",
      createdBy: "ai-agent",
      createdAt: now,
      updatedAt: now,
    });
    return { id: ref.id, title, type, status: "active" };
  },
});

export const updateTaskStatus = tool({
  description: "Update the status of an existing task.",
  inputSchema: z.object({
    taskId: z.string(),
    status: z.enum(["active", "in_progress", "waiting", "completed", "cancelled"]),
  }),
  execute: async ({ taskId, status }) => {
    await adminDb.collection("tasks").doc(taskId).update({
      status,
      updatedAt: new Date().toISOString(),
    });
    return { success: true, taskId, status };
  },
});

export const getCallings = tool({
  description: "Get callings in progress, optionally filtered by stage.",
  inputSchema: z.object({
    stage: z
      .enum(["needs_release", "vacant", "extending", "accepted", "sustaining", "sustained", "set_apart", "lcr_updated", "recorded", "all"])
      .optional()
      .default("all"),
    limitCount: z.number().optional().default(20),
  }),
  execute: async ({ stage, limitCount = 20 }) => {
    let ref = adminDb.collection("callings").orderBy("createdAt", "desc").limit(limitCount);

    if (stage && stage !== "all") {
      ref = adminDb
        .collection("callings")
        .where("stage", "==", stage)
        .orderBy("createdAt", "desc")
        .limit(limitCount);
    }

    const snap = await ref.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
});

export const agentTools = {
  getMembers,
  getTasks,
  createTask,
  updateTaskStatus,
  getCallings,
};
