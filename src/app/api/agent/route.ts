import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { getAIModel, AINotConfiguredError } from "@/lib/ai";
import { acquireAISlot } from "@/lib/ai-lock";
import { agentTools } from "@/agent/tools";
import { listAgentNotes } from "@/lib/agent-notes";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You are a helpful AI assistant for an LDS ward bishopric. You help the bishop, counselors, clerk, and executive secretary manage their responsibilities efficiently.

You have tools to:
- Look up members, manage tasks, and track callings.
- Manage interviews: add people who need to be interviewed (createInterview), find open appointment slots from the bishopric's availability (findInterviewSlots), and book them (scheduleInterview). To schedule, first get the interview's id (getInterviews or createInterview), then find a real open slot, then book it — don't invent times. Use getInterviewers to see who can conduct interviews.
- Create and update sacrament meeting bulletins (the order of service). Always call getSacramentBulletin first to read the current program, then send the modified rows back with updateSacramentBulletin. Only include header fields (presiding, conducting, chorister, organist, etc.) you want to change.
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

  // The free GLM flash tier allows only one request at a time, so wait for any
  // in-flight agent call to finish before starting ours. The slot is released
  // when the stream completes, errors, or aborts.
  const release = await acquireAISlot();

  const result = streamText({
    model,
    system: buildSystemPrompt(notes),
    messages,
    tools: agentTools,
    stopWhen: stepCountIs(5),
    onFinish: release,
    onError: release,
    onAbort: release,
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      if (isRateLimit(error)) {
        return "The assistant is busy with another request (the free GLM tier allows one at a time). Please try again in a moment.";
      }
      // Surface the provider's actual error (e.g. bad model id, auth, base URL)
      // so it's diagnosable from the chat instead of a generic message.
      return `Assistant error: ${describeError(error)}`;
    },
  });
}

/** GLM's free tier returns 429 / "concurrency" errors when a second call overlaps. */
function isRateLimit(error: unknown): boolean {
  const status = (error as { statusCode?: number; status?: number })?.statusCode
    ?? (error as { status?: number })?.status;
  if (status === 429) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rate limit") || message.includes("concurren") || message.includes("429");
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
