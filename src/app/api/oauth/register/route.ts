import { allowedRedirectUris, isOAuthConfigured, registerClient } from "@/lib/mcp/oauth";

/**
 * Dynamic client registration (RFC 7591). Only redirect URIs on the allowlist
 * (Claude's connector callback by default) can be registered, so a stranger
 * can't mint a client that sends a signed-in member's consent to their site.
 */
export async function POST(request: Request) {
  if (!isOAuthConfigured()) {
    return Response.json({ error: "temporarily_unavailable" }, { status: 503 });
  }

  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  const allowed = allowedRedirectUris();
  if (redirectUris.length === 0 || !redirectUris.every((u) => allowed.includes(u))) {
    return Response.json(
      {
        error: "invalid_redirect_uri",
        error_description: "This server only accepts Claude's connector callback (or URIs listed in MCP_OAUTH_REDIRECT_URIS).",
      },
      { status: 400 },
    );
  }

  const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : undefined;
  return Response.json(
    {
      client_id: registerClient(redirectUris, clientName),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}
