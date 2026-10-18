import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { getAIModel, AINotConfiguredError } from "@/lib/ai";
import { agentTools } from "@/agent/tools";
import { listAgentNotes } from "@/lib/agent-notes";
import { createClient } from "@/lib/supabase/server";
import { agentInstructions } from "@/agent/prompt";

/**
 * Diagnostics for the agent's tool loop. On by default so we can see, in the
 * server logs (e.g. Vercel → Logs), exactly how each model turn resolves —
 * finish reason, whether a real tool call came through, and any provider
 * warnings. Set AI_DEBUG=0 to silence. Logs never include message or email
 * contents — only shapes, counts, lengths, and tool names — so no member data
 * lands in the logs.
 */
const AI_DEBUG = process.env.AI_DEBUG !== "0";

function logAgent(event: string, data: Record<string, unknown>) {
  if (!AI_DEBUG) return;
  try {
    console.log(`[agent] ${event}`, JSON.stringify(data));
  } catch {
    console.log(`[agent] ${event}`, data);
  }
}

/** Human-readable role label for the person currently signed in. */
const ROLE_LABELS: Record<string, string> = {
  bishop: "bishop",
  counselor: "counselor in the bishopric",
  clerk: "ward clerk",
  exec_secretary: "executive secretary",
};

/** Identity of the signed-in bishopric member driving this conversation. */
interface CurrentUser {
  name: string;
  role?: string;
}

/**
 * Tell the agent who it's talking to, so first-person requests ("I'll be out of
 * town", "add this to my calendar") resolve to the right bishopric member
 * instead of being ambiguous.
 */
function identityBlock(current: CurrentUser | null): string {
  if (!current?.name) return "";
  const roleLabel = current.role ? ROLE_LABELS[current.role] ?? current.role.replace(/_/g, " ") : undefined;
  const who = roleLabel ? `${current.name}, the ${roleLabel}` : current.name;
  return `

You are talking to ${who}. When they speak in the first person — "I", "me", "my", "myself" — they mean ${current.name}. For example, if they say they'll be out of town or otherwise unavailable, that's ${current.name} to mark unavailable (markMemberUnavailable), not someone else. Only act on another person's behalf when the user names that other person explicitly.`;
}

/** Append the bishopric's remembered preferences so the agent honors them. */
function buildSystemPrompt(notes: { content: string }[], current: CurrentUser | null): string {
  let prompt = agentInstructions() + identityBlock(current);
  if (notes.length > 0) {
    const list = notes.map((n) => `- ${n.content}`).join("\n");
    prompt += `

Standing preferences the bishopric has asked you to remember — always follow these unless the user overrides them in the current conversation:
${list}`;
  }
  return prompt;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let model;
  try {
    model = await getAIModel();
  } catch (err) {
    // Plain-text body so the message reaches the client cleanly — the chat
    // transport surfaces `await response.text()` as the error message.
    const message = err instanceof Error ? err.message : "Failed to initialize the assistant.";
    return new Response(message, { status: err instanceof AINotConfiguredError ? 503 : 500 });
  }

  const { messages: uiMessages } = await request.json();
  const messages = await convertToModelMessages(uiMessages);

  // What model/provider actually got resolved for this request. The id is the
  // first thing to check: a native-DeepSeek provider expects `deepseek-chat` /
  // `deepseek-reasoner`, while an OpenRouter-style `vendor/model` id belongs on
  // the openai-compat provider — a mismatch is a common cause of empty/looping
  // replies.
  const modelId = typeof model === "string" ? model : model.modelId;
  const modelProvider = typeof model === "string" ? "(string id)" : model.provider;
  logAgent("request", {
    provider: modelProvider,
    model: modelId,
    incomingMessages: messages.length,
  });

  // Load the assistant's durable memory and fold it into the system prompt so it
  // honors standing preferences. Tolerate the table not existing yet.
  let notes: { content: string }[] = [];
  try {
    notes = await listAgentNotes(supabase);
  } catch {
    notes = [];
  }

  // Who's driving this conversation, so first-person requests resolve to the
  // right bishopric member. Best-effort — a missing profile just omits identity.
  let current: CurrentUser | null = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, role")
      .eq("id", user.id)
      .maybeSingle();
    if (data?.display_name) {
      current = { name: data.display_name as string, role: (data.role as string) ?? undefined };
    }
  } catch {
    current = null;
  }

  // Secret for HMAC-signing tool-approval requests (email sends etc.). With it,
  // the server signs each approval request when it's issued and re-verifies the
  // signature when the client replays the approval — so a tool marked
  // `needsApproval` can never be executed from a forged or malformed approval
  // response; only an approval the user actually granted in the browser is
  // honored. Falls back to the service-role key (always present server-side) so
  // no extra configuration is required; set AI_TOOL_APPROVAL_SECRET to use a
  // dedicated secret. The secret only needs to be stable across the pair of
  // requests that issue and replay one approval.
  const approvalSecret =
    process.env.AI_TOOL_APPROVAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
  if (!approvalSecret) {
    // Never silently fall back to unenforced approvals — that's the exact gap
    // that let email go out un-reviewed. Fail loudly instead.
    logAgent("approval-secret-missing", {});
  }

  const result = streamText({
    model,
    system: buildSystemPrompt(notes, current),
    messages,
    tools: agentTools,
    // Cryptographically bind approvals so `needsApproval` tools can only
    // run from an approval the user actually granted. See approvalSecret above.
    experimental_toolApprovalSecret: approvalSecret,
    // Runaway guard for the agentic tool loop — NOT a per-conversation message
    // limit. A "step" is one model turn plus the tool calls it makes; the model
    // then sees the results and can go again. This cap stops a misbehaving model
    // from looping forever (runaway cost/time). Set high so it never bites normal
    // multi-tool flows. Don't drop stopWhen entirely: the SDK default is
    // stepCountIs(1), which would stop after the first tool call before the
    // model ever sees the result.
    stopWhen: stepCountIs(25),
    // Providers intermittently return rate-limit/"overloaded"/5xx responses; let
    // the SDK retry a few times (with exponential backoff) before giving up,
    // since these usually clear quickly.
    maxRetries: 4,
    // ── Diagnostics (see AI_DEBUG above) ────────────────────────────────────
    // Log how each model turn resolved. The key signals for the DeepSeek
    // "used a tool but nothing happened / spins forever" symptom:
    //   • finishReason "tool-calls" but toolCalls: 0  → model described a tool
    //     call in prose instead of emitting a real one.
    //   • a toolCall with emptyInput: true            → arguments never
    //     assembled into valid JSON (malformed streamed tool call).
    //   • finishReason "stop" with textLen 0          → empty reply.
    onStepFinish: (step) => {
      logAgent("step", {
        step: step.stepNumber,
        finishReason: step.finishReason,
        textLen: step.text?.length ?? 0,
        reasoningLen: step.reasoningText?.length ?? 0,
        toolCalls: (step.toolCalls ?? []).map((tc) => {
          const input = (tc as { input?: unknown }).input;
          const keys =
            input && typeof input === "object" ? Object.keys(input as object) : [];
          return {
            name: tc.toolName,
            emptyInput: input == null || (keys.length === 0 && typeof input !== "string"),
            inputKeys: keys,
          };
        }),
        toolResults: step.toolResults?.length ?? 0,
        // How many tool calls this step held back for user approval (email
        // sends). A send is only legitimate when a later step actually executes
        // an approved one — approvalRequests here, then toolResults on resume.
        approvalRequests: (step.content ?? []).filter(
          (c) => (c as { type?: string }).type === "tool-approval-request",
        ).length,
        stepWarnings: step.warnings?.length ?? 0,
      });
    },
    onFinish: (final) => {
      logAgent("finish", {
        steps: final.steps?.length ?? 0,
        finishReason: final.finishReason,
        totalTextLen: final.text?.length ?? 0,
        toolCallsMade: final.steps?.reduce((n, s) => n + (s.toolCalls?.length ?? 0), 0) ?? 0,
      });
    },
    onError: ({ error }) => {
      logAgent("stream-error", { error: describeError(error) });
    },
    // Fires only when the SDK cannot turn the model's tool call into a valid
    // input (empty/malformed arguments, or an unknown tool). We log the shape —
    // never the values — and return null to leave behavior exactly as it is
    // today; this call just tells us how often, and on which tools, DeepSeek
    // emits a broken tool call.
    experimental_repairToolCall: async ({ toolCall, error }) => {
      const raw =
        typeof toolCall.input === "string"
          ? toolCall.input
          : JSON.stringify(toolCall.input ?? "");
      logAgent("tool-call-unrepairable", {
        toolName: toolCall.toolName,
        rawInputLen: raw.length,
        looksEmpty: raw.trim() === "" || raw.trim() === "{}",
        errorName: error?.name,
      });
      return null;
    },
  });

  // Provider-level warnings are the tell for "the model/route can't do tools":
  // e.g. tools or tool_choice unsupported, so they were dropped. Awaited off to
  // the side so it never blocks the streamed response.
  void Promise.resolve(result.warnings)
    .then((w) => {
      if (w && w.length > 0) logAgent("provider-warnings", { warnings: w });
    })
    .catch(() => {});

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      if (isTransient(error)) {
        return "The AI service is briefly rate-limited or overloaded. Please wait a few seconds and try again.";
      }
      if (lacksToolSupport(error)) {
        return "The selected model can't make tool calls, which this assistant needs. Pick a tool-capable model under Settings → AI assistant (e.g. openai/gpt-4o-mini on OpenRouter).";
      }
      // Surface the provider's actual error (e.g. bad model id, auth, base URL)
      // so it's diagnosable from the chat instead of a generic message.
      return `Assistant error: ${describeError(error)}`;
    },
  });
}

/**
 * Transient upstream conditions that usually clear on a retry: provider
 * rate/concurrency limits, "overloaded", timeouts, 5xx, and the SDK's RetryError
 * (raised after it exhausts its own retries). These get a friendly "try again"
 * message instead of a raw error.
 */
function isTransient(error: unknown): boolean {
  const status = (error as { statusCode?: number; status?: number })?.statusCode
    ?? (error as { status?: number })?.status;
  if (status === 429 || (typeof status === "number" && status >= 500)) return true;
  const name = typeof (error as { name?: unknown })?.name === "string" ? (error as { name: string }).name.toLowerCase() : "";
  if (name.includes("retry")) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    "rate limit", "concurren", "429", "overload", "temporarily",
    "try again", "timeout", "timed out", "unavailable", "503", "502", "500",
  ].some((k) => message.includes(k));
}

/**
 * The configured model (or every upstream provider OpenRouter could route it to)
 * doesn't support tool calling, which the agent relies on. OpenRouter signals
 * this as a 404 about the `tool_choice` parameter / no matching endpoints.
 */
function lacksToolSupport(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("tool_choice")
    || (message.includes("no endpoints found") && message.includes("support"));
}

/** Best-effort human-readable description of a provider/SDK error. */
function describeError(error: unknown): string {
  const e = error as { message?: string; responseBody?: string; statusCode?: number };
  const parts = [
    e?.statusCode ? `HTTP ${e.statusCode}` : null,
    e?.message,
    e?.responseBody,
  ].filter(Boolean);
  return parts.join(" — ") || "unknown error";
}
