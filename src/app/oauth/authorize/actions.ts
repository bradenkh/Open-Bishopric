"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isValidRedirect, issueCode } from "@/lib/mcp/oauth";

/**
 * Handles the consent form on /oauth/authorize. Re-checks the session and the
 * client's redirect URI here, since form fields can be tampered with.
 */
export async function decide(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const codeChallenge = get("code_challenge");
  const state = get("state");

  if (!isValidRedirect(clientId, redirectUri) || !codeChallenge) {
    throw new Error("Invalid authorization request.");
  }
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to sign in first.");

  const target = new URL(redirectUri);
  if (get("decision") === "allow") {
    target.searchParams.set("code", issueCode({ userId: user.uid, clientId, redirectUri, codeChallenge }));
  } else {
    target.searchParams.set("error", "access_denied");
  }
  if (state) target.searchParams.set("state", state);
  redirect(target.toString());
}
