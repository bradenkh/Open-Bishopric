import "server-only";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { authenticateToken } from "@/lib/mcp/tokens";

/**
 * Serves one MCP request (Streamable HTTP). Stateless — a fresh server and
 * transport per request — so it works on serverless hosts. The token comes
 * from the URL path (`/api/mcp/<token>`, for Claude's custom connector, which
 * has no header field) or an `Authorization: Bearer` header (`/api/mcp`).
 */
export async function handleMcpRequest(request: Request, pathToken?: string): Promise<Response> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const userId = await authenticateToken(pathToken ?? bearer);
  if (!userId) {
    return Response.json(
      { error: "Invalid or revoked token. Generate one in Open Bishopric under Settings → Claude connector." },
      { status: 401 },
    );
  }

  const server = await createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // JSON responses are fully built by now, so the per-request server can go.
    void server.close();
  }
}
