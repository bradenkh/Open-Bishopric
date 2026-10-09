import { handleMcpRequest } from "@/lib/mcp/handler";

/**
 * MCP endpoint with the token in the path — the URL you paste into Claude's
 * custom connector (Settings → Connectors), which has no header field.
 */

// Tool calls (inbox search, roster import) can take a while.
export const maxDuration = 60;

async function handle(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return handleMcpRequest(request, token);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
