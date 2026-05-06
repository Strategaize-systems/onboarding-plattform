"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmWalkthroughUploaded,
  requestWalkthroughUpload,
} from "@/app/actions/walkthrough";
import {
  INITIAL_CAPTURE_CONTEXT,
  WALKTHROUGH_AUTO_STOP_MS,
  WALKTHROUGH_AUTO_STOP_WARN_MS,
  formatRemaining,
  pickMimeType,
  scheduleAutoStop,
  transition,
  type WalkthroughCaptureContext,
  type WalkthroughCaptureEvent,
} from "./walkthrough-capture-logic";

/**
 * SLC-071 MT-6 — Walkthrough Capture Client Component.
 *
 * Records the user's screen + microphone via getDisplayMedia/getUserMedia,
 * uploads the resulting WebM directly to Supabase Storage via a signed URL,
 * and confirms the upload to enqueue the SLC-072 transcription job.
 *
 * State machine + codec selection live in walkthrough-capture-logic.ts so the
 * non-DOM logic can be tested in vitest's node environment.
 */

interface Props {
  captureSessionId: string;
  /** Used in the redirect target after a successful upload. */
  ownerLabel?: string;
}

const TICK_MS = 1000;

function useCaptureMachine() {
  return useReducer(
    (
      ctx: WalkthroughCaptureContext,
      event: WalkthroughCaptureEvent
    ): WalkthroughCaptureContext => transition(ctx, event),
    INITIAL_CAPTURE_CONTEXT
  );
}

export function WalkthroughCapture({ captureSessionId, ownerLabel }: Props) {
  const router = useRouter();
  const [ctx, dispatch] = useCaptureMachine();

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const autoStopHandleRef = useRef<{ clear: () => void } | null>(null);
  const startedDurationRef = useRef<number>(0);

  const [remainingMs, setRemainingMs] = useState<number>(WALKTHROUGH_AUTO_STOP_MS);
  const [uploadPercent, setUploadPercent] = useState<number>(0);

  const stopAllTracks = useCallback(() => {
    [streamRef.current, audioStreamRef.current, displayStreamRef.current].forEach(
      (s) => s?.getTracks().forEach((t) => t.stop())
    );
    streamRef.current = null;
    audioStreamRef.current = null;
    displayStreamRef.current = null;
  }, []);

  // Tick the remaining-time display once per second while recording.
  useEffect(() => {
    if (ctx.state !== "recording") return;
    const interval = setInterval(() => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, WALKTHROUGH_AUTO_STOP_MS - elapsed);
      setRemainingMs(remaining);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [ctx.state]);

  // Cleanup on unmount: stop tracks + clear timers + abort recorder.
  useEffect(() => {
    return () => {
      autoStopHandleRef.current?.clear();
      try {
        if (
          recorderRef.current &&
          recorderRef.current.state !== "inactive"
        ) {
          recorderRef.current.stop();
        }
      } catch {
        // ignore — we're tearing down anyway.
      }
      stopAllTracks();
    };
  }, [stopAllTracks]);

  const fail = useCallback((message: string) => {
    autoStopHandleRef.current?.clear();
    autoStopHandleRef.current = null;
    stopAllTracks();
    dispatch({ type: "ERROR", message });
  }, [dispatch, stopAllTracks]);

  /**
   * Stop the recorder and let `onstop` carry the Blob into the upload phase.
   * Setting state -> 'stopping' first prevents double-clicks on the button.
   */
  const stopRecording = useCallback(() => {
    autoStopHandleRef.current?.clear();
    autoStopHandleRef.current = null;
    dispatch({ type: "STOP" });
    const startedAt = startedAtRef.current;
    startedDurationRef.current = startedAt
      ? Math.round((Date.now() - startedAt) / 1000)
      : 0;
    try {
      if (
        recorderRef.current &&
        recorderRef.current.state !== "inactive"
      ) {
        recorderRef.current.stop();
      }
    } catch (e) {
      fail(`Stoppen der Aufnahme fehlgeschlagen: ${(e as Error).message}`);
    }
  }, [dispatch, fail]);

  /**
   * Direct PUT to the signed Supabase Storage URL. We use XMLHttpRequest
   * because fetch does not expose upload progress events in browsers yet.
   */
  const putBlob = useCallback(
    (uploadUrl: string, blob: Blob, mimeType: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", mimeType);
        xhr.upload.onprogress = (ev) => {
          if (!ev.lengthComputable) return;
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setUploadPercent(pct);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else
            reject(
              new Error(
                `Upload fehlgeschlagen mit HTTP ${xhr.status}: ${xhr.responseText}`
              )
            );
        };
        xhr.onerror = () =>
          reject(new Error("Netzwerkfehler waehrend Upload"));
        xhr.send(blob);
      });
    },
    []
  );

  const finalizeUpload = useCallback(
    async (mimeType: string) => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];

      try {
        const reqResult = await requestWalkthroughUpload({
          captureSessionId,
          estimatedDurationSec: startedDurationRef.current || 1,
        });

        dispatch({ type: "RECORDER_STOPPED" });
        await putBlob(reqResult.uploadUrl, blob, mimeType);
        dispatch({ type: "UPLOAD_DONE" });

        await confirmWalkthroughUploaded({
          walkthroughSessionId: reqResult.walkthroughSessionId,
          durationSec: startedDurationRef.current,
          fileSizeBytes: blob.size,
        });

        dispatch({ type: "CONFIRMED" });
        router.push(`/employee/walkthroughs/${reqResult.walkthroughSessionId}`);
      } catch (e) {
        fail(`Upload-Fehler: ${(e as Error).message}`);
      }
    },
    [captureSessionId, dispatch, fail, putBlob, router]
  );

  const startRecording = useCallback(async () => {
    dispatch({ type: "START" });

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getDisplayMedia !== "function"
    ) {
      fail(
        "Dieser Browser unterstuetzt keine Bildschirm-Aufnahme. Bitte aktuelles Chrome oder Edge benutzen."
      );
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      fail("Dieser Browser unterstuetzt keine Aufnahme-Funktion (MediaRecorder).");
      return;
    }

    const codec = pickMimeType((m) => MediaRecorder.isTypeSupported(m));
    if (!codec.mimeType) {
      fail(
        "Dieser Browser unterstuetzt kein WebM-Recording (vp9/vp8). Bitte Chrome oder Edge verwenden."
      );
      return;
    }

    let displayStream: MediaStream;
    let audioStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      displayStreamRef.current = displayStream;
    } catch (e) {
      fail(`Bildschirm-Freigabe abgelehnt oder fehlgeschlagen: ${(e as Error).message}`);
      return;
    }
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = audioStream;
    } catch (e) {
      fail(`Mikrofon-Freigabe abgelehnt oder fehlgeschlagen: ${(e as Error).message}`);
      return;
    }

    const videoTrack = displayStream.getVideoTracks()[0];
    const audioTrack = audioStream.getAudioTracks()[0];
    if (!videoTrack || !audioTrack) {
      fail("Bildschirm- oder Mikrofon-Track fehlt.");
      return;
    }

    // If the user stops sharing via the browser chrome, stop the recording.
    videoTrack.addEventListener("ended", () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        stopRecording();
      }
    });

    const combined = new MediaStream([videoTrack, audioTrack]);
    streamRef.current = combined;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(combined, { mimeType: codec.mimeType });
    } catch (e) {
      fail(`MediaRecorder-Erzeugung fehlgeschlagen: ${(e as Error).message}`);
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      stopAllTracks();
      void finalizeUpload(codec.mimeType!);
    };
    recorder.onerror = (ev) => {
      const err = (ev as unknown as { error?: Error }).error;
      fail(`MediaRecorder-Fehler: ${err?.message ?? "unknown"}`);
    };

    recorder.start();
    startedAtRef.current = Date.now();
    setRemainingMs(WALKTHROUGH_AUTO_STOP_MS);

    autoStopHandleRef.current = scheduleAutoStop(() => {
      // Browser-side hard cap (DEC-076). The server enforces it again.
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        stopRecording();
      }
    });

    dispatch({ type: "PERMISSIONS_GRANTED" });
  }, [dispatch, fail, finalizeUpload, stopAllTracks, stopRecording]);

  const remainingLabel = formatRemaining(remainingMs);
  const showWarning =
    ctx.state === "recording" &&
    remainingMs <= WALKTHROUGH_AUTO_STOP_MS - WALKTHROUGH_AUTO_STOP_WARN_MS;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Walkthrough-Aufnahme
        </div>
        <h1 className="mb-4 text-2xl font-bold text-slate-900">
          Bildschirm + Mikrofon aufnehmen
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate-600">
          {ownerLabel
            ? `Aufnahme fuer: ${ownerLabel}. `
            : ""}
          Du wirst nach der Berechtigung fuer Bildschirm und Mikrofon gefragt.
          Maximale Aufnahmedauer: 30 Minuten.
        </p>

        {ctx.state === "idle" || ctx.state === "failed" ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Walkthrough starten
          </button>
        ) : null}

        {ctx.state === "requesting" ? (
          <div className="text-sm text-slate-600">
            Warte auf Bildschirm- und Mikrofon-Freigabe…
          </div>
        ) : null}

        {ctx.state === "recording" ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-600" />
              <span className="font-mono text-lg text-slate-900">
                Aufnahme laeuft · Restzeit {remainingLabel}
              </span>
            </div>
            {showWarning ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                Noch weniger als 5 Minuten. Die Aufnahme stoppt automatisch bei
                30 Minuten.
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => stopRecording()}
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-red-700"
            >
              Aufnahme stoppen
            </button>
          </div>
        ) : null}

        {ctx.state === "stopping" ? (
          <div className="text-sm text-slate-600">Aufnahme wird beendet…</div>
        ) : null}

        {ctx.state === "uploading" ? (
          <div className="space-y-3">
            <div className="text-sm text-slate-600">Hochladen…</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-slate-900 transition-all"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>
            <div className="text-xs text-slate-500">{uploadPercent}%</div>
          </div>
        ) : null}

        {ctx.state === "uploaded" ? (
          <div className="text-sm text-emerald-700">
            Upload abgeschlossen. Du wirst weitergeleitet…
          </div>
        ) : null}

        {ctx.state === "failed" && ctx.errorMessage ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <strong className="font-semibold">Fehler:</strong> {ctx.errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
