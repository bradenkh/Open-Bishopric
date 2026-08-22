import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_PROVIDERS, type AIProvider } from "@/lib/ai";

/**
 * Update a saved AI model configuration. `apiKey` is optional: omit it to keep
 * the current key, send an empty string to clear it, or a new string to replace
 * it. The response never includes the key.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const patch: Record<string, string | null> = {};
  if (typeof body.name === "string") {
    if (!body.name.trim()) return NextResponse.json({ error: "Give the configuration a name" }, { status: 400 });
    patch.name = body.name.trim();
  }
  if (typeof body.provider === "string") {
    if (!AI_PROVIDERS.includes(body.provider as AIProvider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    patch.provider = body.provider;
  }
  if (typeof body.model === "string") {
    if (!body.model.trim()) return NextResponse.json({ error: "A model is required" }, { status: 400 });
    patch.model = body.model.trim();
  }
  if (typeof body.baseUrl === "string") patch.base_url = body.baseUrl.trim();
  // apiKey: omit → keep; "" → clear; else replace.
  if (typeof body.apiKey === "string") patch.api_key = body.apiKey.trim() || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_configs")
    .update(patch)
    .eq("id", id)
    .select("id, name, provider, model, base_url, api_key")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Configuration not found" }, { status: 404 });

  return NextResponse.json({
    config: {
      id: data.id,
      name: data.name,
      provider: data.provider,
      model: data.model,
      baseUrl: data.base_url ?? "",
      hasApiKey: Boolean(data.api_key),
    },
  });
}

/**
 * Delete a saved configuration. If it was the active one, the app_settings
 * foreign key (on delete set null) clears the selection automatically.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("ai_configs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
