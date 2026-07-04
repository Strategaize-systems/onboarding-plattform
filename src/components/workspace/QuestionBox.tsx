// SLC-182 MT-3 / SLC-184 MT-3 — Frage-Box (freie Frage an den Berater-Workspace).
// Text-Eingabe + Submit + Sprach-Eingabe (SLC-184: MediaRecorder → /api/admin/transcribe).
// onSubmit(question) treibt in der Shell die RAG-Kette.
//
// Sprach-Aufnahme-Pattern reused aus
// src/app/capture/[sessionId]/block/[blockKey]/questionnaire-form.tsx (startRecording/
// stopRecording/transcribeRecording), gegen die admin-gated Transcribe-Route.
"use client";

import { useRef, useState } from "react";
import { Loader2, Mic, Send, Square } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface QuestionBoxProps {
  onSubmit: (question: string) => void;
  /** true wenn kein Mandant gewaehlt ist → Submit gesperrt, Hinweis sichtbar (fail-closed UX). */
  disabled?: boolean;
  disabledHint?: string;
  /** true waehrend eine Antwort laeuft → Submit gesperrt. */
  busy?: boolean;
}

export function QuestionBox({ onSubmit, disabled, disabledHint, busy }: QuestionBoxProps) {
  const [question, setQuestion] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const trimmed = question.trim();
  const canSubmit = trimmed.length > 0 && !disabled && !busy && !isRecording;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mimeType = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";
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
        void transcribeRecording(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      /* mic not available — Text-Eingabe bleibt moeglich (R-184-2 fail-open) */
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }

  async function transcribeRecording(audioBlob: Blob) {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      const res = await fetch("/api/admin/transcribe", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Transkription fehlgeschlagen" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { text } = await res.json();
      if (text) setQuestion((prev) => (prev ? `${prev} ${text}` : text));
    } catch (err) {
      // fail-open: Sprach-Fehler blockiert die Text-Eingabe nicht (R-184-2).
      console.error("Transkription fehlgeschlagen:", err);
    } finally {
      setIsTranscribing(false);
    }
  }

  const micTitle = isRecording ? "Aufnahme stoppen" : "Frage diktieren";

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <label htmlFor="workspace-question" className="block text-sm font-semibold text-slate-900">
        Freie Frage an deinen Workspace
      </label>
      <Textarea
        id="workspace-question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="z. B. „Welche Cashflow-Risiken hat dieser Mandant zuletzt gemeldet?“"
        className="min-h-[96px] resize-y"
      />
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing || busy}
          title={micTitle}
          aria-label={micTitle}
          className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
            isRecording
              ? "border-red-300 bg-red-50 text-red-600"
              : "border-slate-200 text-slate-500 hover:bg-slate-50 disabled:text-slate-300"
          } disabled:cursor-not-allowed`}
        >
          {isTranscribing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isRecording ? (
            <Square className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
        <div className="flex items-center gap-3">
          {disabled && disabledHint ? (
            <span className="text-xs text-slate-400">{disabledHint}</span>
          ) : null}
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>Frage stellen</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
