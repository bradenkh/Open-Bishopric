"use client";

import { createContext, useContext, useCallback, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { useData } from "@/contexts/DataContext";

const transport = new DefaultChatTransport({ api: "/api/agent" });

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

/**
 * Respond to a tool that's waiting on the user (e.g. an email pending review).
 * `approved: true` lets the tool run; `approved: false` with a `reason` sends
 * the user's feedback back to the assistant so it can revise and try again.
 */
type ApprovalResponse = (opts: { id: string; approved: boolean; reason?: string }) => void;

type ChatContextValue = {
  messages: UIMessage[];
  sendMessage: (opts: { text: string }) => void;
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
  status: ChatStatus;
  error: Error | undefined;
  stop: () => void;
  clearError: () => void;
  newChat: () => void;
  respondToApproval: ApprovalResponse;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const chat = useChat({
    transport,
    // When the user approves or declines a tool that needs review (e.g. sending
    // an email), automatically forward that decision to the server so the
    // assistant continues — sending the message, or revising it from feedback.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const { reloadAll } = useData();

  const prevStatus = useRef(chat.status);
  useEffect(() => {
    const finished = prevStatus.current !== "ready" && chat.status === "ready";
    prevStatus.current = chat.status;
    if (!finished) return;
    const last = chat.messages[chat.messages.length - 1];
    const usedTools =
      last?.role === "assistant" &&
      last.parts?.some(
        (p) => p.type.startsWith("tool-") || p.type === "dynamic-tool",
      );
    if (usedTools) void reloadAll();
  }, [chat.status, chat.messages, reloadAll]);

  const newChat = useCallback(() => {
    chat.stop();
    chat.setMessages([]);
    chat.clearError();
  }, [chat]);

  const respondToApproval = useCallback<ApprovalResponse>(
    ({ id, approved, reason }) => {
      void chat.addToolApprovalResponse({ id, approved, reason });
    },
    [chat],
  );

  const value: ChatContextValue = {
    messages: chat.messages,
    sendMessage: chat.sendMessage,
    setMessages: chat.setMessages,
    status: chat.status as ChatStatus,
    error: chat.error,
    stop: chat.stop,
    clearError: chat.clearError,
    newChat,
    respondToApproval,
  };

  return <ChatContext value={value}>{children}</ChatContext>;
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
