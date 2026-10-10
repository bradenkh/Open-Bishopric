import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { agentTools } from "@/agent/tools";
import { agentInstructions } from "@/agent/prompt";
import { listAgentNotes } from "@/lib/agent-notes";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Exposes the in-app assistant's tools (`src/agent/tools.ts`) over MCP, so an
 * external client such as Claude can work with the ward's data directly. The
 * tools are reused as-is; this only adapts their shape.
 */

/** Tools that only read data. */
const READ_ONLY = new Set([
  "getMembers",
  "getTasks",
  "getCallings",
  "getRoster",
  "getInterviews",
  "getInterviewers",
  "getSacramentBulletin",
  "getWardBusiness",
  "getAnnouncements",
  "getRememberedPreferences",
]);

/** Tools that delete or wholesale replace data. */
const DESTRUCTIVE = new Set(["deleteCalling", "deleteInterview", "importRoster", "forgetPreference"]);

function annotationsFor(name: string): ToolAnnotations {
  if (READ_ONLY.has(name)) return { readOnlyHint: true, openWorldHint: false };
  return { readOnlyHint: false, destructiveHint: DESTRUCTIVE.has(name), openWorldHint: false };
}

async function instructions(): Promise<string> {
  let text = agentInstructions();
  try {
    const notes = await listAgentNotes(createAdminClient());
    if (notes.length > 0) {
      text += `

Standing preferences the bishopric has asked you to remember — always follow these unless the user overrides them in the current conversation:
${notes.map((n) => `- ${n.content}`).join("\n")}`;
    }
  } catch {
    // The notes table may not exist yet; the tools still work without it.
  }
  return text;
}

type AnyTool = {
  description?: string;
  inputSchema: unknown;
  execute?: (input: unknown, options: unknown) => unknown;
};

export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer(
    { name: "open-bishopric", title: "Open Bishopric", version: "1.0.0" },
    { instructions: await instructions() },
  );

  for (const [name, t] of Object.entries(agentTools as Record<string, AnyTool>)) {
    const execute = t.execute;
    if (!execute) continue;
    server.registerTool(
      name,
      {
        description: t.description,
        // The AI SDK tools declare their inputs with zod objects, which the
        // MCP SDK accepts directly.
        inputSchema: t.inputSchema as z.ZodObject,
        annotations: annotationsFor(name),
      },
      async (input: unknown) => {
        try {
          const result = await execute(input, { toolCallId: crypto.randomUUID(), messages: [] });
          const isError = !!result && typeof result === "object" && "error" in result;
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result ?? { ok: true }) }],
            isError,
          };
        } catch (e) {
          const message =
            e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Tool failed.";
          return { content: [{ type: "text" as const, text: message }], isError: true };
        }
      },
    );
  }

  return server;
}
