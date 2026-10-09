import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isOAuthConfigured, isValidRedirect, readClient } from "@/lib/mcp/oauth";
import { Button } from "@/components/ui/button";
import { decide } from "./actions";

/**
 * OAuth consent screen for MCP clients (e.g. a Claude custom connector). The
 * signed-in bishopric member approves the client, which then acts as them.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const get = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v : "";
  };
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const codeChallenge = get("code_challenge");

  let problem: string | null = null;
  if (!isOAuthConfigured()) problem = "The MCP server isn't set up on this deployment (MCP_OAUTH_SECRET is missing).";
  else if (get("response_type") !== "code") problem = "Unsupported response type.";
  else if (!isValidRedirect(clientId, redirectUri)) problem = "This app isn't registered to connect here.";
  else if (!codeChallenge || get("code_challenge_method") !== "S256") problem = "The request is missing PKCE (S256).";

  if (problem) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Can&apos;t connect</h1>
        <p className="text-sm text-muted-foreground">{problem}</p>
      </Shell>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(params as Record<string, string>).toString()}`;
    redirect(`/login?from=${encodeURIComponent(here)}`);
  }

  const clientName = readClient(clientId)?.client_name || "An MCP client";
  return (
    <Shell>
      <h1 className="text-xl font-semibold">Connect {clientName}?</h1>
      <p className="text-sm text-muted-foreground">
        {clientName} will be able to read and change ward data in Open Bishopric as{" "}
        <span className="font-medium text-foreground">{user.displayName || user.email}</span>: members, callings,
        interviews, tasks, bulletins, announcements, and the ward inbox, including sending email.
      </p>
      <form action={decide} className="flex gap-3 pt-2">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="state" value={get("state")} />
        <Button type="submit" name="decision" value="deny" variant="outline" className="flex-1">
          Cancel
        </Button>
        <Button type="submit" name="decision" value="allow" className="flex-1">
          Allow
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border p-6">{children}</div>
    </div>
  );
}
