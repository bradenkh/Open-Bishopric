import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A small, stateless OAuth 2.1 authorization server that lets an MCP client
 * (e.g. a Claude custom connector) act as a signed-in bishopric member.
 *
 * Every credential it hands out — the dynamically-registered client id, the
 * authorization code, and the access/refresh tokens — is an HMAC-signed blob
 * under MCP_OAUTH_SECRET, so no new tables are needed. Consent happens on
 * /oauth/authorize behind the app's normal Supabase login, so only people who
 * can already sign in to the app can connect a client. Rotating
 * MCP_OAUTH_SECRET revokes every connected client at once; deleting a user in
 * Supabase revokes theirs on the next request.
 */

export const MCP_SCOPE = "ward";

const CODE_TTL_SECS = 5 * 60;
const ACCESS_TTL_SECS = 60 * 60;
const REFRESH_TTL_SECS = 30 * 24 * 60 * 60;

/**
 * Redirect URIs a client may register. Defaults to Claude's connector
 * callbacks; MCP_OAUTH_REDIRECT_URIS (comma-separated) adds more, e.g. the MCP
 * Inspector's `http://localhost:6274/oauth/callback` for local testing.
 */
const DEFAULT_REDIRECT_URIS = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

export function allowedRedirectUris(): string[] {
  const extra = (process.env.MCP_OAUTH_REDIRECT_URIS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_REDIRECT_URIS, ...extra];
}

export class OAuthNotConfiguredError extends Error {
  constructor() {
    super("MCP_OAUTH_SECRET is not set, so the MCP server is disabled.");
  }
}

function secret(): string {
  const s = process.env.MCP_OAUTH_SECRET;
  // Fail closed: without a dedicated secret nothing can be issued or verified.
  if (!s || s.length < 32) throw new OAuthNotConfiguredError();
  return s;
}

export function isOAuthConfigured(): boolean {
  const s = process.env.MCP_OAUTH_SECRET;
  return !!s && s.length >= 32;
}

// ── Signed blobs ─────────────────────────────────────────────────────────────

type Signed =
  | { typ: "client"; redirect_uris: string[]; client_name?: string }
  | {
      typ: "code";
      sub: string;
      client_id: string;
      redirect_uri: string;
      code_challenge: string;
      scope: string;
      exp: number;
    }
  | { typ: "access"; sub: string; client_id: string; scope: string; exp: number }
  | { typ: "refresh"; sub: string; client_id: string; scope: string; exp: number };

type OfType<T extends Signed["typ"]> = Extract<Signed, { typ: T }>;

function mac(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

function sign(payload: Signed): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${mac(data)}`;
}

function verify<T extends Signed["typ"]>(token: string | null | undefined, typ: T): OfType<T> | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(data));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: Signed;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.typ !== typ) return null;
  if ("exp" in payload && payload.exp < now()) return null;
  return payload as OfType<T>;
}

const now = () => Math.floor(Date.now() / 1000);

// ── Clients (dynamic registration) ───────────────────────────────────────────

export function registerClient(redirectUris: string[], clientName?: string): string {
  return sign({ typ: "client", redirect_uris: redirectUris, client_name: clientName });
}

export function readClient(clientId: string | null | undefined) {
  return verify(clientId, "client");
}

/** The client is genuine and the redirect URI is one it registered (and still allowed). */
export function isValidRedirect(clientId: string, redirectUri: string): boolean {
  const client = readClient(clientId);
  return !!client && client.redirect_uris.includes(redirectUri) && allowedRedirectUris().includes(redirectUri);
}

// ── Authorization codes ──────────────────────────────────────────────────────

export function issueCode(args: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}): string {
  return sign({
    typ: "code",
    sub: args.userId,
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    code_challenge: args.codeChallenge,
    scope: MCP_SCOPE,
    exp: now() + CODE_TTL_SECS,
  });
}

/** Verify a code against the token request (client, redirect URI and PKCE verifier). */
export function redeemCode(code: string, clientId: string, redirectUri: string, codeVerifier: string) {
  const payload = verify(code, "code");
  if (!payload) return null;
  if (payload.client_id !== clientId || payload.redirect_uri !== redirectUri) return null;
  const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
  if (challenge !== payload.code_challenge) return null;
  return payload;
}

// ── Tokens ───────────────────────────────────────────────────────────────────

export function issueTokens(userId: string, clientId: string) {
  const exp = now();
  return {
    access_token: sign({ typ: "access", sub: userId, client_id: clientId, scope: MCP_SCOPE, exp: exp + ACCESS_TTL_SECS }),
    refresh_token: sign({ typ: "refresh", sub: userId, client_id: clientId, scope: MCP_SCOPE, exp: exp + REFRESH_TTL_SECS }),
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECS,
    scope: MCP_SCOPE,
  };
}

export function readRefreshToken(token: string, clientId: string) {
  const payload = verify(token, "refresh");
  return payload && payload.client_id === clientId ? payload : null;
}

/** The bishopric member behind a bearer token, or null if it's invalid or they've been removed. */
export async function authenticateBearer(authorization: string | null) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const payload = verify(match?.[1], "access");
  if (!payload) return null;
  return (await isActiveUser(payload.sub)) ? payload : null;
}

/** The user still exists and has a profile — i.e. they can still sign in to the app. */
export async function isActiveUser(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  return !error && !!data;
}

// ── URLs ─────────────────────────────────────────────────────────────────────

/** Public origin of the app, e.g. https://bishopric.example.com. */
export function publicOrigin(request: Request): string {
  const configured = process.env.MCP_PUBLIC_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/api/mcp`;
}
