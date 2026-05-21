"use client";

// SLC-139 MT-2 (FEAT-058) — React-Provider fuer Diagnose-Tracker.
// Konsumiert von Diagnose-Run-Page (MT-4 Wiring), exponiert tracker via Context
// damit QuestionCard / HelperTextModal / BerichtRenderer trackEvent aufrufen
// koennen. Tracker wird beim Mount erstellt + beim Unmount disposed.

import { createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { createDiagnoseTracker } from "@/lib/telemetry/diagnose";
import type { DiagnoseTracker } from "@/lib/telemetry/diagnose";
import type {
  DiagnoseEventInput,
  DiagnoseEventType,
} from "@/lib/telemetry/diagnose-event-types";

interface DiagnoseTelemetryProviderProps {
  captureSessionId: string;
  isTest?: boolean;
  children: ReactNode;
}

interface DiagnoseTelemetryContextValue {
  trackEvent: (input: DiagnoseEventInput) => void;
}

const DiagnoseTelemetryContext = createContext<DiagnoseTelemetryContextValue | null>(null);

const NO_OP_TRACKER: DiagnoseTelemetryContextValue = {
  trackEvent: () => {
    // SSR / Provider-frei: No-Op damit Komponenten ueberall trackEvent aufrufen koennen.
  },
};

export function DiagnoseTelemetryProvider({
  captureSessionId,
  isTest,
  children,
}: DiagnoseTelemetryProviderProps) {
  const trackerRef = useRef<DiagnoseTracker | null>(null);
  const questionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const tracker = createDiagnoseTracker(
      { captureSessionId, isTest, currentQuestionKeyRef: questionKeyRef },
    );
    trackerRef.current = tracker;
    return () => {
      tracker.dispose();
      trackerRef.current = null;
    };
  }, [captureSessionId, isTest]);

  const contextValue: DiagnoseTelemetryContextValue = {
    trackEvent: (input: DiagnoseEventInput) => {
      trackerRef.current?.trackEvent(input);
    },
  };

  return (
    <DiagnoseTelemetryContext.Provider value={contextValue}>
      {children}
    </DiagnoseTelemetryContext.Provider>
  );
}

export function useDiagnoseTelemetry(): DiagnoseTelemetryContextValue {
  return useContext(DiagnoseTelemetryContext) ?? NO_OP_TRACKER;
}

export type { DiagnoseEventType };
