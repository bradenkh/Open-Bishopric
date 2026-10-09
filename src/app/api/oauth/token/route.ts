import {
  isActiveUser,
  isOAuthConfigured,
  issueTokens,
  readClient,
  readRefreshToken,
  redeemCode,
} from "@/lib/mcp/oauth";

/** OAuth token endpoint: exchanges an authorization code (with PKCE) or a refresh token. */
export async function POST(request: Request) {
  if (!isOAuthConfigured()) return oauthError("temporarily_unavailable", 503);

  const form = await request.formData().catch(() => null);
  const field = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" ? v : "";
  };

  const clientId = field("client_id");
  if (!readClient(clientId)) return oauthError("invalid_client", 401);

  const grantType = field("grant_type");
  if (grantType === "authorization_code") {
    const code = redeemCode(field("code"), clientId, field("redirect_uri"), field("code_verifier"));
    if (!code || !(await isActiveUser(code.sub))) return oauthError("invalid_grant");
    return tokenResponse(issueTokens(code.sub, clientId));
  }

  if (grantType === "refresh_token") {
    const refresh = readRefreshToken(field("refresh_token"), clientId);
    if (!refresh || !(await isActiveUser(refresh.sub))) return oauthError("invalid_grant");
    return tokenResponse(issueTokens(refresh.sub, clientId));
  }

  return oauthError("unsupported_grant_type");
}

function tokenResponse(body: object) {
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}

function oauthError(error: string, status = 400) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}
