import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { getAIModel } from "@/lib/ai";
import { agentTools } from "@/agent/tools";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";

const SYSTEM_PROMPT = `You are a helpful AI assistant for an LDS ward bishopric. You help the bishop, counselors, clerk, and executive secretary manage their responsibilities efficiently.

You have access to tools to look up members, manage tasks, and track callings. Always be respectful, brief, and practical.

When creating tasks or working with data, confirm what you did. When you don't know something, say so.

Current date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("__session");

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await adminAuth.verifySessionCookie(session.value, true);
  } catch {
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
