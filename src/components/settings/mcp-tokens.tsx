"use client";

import { useEffect, useState } from "react";
import { Loader2, Plug, Copy, Check, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface McpToken {
  id: string;
  name: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Generates connector URLs for Claude (Settings → Connectors → Add custom
 * connector). Each URL carries a token that acts as the signed-in member; it's
 * shown once, and can be revoked here.
 */
export function McpTokensCard() {
  const [tokens, setTokens] = useState<McpToken[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/settings/mcp-tokens")
      .then((r) => r.json())
      .then((data) => { if (data.error) setError(data.error); else setTokens(data.tokens); })
      .catch(() => setError("Couldn't load connector tokens."));
  }, []);

  const generate = async () => {
    setBusy(true); setError(""); setCopied(false);
    try {
      const res = await fetch("/api/settings/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate");
      setNewUrl(`${window.location.origin}/api/mcp/${data.token}`);
      setTokens((prev) => [data.info, ...(prev ?? [])]);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this token? Anything using it will stop working.")) return;
    setTokens((prev) => prev?.filter((t) => t.id !== id) ?? prev);
    try {
      const res = await fetch(`/api/settings/mcp-tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setError("Failed to revoke. Refresh to retry.");
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(newUrl);
    setCopied(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" /> Claude connector
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use the assistant&rsquo;s ward tools from Claude. Generate a connector URL, then in Claude go to
          Settings → Connectors → Add custom connector and paste it in. The URL acts as you, so keep it private
          and revoke it here if it leaks.
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="Name, e.g. Claude"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
          />
          <Button onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate URL"}
          </Button>
        </div>

        {newUrl && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-medium">Copy this now. It won&rsquo;t be shown again.</p>
            <div className="flex gap-2">
              <Input readOnly value={newUrl} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" onClick={copy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {tokens === null ? (
          !error && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No connector tokens yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {t.name} <span className="font-mono text-xs text-muted-foreground">…{t.hint}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(t.createdAt).toLocaleDateString()} ·{" "}
                    {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleString()}` : "never used"}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => revoke(t.id)}>
                  <Trash2 className="h-4 w-4" /> Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
