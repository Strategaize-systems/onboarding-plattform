"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Send, Loader2, Mic, Square, StopCircle } from "lucide-react";
import { SoftLimitBanner } from "@/components/freeform/soft-limit-banner";

interface FreeformMessage {
  role: "user" | "assistant";
  text: string;
}

interface FreeformChatProps {
  runId: string;
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  onEndChat: () => void;
}

// End-chat button visible after 2 user messages (= 4 total messages incl. assistant replies)
const MIN_USER_MESSAGES_TO_END = 2;

export function FreeformChat({
  runId,
  conversationId,
  onConversationCreated,
  onEndChat,
}: FreeformChatProps) {
  const t = useTranslations("freeform.chat");
  const tCommon = useTranslations("common");

  // Chat state
  const [messages, setMessages] = useState<FreeformMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [softLimitReached, setSoftLimitReached] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice recording state
  const whisperEnabled = process.env.NEXT_PUBLIC_WHISPER_ENABLED === "true";
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const MAX_RECORDING_SECONDS = 300;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Add welcome message on mount only
  useEffect(() => {
    setMessages([{ role: "assistant", text: t("welcome") }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps — run only on mount
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const messageText = input.trim();
    const userMsg: FreeformMessage = { role: "user", text: messageText };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(
        `/api/tenant/runs/${runId}/freeform/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: messageText,
            conversationId: currentConversationId ?? undefined,
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.response },
        ]);

        // Track conversation ID from first response
        if (!currentConversationId && data.conversationId) {
          setCurrentConversationId(data.conversationId);
          onConversationCreated(data.conversationId);
        }

        // Track soft limit
        if (data.softLimitReached) {
          setSoftLimitReached(true);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: tCommon("networkError") },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: tCommon("networkError") },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, runId, currentConversationId, onConversationCreated, tCommon]);

  // ─── Voice Recording ─────────────────────────────────────────────
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        transcribeRecording(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev + 1 >= MAX_RECORDING_SECONDS) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      // Silently handle — mic not available
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  async function transcribeRecording(audioBlob: Blob) {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      const res = await fetch(`/api/tenant/transcribe`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.transcript?.trim()) {
          setInput((prev) => prev ? `${prev} ${data.transcript.trim()}` : data.transcript.trim());
        }
      }
    } catch {
      // Silently handle
    } finally {
      setIsTranscribing(false);
    }
  }

  function formatDuration(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // Count user messages (for end-chat visibility)
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const canEndChat = userMessageCount >= MIN_USER_MESSAGES_TO_END;

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loading")}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Soft limit banner */}
      {softLimitReached && (
        <SoftLimitBanner onEvaluate={onEndChat} />
      )}

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white p-4">
        {/* End Chat button row */}
        {canEndChat && (
          <div className="flex justify-end mb-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`font-semibold ${
                    softLimitReached
                      ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      : "text-slate-600"
                  }`}
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  {t("endChat")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("endChatConfirm")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("endChatConfirmText")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("endChatCancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onEndChat}
                    className="bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white"
                  >
                    {t("endChatConfirmButton")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={t("placeholder")}
            rows={3}
            className="flex-1 resize-none rounded-xl border-slate-200 focus:border-brand-primary"
            disabled={loading}
          />

          {/* Voice button */}
          {whisperEnabled && (
            <div className="flex flex-col items-center gap-1">
              {isRecording ? (
                <Button
                  onClick={stopRecording}
                  size="icon"
                  className="h-10 w-10 rounded-xl bg-red-500 hover:bg-red-600 text-white"
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={startRecording}
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 rounded-xl"
                  disabled={loading || isTranscribing}
                >
                  {isTranscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              )}
              {isRecording && (
                <span className="text-[10px] font-bold text-red-500 tabular-nums">
                  {formatDuration(recordingDuration)}
                </span>
              )}
            </div>
          )}

          {/* Send button */}
          <Button
            onClick={sendMessage}
            size="icon"
            className="h-10 w-10 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark text-white shadow-md hover:shadow-lg transition-all"
            disabled={!input.trim() || loading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
