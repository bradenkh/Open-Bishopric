import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Access tokens for the MCP server (`/api/mcp`). A bishopric member generates
 * one in Settings and pastes the connector URL into Claude; the token then acts
 * as them. Only a hash is stored (`mcp_tokens`), so a token is shown once.
 */

const PREFIX = "obk_";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export interface McpTokenInfo {
  id: string;
  name: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function toInfo(r: Record<string, unknown>): McpTokenInfo {
  return {
    id: r.id as string,
    name: r.name as string,
    hint: r.token_hint as string,
    createdAt: r.created_at as string,
    lastUsedAt: (r.last_used_at as string | null) ?? null,
  };
}

export async function listTokens(userId: string): Promise<McpTokenInfo[]> {
  const { data, error } = await createAdminClient()
    .from("mcp_tokens")
    .select("id, name, token_hint, created_at, last_used_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toInfo);
}

/** Create a token for the user. The returned `token` is never retrievable again. */
export async function createToken(userId: string, name: string) {
  const token = PREFIX + randomBytes(32).toString("base64url");
  const { data, error } = await createAdminClient()
    .from("mcp_tokens")
    .insert({ user_id: userId, name, token_hash: hash(token), token_hint: token.slice(-4) })
    .select("id, name, token_hint, created_at, last_used_at")
    .single();
  if (error) throw error;
  return { token, info: toInfo(data) };
}

/** Revoke one of the user's tokens. */
export async function deleteToken(userId: string, id: string) {
  const { error } = await createAdminClient().from("mcp_tokens").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

/** The user a token belongs to, or null if it's unknown or revoked. */
export async function authenticateToken(token: string | null | undefined): Promise<string | null> {
  if (!token?.startsWith(PREFIX)) return null;
  const db = createAdminClient();
  const { data, error } = await db
    .from("mcp_tokens")
    .select("id, user_id")
    .eq("token_hash", hash(token))
    .maybeSingle();
  if (error || !data) return null;
  await db.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.user_id as string;
}
