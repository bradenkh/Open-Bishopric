import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AISettings {
  provider: "openai-compat" | "deepseek";
  model: string;
  baseUrl: string;
  /** Present only server-side. Never send this to the browser. */
  apiKey: string;
  /** Set when the settings row couldn't be read (e.g. the table doesn't exist yet). */
  readError?: string;
}

const DEFAULTS = {
  provider: "openai-compat" as const,
  model: "glm-4.7-flash",
  baseUrl: "https://api.z.ai/api/paas/v4",
};

/**
 * Load the AI assistant's configuration. The API key and model now live in the
 * `app_settings` table (managed under Settings → AI assistant) so they can be
 * changed without a redeploy. Environment variables are used only as a fallback
 * for fields the row leaves blank, easing migration from the old env-only setup.
 *
 * Reads via the service-role client because `app_settings` is server-only (no
 * RLS policy) — keeping the API key off the browser entirely.
 */
export async function getAISettings(): Promise<AISettings> {
  let row: Record<string, string | null> | null = null;
  let readError: string | undefined;
  try {
    const { data, error } = await createAdminClient()
      .from("app_settings")
      .select("ai_provider, ai_model, ai_base_url, ai_api_key")
      .eq("id", "default")
      .maybeSingle();
    if (error) readError = error.message;
    row = data;
  } catch (err) {
    readError = err instanceof Error ? err.message : String(err);
  }

  const provider = (row?.ai_provider || process.env.AI_PROVIDER || DEFAULTS.provider) as
    | "openai-compat"
    | "deepseek";

  return {
    provider,
    model: row?.ai_model || process.env.AI_MODEL || DEFAULTS.model,
    baseUrl: row?.ai_base_url || process.env.AI_BASE_URL || DEFAULTS.baseUrl,
    apiKey: row?.ai_api_key || process.env.AI_API_KEY || "",
    readError,
  };
}

/** Raised when the assistant is used before an API key has been configured. */
export class AINotConfiguredError extends Error {
  constructor(message?: string) {
    super(message ?? "The AI assistant isn't set up yet. Add an API key under Settings → AI assistant.");
    this.name = "AINotConfiguredError";
  }
}

/** Resolve the configured provider into a ready-to-use language model. */
export async function getAIModel(): Promise<LanguageModel> {
  const { provider, model, baseUrl, apiKey, readError } = await getAISettings();
  if (!apiKey) {
    // No key AND the settings read failed → the most common cause is that the
    // app_settings table hasn't been created yet (the migration runs on deploy
    // / `npm run db:reset`). Surface that instead of a misleading "no key".
    if (readError) {
      throw new AINotConfiguredError(
        `Couldn't read AI settings from the database (${readError}). ` +
          "Make sure the app_settings table exists — run `npm run db:reset` or redeploy — then set the API key under Settings → AI assistant.",
      );
    }
    throw new AINotConfiguredError();
  }

  if (provider === "deepseek") {
    return createDeepSeek({ apiKey })(model) as LanguageModel;
  }
  // Strip any trailing slash so the SDK doesn't build a "…/v4//chat/completions"
  // URL, which some OpenAI-compatible gateways (incl. Z.AI) reject.
  //
  // Use `.chat(...)` explicitly: the default `openai(model)` targets OpenAI's
  // newer Responses API (`/responses`), which Z.AI and most OpenAI-compatible
  // gateways don't implement — they only serve `/chat/completions`.
  return createOpenAI({ apiKey, baseURL: baseUrl.replace(/\/+$/, "") }).chat(model);
}
