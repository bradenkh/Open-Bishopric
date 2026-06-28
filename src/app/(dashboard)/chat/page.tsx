"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { isToolUIPart } from "ai";
import {
  Send,
  Bot,
  User,
  Loader2,
  Church,
  AlertCircle,
  SquarePlus,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Response } from "@/components/ai-elements/response";
import { Tool } from "@/components/ai-elements/tool";
import { useChatContext } from "@/contexts/ChatContext";
import { cn } from "@/lib/utils";

export default function ChatPage() {
  const { messages, sendMessage, status, error, stop, newChat } =
    useChatContext();
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:h-screen">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <Church className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-sm font-semibold">AI Assistant</h1>
          <p className="text-xs text-muted-foreground">
            Ask anything about the ward
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isLoading && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={stop}
              title="Stop generating"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          )}
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={newChat}
              title="New chat"
            >
              <SquarePlus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">How can I help?</h2>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Ask about members, tasks, callings, or anything else related to
              bishopric work.
            </p>
          </div>
          <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setInput(s);
                  textareaRef.current?.focus();
                }}
                className="rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Conversation className="flex-1">
          <ConversationContent className="space-y-4">
            {messages.map((m) => {
              const parts =
                m.parts?.filter(
                  (p) => p.type === "text" || isToolUIPart(p),
                ) ?? [];
              if (parts.length === 0) return null;
              const isUser = m.role === "user";
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex gap-3",
                    isUser ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                    )}
                  >
                    {isUser ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex max-w-[80%] flex-col gap-2">
                    {parts.map((part, i) => {
                      if (isToolUIPart(part)) {
                        return <Tool key={i} part={part} />;
                      }
                      const text = (part as { type: "text"; text: string })
                        .text;
                      return isUser ? (
                        <div
                          key={i}
                          className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">
                            {text}
                          </p>
                        </div>
                      ) : (
                        <div
                          key={i}
                          className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm"
                        >
                          <Response>{text}</Response>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {status === "submitted" && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      {error &&
        (() => {
          const { text, showSettings } = parseChatError(error.message);
          return (
            <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive lg:mx-6">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {text}
                {showSettings && (
                  <>
                    {" "}
                    Check{" "}
                    <Link
                      href="/settings"
                      className="font-medium underline"
                    >
                      Settings &rarr; AI assistant
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
          );
        })()}

      <div className="border-t border-border p-3 lg:p-4">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about members, tasks, callings…"
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          {isLoading ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-11 w-11 shrink-0 rounded-xl"
              onClick={stop}
              title="Stop generating"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl"
              disabled={!input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          Enter to send &middot; Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function parseChatError(raw?: string): { text: string; showSettings: boolean } {
  let msg = (raw ?? "").trim();
  if (!msg) return { text: "The assistant is unavailable.", showSettings: true };
  if (msg.startsWith("{")) {
    try {
      const parsed = JSON.parse(msg);
      if (typeof parsed?.error === "string") msg = parsed.error;
    } catch {
      /* not JSON — use as-is */
    }
  }
  const transient = /try again|overload|briefly|busy|moment/i.test(msg);
  return { text: msg, showSettings: !transient };
}

const SUGGESTIONS = [
  "Add a temple recommend interview for Brother Smith",
  "Find open slots for the next interview to schedule",
  "Set this Sunday's opening hymn and speakers",
  "Show me callings in progress",
];
