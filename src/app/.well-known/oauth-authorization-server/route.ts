import { MCP_SCOPE, publicOrigin } from "@/lib/mcp/oauth";

/** OAuth authorization-server metadata (RFC 8414) for the MCP connector flow. */
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [MCP_SCOPE],
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
