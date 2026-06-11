import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A standing preference / fact the bishopric has asked the AI assistant to
 * remember across conversations (e.g. "don't add the conference talk to the
 * bulletin agenda"). Stored in `agent_notes` and injected into the agent's
 * system prompt on every request so it actually honors them.
 */
export interface AgentNote {
  id: string;
  content: string;
  createdBy: string;
  createdAt: string;
}

/** List the assistant's remembered notes, oldest first. */
export async function listAgentNotes(db: SupabaseClient): Promise<AgentNote[]> {
  const { data, error } = await db
    .from("agent_notes")
    .select("id, content, created_by, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    content: r.content as string,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
  }));
}
