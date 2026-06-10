"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, Bot, User, Loader2, Church, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const transport = new DefaultChatTransport({ api: "/api/agent" });

export default function ChatPage() {
  const { messages, sendMessage, status, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        <div>
          <h1 className="text-sm font-semibold">AI Assistant</h1>
          <p className="text-xs text-muted-foreground">Ask anything about the ward</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">How can I help?</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                Ask about members, tasks, callings, or anything else related to bishopric work.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 w-full max-w-md">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                    textareaRef.current?.focus();
                  }}
                  className="rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-4 py-4 lg:px-6">
            {messages.map((m) => {
              const textParts = m.parts?.filter((p) => p.type === "text") ?? [];
              if (textParts.length === 0) return null;
              return (
                <div
                  key={m.id}
                  className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    {m.role === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted rounded-tl-sm"
                    )}
                  >
                    {textParts.map((part, i) => (
                      <p key={i} className="whitespace-pre-wrap leading-relaxed">
                        {(part as { type: "text"; text: string }).text}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive lg:mx-6">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            The assistant is unavailable. Make sure an API key is set under{" "}
            <Link href="/settings" className="font-medium underline">Settings → AI assistant</Link>,
            then try again.
          </p>
        </div>
      )}

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
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  "What tasks are overdue?",
  "Show me callings in progress",
  "How many active interviews are there?",
  "Create a follow-up task for Brother Smith",
];
