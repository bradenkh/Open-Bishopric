import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listAgentNotes } from "@/lib/agent-notes";

/**
 * The AI assistant's durable memory — standing preferences it remembers across
 * conversations. Backed by the `agent_notes` table (authenticated full access),
 * so reads/writes go through the signed-in user's client.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  try {
    const notes = await listAgentNotes(await createClient());
    return NextResponse.json({ notes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load memory" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { content } = await request.json();
  if (typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_notes")
    .insert({ id: crypto.randomUUID(), content: content.trim(), created_by: auth.user.uid })
    .select("id, content, created_by, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    note: { id: data.id, content: data.content, createdBy: data.created_by, createdAt: data.created_at },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("agent_notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
