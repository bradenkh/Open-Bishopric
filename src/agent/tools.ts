import { tool } from "ai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromRow } from "@/lib/db/mappers";
import type { Calling, Member, Task } from "@/types";

// The agent runs server-side after the Route Handler has verified the session,
// so it uses the service-role client for data access. Created lazily so the
// build doesn't require the service-role key to be present.
let _db: ReturnType<typeof createAdminClient> | undefined;
function db() {
  return (_db ??= createAdminClient());
}

export const getMembers = tool({
  description: "Search or list ward members by name. Use to find member information.",
  inputSchema: z.object({
    search: z.string().optional().describe("Optional name to search for"),
    limitCount: z.number().optional().default(10),
  }),
  execute: async ({ search, limitCount = 10 }) => {
    let query = db().from("members").select("*").order("last_name").limit(limitCount);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow<Member>(r));
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
    let query = db().from("tasks").select("*").order("created_at", { ascending: false }).limit(limitCount);
    if (status && status !== "all") query = query.eq("status", status);
    if (type && type !== "all") query = query.eq("type", type);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow<Task>(r));
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
    const { data, error } = await db()
      .from("tasks")
      .insert({
        id: crypto.randomUUID(),
        title,
        description: description ?? null,
        type,
        status: "active",
        member_name: memberName ?? null,
        due_date: dueDate ?? null,
        created_by: "ai-agent",
      })
      .select()
      .single();
    if (error) throw error;
    return fromRow<Task>(data);
  },
});

export const updateTaskStatus = tool({
  description: "Update the status of an existing task.",
  inputSchema: z.object({
    taskId: z.string(),
    status: z.enum(["active", "in_progress", "waiting", "completed", "cancelled"]),
  }),
  execute: async ({ taskId, status }) => {
    const { error } = await db().from("tasks").update({ status }).eq("id", taskId);
    if (error) throw error;
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
    let query = db().from("callings").select("*").order("created_at", { ascending: false }).limit(limitCount);
    if (stage && stage !== "all") query = query.eq("stage", stage);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => fromRow<Calling>(r));
  },
});

export const agentTools = {
  getMembers,
  getTasks,
  createTask,
  updateTaskStatus,
  getCallings,
};
