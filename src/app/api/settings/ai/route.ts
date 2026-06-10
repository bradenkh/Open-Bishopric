import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const PROVIDERS = ["openai-compat", "deepseek"] as const;

/**
 * AI assistant configuration (provider, model, base URL, API key). The key lives
 * in the server-only `app_settings` table, so all access goes through the
 * service-role client here. GET deliberately omits the key — it returns only
 * whether one is set — so the secret never reaches the browser.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("ai_provider, ai_model, ai_base_url, ai_api_key")
    .eq("id", "default")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    provider: data?.ai_provider ?? "openai-compat",
    model: data?.ai_model ?? "glm-4.7-flash",
    baseUrl: data?.ai_base_url ?? "https://open.bigmodel.cn/api/paas/v4/",
    hasApiKey: Boolean(data?.ai_api_key),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { provider, model, baseUrl } = body;
  // apiKey is optional on update: omit it to keep the current key; send an empty
  // string to clear it. Any other string replaces it.
  const apiKey: string | undefined = body.apiKey;

  if (provider && !PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const patch: Record<string, string> = {};
  if (typeof provider === "string") patch.ai_provider = provider;
  if (typeof model === "string" && model.trim()) patch.ai_model = model.trim();
  if (typeof baseUrl === "string" && baseUrl.trim()) patch.ai_base_url = baseUrl.trim();
  if (typeof apiKey === "string") patch.ai_api_key = apiKey.trim() || "";

  const { error } = await createAdminClient()
    .from("app_settings")
    .update(patch)
    .eq("id", "default");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
