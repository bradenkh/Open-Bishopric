import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_PROVIDERS, type AIProvider } from "@/lib/ai";

/**
 * Create a new saved AI model configuration. The config — including its API key —
 * is stored in the server-only `ai_configs` table via the service-role client,
 * so the key never reaches the browser. The response echoes the config without
 * the key.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const provider = (typeof body.provider === "string" ? body.provider : "openai-compat") as AIProvider;
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  if (!name) return NextResponse.json({ error: "Give the configuration a name" }, { status: 400 });
  if (!model) return NextResponse.json({ error: "A model is required" }, { status: 400 });
  if (!AI_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_configs")
    .insert({
      id,
      name,
      provider,
      model,
      base_url: baseUrl,
      api_key: apiKey || null,
    })
    .select("id, name, provider, model, base_url, api_key")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
