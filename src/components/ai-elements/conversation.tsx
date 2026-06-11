"use client";

import { ArrowDown } from "lucide-react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Auto-scrolling message container — sticks to the bottom as the assistant
 * streams, but lets the user scroll up. A thin wrapper over use-stick-to-bottom
 * (the engine behind Vercel AI Elements' <Conversation>), vendored locally
 * because the AI Elements registry isn't reachable from this environment.
 */
export function Conversation({ className, ...props }: React.ComponentProps<typeof StickToBottom>) {
  return (
    <StickToBottom
      className={cn("relative flex-1 overflow-y-auto", className)}
      initial="smooth"
      resize="smooth"
      role="log"
      {...props}
    />
  );
}

export function ConversationContent({
  className,
  ...props
}: React.ComponentProps<typeof StickToBottom.Content>) {
  return <StickToBottom.Content className={cn("p-4 lg:px-6", className)} {...props} />;
}

/** Floating "jump to latest" button — only shows when scrolled up. */
export function ConversationScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
      onClick={() => scrollToBottom()}
      title="Scroll to latest"
    >
      <ArrowDown className="h-4 w-4" />
    </Button>
  );
}
