"use client";

import { createContext, useContext, useCallback, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useData } from "@/contexts/DataContext";

const transport = new DefaultChatTransport({ api: "/api/agent" });

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

type ChatContextValue = {
  messages: UIMessage[];
  sendMessage: (opts: { text: string }) => void;
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
  status: ChatStatus;
  error: Error | undefined;
  stop: () => void;
  clearError: () => void;
  newChat: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const chat = useChat({ transport });
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

  const value: ChatContextValue = {
    messages: chat.messages,
    sendMessage: chat.sendMessage,
    setMessages: chat.setMessages,
    status: chat.status as ChatStatus,
    error: chat.error,
    stop: chat.stop,
    clearError: chat.clearError,
    newChat,
  };

  return <ChatContext value={value}>{children}</ChatContext>;
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
