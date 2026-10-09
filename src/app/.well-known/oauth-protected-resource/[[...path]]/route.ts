import { MCP_SCOPE, publicOrigin } from "@/lib/mcp/oauth";

/**
 * OAuth protected-resource metadata (RFC 9728) for the MCP endpoint. Served at
 * both `/.well-known/oauth-protected-resource` and the path-suffixed
 * `/.well-known/oauth-protected-resource/api/mcp` that MCP clients try first.
 */
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
      scopes_supported: [MCP_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Open Bishopric",
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
