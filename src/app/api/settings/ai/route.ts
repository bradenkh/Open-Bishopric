import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * AI assistant configuration. The bishopric can save several named model
 * configurations (provider + model + base URL + API key) and switch the
 * assistant between them, so the model can be changed without re-typing keys.
 *
 * Every config — and its API key — lives in the server-only `ai_configs` table,
 * so all access goes through the service-role client here. GET never returns a
 * key: it reports only whether each config has one, so no secret reaches the
 * browser.
 */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const admin = createAdminClient();

  const { data: settings, error: settingsError } = await admin
    .from("app_settings")
    .select("active_ai_config_id")
    .eq("id", "default")
    .maybeSingle();
  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  const { data: configs, error: configsError } = await admin
    .from("ai_configs")
    .select("id, name, provider, model, base_url, api_key, created_at")
    .order("created_at", { ascending: true });
  if (configsError) {
    return NextResponse.json({ error: configsError.message }, { status: 500 });
  }

  return NextResponse.json({
    activeConfigId: settings?.active_ai_config_id ?? null,
    configs: (configs ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      model: c.model,
      baseUrl: c.base_url ?? "",
      hasApiKey: Boolean(c.api_key),
    })),
  });
}

/**
 * Select which saved configuration the assistant uses. Send
 * `{ activeConfigId: "<id>" }` to switch, or `{ activeConfigId: null }` to clear
 * the selection (falling back to the AI_* environment variables, if any).
 */
export async function PUT(request: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const activeConfigId: string | null =
    typeof body.activeConfigId === "string" ? body.activeConfigId : null;

  const admin = createAdminClient();

  // Guard against pointing at a config that doesn't exist.
  if (activeConfigId) {
    const { data: exists, error } = await admin
      .from("ai_configs")
      .select("id")
      .eq("id", activeConfigId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!exists) return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("app_settings")
    .update({ active_ai_config_id: activeConfigId })
    .eq("id", "default");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
