import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { getAIModel, AINotConfiguredError } from "@/lib/ai";
import { acquireAISlot } from "@/lib/ai-lock";
import { agentTools } from "@/agent/tools";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You are a helpful AI assistant for an LDS ward bishopric. You help the bishop, counselors, clerk, and executive secretary manage their responsibilities efficiently.

You have access to tools to look up members, manage tasks, and track callings. Always be respectful, brief, and practical.

When creating tasks or working with data, confirm what you did. When you don't know something, say so.

Current date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

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
    if (err instanceof AINotConfiguredError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  const { messages: uiMessages } = await request.json();
  const messages = await convertToModelMessages(uiMessages);

  // The free GLM flash tier allows only one request at a time, so wait for any
  // in-flight agent call to finish before starting ours. The slot is released
  // when the stream completes, errors, or aborts.
  const release = await acquireAISlot();

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
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
        return "The assistant is busy with another request. Please try again in a moment.";
      }
      return "Something went wrong talking to the assistant. Please try again.";
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
