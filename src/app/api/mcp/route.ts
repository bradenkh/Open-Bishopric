import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { authenticateBearer, isOAuthConfigured, publicOrigin, resourceMetadataUrl } from "@/lib/mcp/oauth";

/**
 * MCP endpoint (Streamable HTTP), for connecting the ward tools to Claude as a
 * custom connector. Runs stateless — a fresh server and transport per request
 * — so it works on serverless hosts. Every request needs a bearer token from
 * the OAuth flow in `src/lib/mcp/oauth.ts`; there is no anonymous access.
 */

// Tool calls (inbox search, roster import) can take a while.
export const maxDuration = 60;

async function handle(request: Request): Promise<Response> {
  if (!isOAuthConfigured()) {
    return new Response("The MCP server is disabled: set MCP_OAUTH_SECRET.", { status: 503 });
  }

  const auth = await authenticateBearer(request.headers.get("authorization"));
  if (!auth) {
    // Points the client at the OAuth metadata so it can start the sign-in flow.
    return Response.json(
      { error: "invalid_token", error_description: "Sign in to Open Bishopric to use this server." },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl(publicOrigin(request))}"`,
        },
      },
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

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
