import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { getAIModel } from "@/lib/ai";
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

  const { messages: uiMessages } = await request.json();
  const messages = await convertToModelMessages(uiMessages);

  const result = streamText({
    model: getAIModel(),
    system: SYSTEM_PROMPT,
    messages,
    tools: agentTools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
