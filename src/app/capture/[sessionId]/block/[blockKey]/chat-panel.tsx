"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Sparkles, X } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface Props {
  sessionId: string;
  blockKey: string;
  questionId: string;
  questionText: string;
  currentAnswer: string;
  onInsertDraft: (draft: string) => void;
  onClose: () => void;
}

export function ChatPanel({
  sessionId,
  blockKey,
  questionId,
  questionText,
  currentAnswer,
  onInsertDraft,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    const userMsg: ChatMessage = { role: "user", text: userText };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          blockKey,
          questionId,
          message: userText,
          chatHistory: messages,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.response },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "KI-Antwort konnte nicht geladen werden." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Verbindungsfehler. Bitte erneut versuchen." },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }

  return (
    <div className="w-[380px] flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-primary flex-shrink-0" />
            KI-Assistent
          </h3>
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {questionText}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors flex-shrink-0 ml-2"
        >
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Sparkles className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              Stellen Sie dem KI-Assistenten Fragen zu diesem Thema.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Der Assistent hilft Ihnen, eine vollständige Antwort zu formulieren.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-brand-primary text-white rounded-br-sm"
                  : "bg-slate-100 text-slate-700 rounded-bl-sm"
              }`}
            >
              {msg.text}
              {/* Insert-as-draft button on assistant messages */}
              {msg.role === "assistant" && (
                <div className="mt-2 pt-2 border-t border-slate-200/50">
                  <button
                    onClick={() => onInsertDraft(msg.text)}
                    className="text-xs font-medium text-brand-primary hover:text-brand-primary-dark transition-colors"
                  >
                    Als Antwort übernehmen
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 text-brand-primary animate-spin" />
              <span className="text-xs text-slate-500">Denkt nach...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-slate-200">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Frage stellen..."
            rows={2}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:border-brand-primary focus:outline-none transition-colors resize-none"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            size="sm"
            className="flex-shrink-0"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
