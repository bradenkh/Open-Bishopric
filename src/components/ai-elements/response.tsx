"use client";

import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

/**
 * Streaming-aware markdown renderer for assistant replies — a thin wrapper over
 * Streamdown (the same engine behind Vercel AI Elements' <Response>). It handles
 * GFM tables, code highlighting, and half-finished markdown mid-stream.
 *
 * Vendored locally because the AI Elements shadcn registry isn't reachable from
 * this environment; drop-in compatible with `npx ai-elements@latest add response`.
 */
export function Response({
  className,
  ...props
}: React.ComponentProps<typeof Streamdown>) {
  return (
    <Streamdown
      className={cn(
        "space-y-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      {...props}
    />
  );
}
