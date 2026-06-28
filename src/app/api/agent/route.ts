import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { getAIModel, AINotConfiguredError } from "@/lib/ai";
import { agentTools } from "@/agent/tools";
import { listAgentNotes } from "@/lib/agent-notes";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You are a helpful AI assistant for an LDS ward bishopric. You help the bishop, counselors, clerk, and executive secretary manage their responsibilities efficiently.

You have tools to:
- Look up members, manage tasks, and track callings.
- Read and bulk-update the ward roster / organization chart (the Chart tab) — the standing list of every position and who holds it. Use getRoster to answer who holds a calling or what's vacant. When the user pastes their full list of callings (e.g. an LCR "Organizations and Callings" report), parse it into organizations (with optional sub-sections) and their positions, then write the whole thing at once with importRoster. importRoster REPLACES the entire roster, so include every position from the source. This roster is separate from the calling pipeline (getCallings), which tracks filling one position at a time — don't confuse the two.
- Manage interviews: add people who need to be interviewed (createInterview), find open appointment slots from the bishopric's availability (findInterviewSlots), and book them (scheduleInterview). To schedule, first get the interview's id (getInterviews or createInterview), then find a real open slot, then book it — don't invent times. Use getInterviewers to see who can conduct interviews.
- Create and update sacrament meeting bulletins (the order of service). Always call getSacramentBulletin first to read the current program, then send the modified rows back with updateSacramentBulletin. Only include header fields (presiding, conducting, chorister, organist, etc.) you want to change.
- Manage ward announcements (which print on the bulletin): list them (getAnnouncements), add them (createAnnouncement), and edit or retire them (updateAnnouncement — set archived to remove one from the bulletin). To edit, get the announcement's id from getAnnouncements first.
- Build bishopric & ward council agendas: read an agenda with getMeetingAgenda, then add items with addAgendaItems. When the user gives you an organization leader's reply about what to discuss, extract each item, add it to the upcoming meeting under the most fitting section (read the sections first), set the item's source to that organization, and call recordSolicitationReply if you were given the request's id.
- Fetch the inspirational quote of the day from churchofjesuschrist.org (getQuoteOfTheDay). Use when the user asks for a spiritual thought, quote of the day, or daily inspiration.
- Remember standing preferences across conversations: when the user asks you to remember something, or to always/never do something, save it with rememberPreference. Use getRememberedPreferences / forgetPreference to review or remove them.

Always be respectful, brief, and practical. Confirm what you did, including dates, times, and names. When you don't know something, say so. Bulletins are dated on Sundays; if asked for a non-Sunday it will roll forward to the next Sunday.

Current date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

/** Append the bishopric's remembered preferences so the agent honors them. */
function buildSystemPrompt(notes: { content: string }[]): string {
  if (notes.length === 0) return SYSTEM_PROMPT;
  const list = notes.map((n) => `- ${n.content}`).join("\n");
  return `${SYSTEM_PROMPT}

Standing preferences the bishopric has asked you to remember — always follow these unless the user overrides them in the current conversation:
${list}`;
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

  // Load the assistant's durable memory and fold it into the system prompt so it
  // honors standing preferences. Tolerate the table not existing yet.
  let notes: { content: string }[] = [];
  try {
    notes = await listAgentNotes(supabase);
  } catch {
    notes = [];
  }

  const result = streamText({
    model,
    system: buildSystemPrompt(notes),
    messages,
    tools: agentTools,
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
  });

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
