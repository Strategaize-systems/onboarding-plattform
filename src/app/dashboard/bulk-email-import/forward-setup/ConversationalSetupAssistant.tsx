"use client";

// V9.1 SLC-V9.1-D MT-3b — Conversational-First Setup-Assistent.
//
// Conversational-First ist BLOCKING (feedback-strategaize-conversational-first-ux):
// der GF beschreibt in eigenen Worten (getippt ODER per Sprache), welche Emails
// er weiterleiten will. Der Assistent schickt die Beschreibung an suggestSetup
// (Bedrock-Sonnet, eu-central-1) und schlaegt Local-Part + Allowlist-Patterns
// vor. Per "Vorschlag uebernehmen" werden diese in das Setup-Formular vorbefuellt.
//
// Voice-Input portiert das in-repo OP-Pattern aus
// src/app/capture/[sessionId]/block/[blockKey]/questionnaire-form.tsx
// (MediaRecorder -> /api/tenant/transcribe, returns { transcript }).

import { useRef, useState, useTransition } from "react";
import {
  Sparkles,
  Mic,
  Square,
  Loader2,
  Send,
  AlertCircle,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { suggestSetup } from "./actions";
import type { SetupSuggestion } from "@/lib/bulk-email/ai-assisted-setup";

interface ConversationalSetupAssistantProps {
  /** Uebernimmt den Vorschlag ins Setup-Formular (Local-Part + Allowlist). */
  onApply: (suggestion: SetupSuggestion) => void;
}

const MAX_RECORDING_SECONDS = 300;

export function ConversationalSetupAssistant({
  onApply,
}: ConversationalSetupAssistantProps) {
  const [input, setInput] = useState("");
  const [suggestion, setSuggestion] = useState<SetupSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ─── Voice-State (OP in-repo Pattern) ───
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function submit() {
    const description = input.trim();
    if (description.length === 0 || isPending) return;
    setError(null);
    startTransition(async () => {
      let result;
      try {
        result = await suggestSetup(description);
      } catch (err) {
        setError((err as Error).message);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuggestion(result.suggestion);
    });
  }

  // ─── Voice recording (portiert aus questionnaire-form.tsx) ───
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
          mimeType = "audio/webm;codecs=opus";
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
        transcribeRecording(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
      let elapsed = 0;
      recordingTimerRef.current = setInterval(() => {
        elapsed += 1;
        if (elapsed >= MAX_RECORDING_SECONDS) stopRecording();
      }, 1000);
    } catch {
      /* Mikrofon nicht verfuegbar / abgelehnt — Tipp-Eingabe bleibt moeglich */
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
      const res = await fetch("/api/tenant/transcribe", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Transkription fehlgeschlagen" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { transcript } = await res.json();
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    } catch (err) {
      setError(`Spracheingabe fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      setIsTranscribing(false);
    }
  }

  const micBusy = isRecording || isTranscribing;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-primary" />
        <p className="text-sm text-slate-700">
          Beschreibe einfach in eigenen Worten, welche Emails du an Strategaize
          weiterleiten moechtest — getippt oder per Sprache. Beispiel: &bdquo;Alle
          Mails von meinem Steuerberater und von kanzlei-mueller.de&ldquo;. Ich
          schlage dir dann einen passenden Posteingang vor.
        </p>
      </div>

      <div className="space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Was moechtest du weiterleiten?"
          rows={3}
          disabled={isPending}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={isRecording ? "destructive" : "outline"}
            size="icon"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing || isPending}
            aria-label={isRecording ? "Aufnahme stoppen" : "Spracheingabe starten"}
            title={isRecording ? "Aufnahme stoppen" : "Spracheingabe starten"}
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
          {isRecording && (
            <span className="flex items-center gap-1.5 text-xs text-red-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Aufnahme laeuft &hellip;
            </span>
          )}
          {isTranscribing && (
            <span className="text-xs text-slate-500">Transkribiere &hellip;</span>
          )}
          <Button
            type="button"
            onClick={submit}
            disabled={input.trim().length === 0 || isPending || micBusy}
            className="ml-auto"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Denke nach &hellip;
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Vorschlag erzeugen
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {error}
        </p>
      )}

      {suggestion && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-brand-primary" />
            <span className="text-sm font-medium text-slate-900">
              Vorschlag des Assistenten
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Local-Part
            </span>
            <code className="block rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-800">
              {suggestion.suggestedLocalPart}
            </code>
          </div>

          {suggestion.suggestedAllowlistPatterns.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Vorgeschlagene Absender-Allowlist
              </span>
              <div className="flex flex-wrap gap-1.5">
                {suggestion.suggestedAllowlistPatterns.map((p) => (
                  <Badge key={p} variant="secondary" className="font-mono">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <p className="text-sm text-slate-600">{suggestion.reasoning}</p>

          <Button type="button" size="sm" onClick={() => onApply(suggestion)}>
            <Wand2 className="h-4 w-4" />
            Vorschlag uebernehmen
          </Button>
        </div>
      )}
    </div>
  );
}
