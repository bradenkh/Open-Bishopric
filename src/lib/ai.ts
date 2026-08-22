import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import type { LanguageModel } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";

export type AIProvider = "openai-compat" | "deepseek" | "cerebras";

/** Every provider the assistant can talk to — used to validate settings input. */
export const AI_PROVIDERS: readonly AIProvider[] = ["openai-compat", "deepseek", "cerebras"];

export interface AISettings {
  provider: AIProvider;
  model: string;
  baseUrl: string;
  /** Present only server-side. Never send this to the browser. */
  apiKey: string;
  /** Set when the settings row couldn't be read (e.g. the table doesn't exist yet). */
  readError?: string;
}

const DEFAULTS = {
  provider: "openai-compat" as const,
  // OpenRouter is OpenAI-compatible, so it runs through the "openai-compat"
  // provider below. Model ids are namespaced (`vendor/model`); swap this for any
  // model OpenRouter exposes under Settings → AI assistant.
  model: "openai/gpt-4o-mini",
  baseUrl: "https://openrouter.ai/api/v1",
};

/** Cerebras exposes an OpenAI-compatible API, so it runs through the same path. */
export const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";

/**
 * Load the AI assistant's active configuration. The bishopric can save several
 * named model configurations (in `ai_configs`) and select one via
 * `app_settings.active_ai_config_id`, all managed under Settings → AI assistant,
 * so the model can be changed without a redeploy. Resolution order:
 *   1. the selected saved config (`ai_configs`), if any;
 *   2. the legacy single-config columns on `app_settings`;
 *   3. the AI_* environment variables;
 *   4. built-in defaults.
 *
 * Reads via the service-role client because both tables are server-only (no RLS
 * policy) — keeping the API key off the browser entirely.
 */
export async function getAISettings(): Promise<AISettings> {
  let row: Record<string, string | null> | null = null;
  let config: Record<string, string | null> | null = null;
  let readError: string | undefined;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_settings")
      .select("ai_provider, ai_model, ai_base_url, ai_api_key, active_ai_config_id")
      .eq("id", "default")
      .maybeSingle();
    if (error) readError = error.message;
    row = data;

    // A saved model configuration, when one is selected, takes precedence over
    // the legacy single-config columns on app_settings.
    if (row?.active_ai_config_id) {
      const { data: cfg, error: cfgErr } = await admin
        .from("ai_configs")
        .select("provider, model, base_url, api_key")
        .eq("id", row.active_ai_config_id)
        .maybeSingle();
      if (cfgErr) readError = cfgErr.message;
      config = cfg;
    }
  } catch (err) {
    readError = err instanceof Error ? err.message : String(err);
  }

  // Base URL default depends on the provider: Cerebras has its own endpoint.
  const providerDefaultBaseUrl = (p: AIProvider) =>
    p === "cerebras" ? CEREBRAS_BASE_URL : DEFAULTS.baseUrl;

  // When a saved config is active, resolve entirely from it (never blend in the
  // legacy columns, which may describe a different provider). Otherwise fall back
  // to the legacy app_settings columns, then the AI_* env vars, then defaults.
  if (config) {
    const provider = (config.provider || DEFAULTS.provider) as AIProvider;
    return {
      provider,
      model: config.model || DEFAULTS.model,
      baseUrl: config.base_url || providerDefaultBaseUrl(provider),
      apiKey: config.api_key || "",
      readError,
    };
  }

  const provider = (row?.ai_provider || process.env.AI_PROVIDER || DEFAULTS.provider) as AIProvider;
  return {
    provider,
    model: row?.ai_model || process.env.AI_MODEL || DEFAULTS.model,
    baseUrl: row?.ai_base_url || process.env.AI_BASE_URL || providerDefaultBaseUrl(provider),
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
    // app_settings table hasn't been created yet (the schema is applied by the
    // migrations). Surface that instead of a misleading "no key".
    if (readError) {
      throw new AINotConfiguredError(
        `Couldn't read AI settings from the database (${readError}). ` +
          "Make sure the app_settings table exists — apply the schema with `npm run db:migrate` — then set the API key under Settings → AI assistant.",
      );
    }
    throw new AINotConfiguredError();
  }

  if (provider === "deepseek") {
    return createDeepSeek({ apiKey })(model) as LanguageModel;
  }
  // Both "openai-compat" (OpenRouter et al.) and "cerebras" speak the OpenAI
  // chat-completions API, so they share this path — only the base URL differs.
  // Strip any trailing slash so the SDK doesn't build a "…/v1//chat/completions"
  // URL, which some OpenAI-compatible gateways reject.
  const baseURL = (baseUrl || (provider === "cerebras" ? CEREBRAS_BASE_URL : DEFAULTS.baseUrl)).replace(/\/+$/, "");
  const isOpenRouter = baseURL.includes("openrouter.ai");
  // OpenRouter likes an app identifier for its usage rankings; it's optional and
  // ignored by other OpenAI-compatible gateways, so only send it to OpenRouter.
  const headers = isOpenRouter ? { "X-Title": "Open Bishopric" } : undefined;
  // Use `.chat(...)` explicitly: the default `openai(model)` targets OpenAI's
  // newer Responses API (`/responses`), which OpenRouter and most OpenAI-compatible
  // gateways don't implement — they only serve `/chat/completions`.
  return createOpenAI({
    apiKey,
    baseURL,
    headers,
    // OpenRouter may route one model to several upstream providers, some of which
    // don't accept the `tool_choice` parameter the SDK sends with our tools — that
    // surfaces as a 404 "No endpoints found that support the provided 'tool_choice'
    // value". Ask OpenRouter to route only to providers that support every
    // parameter we send. It's an OpenRouter-only body field (not part of the OpenAI
    // schema), so we splice it in via a fetch wrapper.
    fetch: isOpenRouter ? openRouterFetch : undefined,
  }).chat(model);
}

/**
 * Wraps fetch to add OpenRouter's `provider.require_parameters` routing hint to
 * each chat request, so it never lands on a provider that can't honor our tool
 * calls. Leaves the request untouched if the body isn't JSON we can parse.
 */
const openRouterFetch: typeof fetch = (input, init) => {
  if (typeof init?.body === "string") {
    try {
      const body = JSON.parse(init.body);
      body.provider = { ...body.provider, require_parameters: true };
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // Not JSON (or unexpected shape) — send it as-is.
    }
  }
  return fetch(input, init);
};
