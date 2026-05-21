"use client";

// V7.2 SLC-139 MT-4 (FEAT-058) — Bericht-Page session_completed-Beacon.
//
// Kleiner unsichtbarer Client-Hook, der genau einmal beim Mount der
// Bericht-Page das `session_completed`-Event via POST /api/diagnose-event
// feuert. Wird in der Server-Component-Bericht-Page eingehangen, damit
// die Bericht-Page selbst Server-Component bleiben kann (kein "use client"
// auf der ganzen Page).
//
// Verwendet kein DiagnoseTelemetryProvider, weil die Bericht-Page keinen
// durchgaengigen Tracker braucht (kein Heartbeat / visibilitychange /
// beforeunload-Tracking auf statischer Bericht-Ansicht).

import { useEffect, useRef } from "react";

interface DiagnoseSessionCompletedBeaconProps {
  captureSessionId: string;
  isTest?: boolean;
}

const ENDPOINT_PATH = "/api/diagnose-event";
const TEST_USER_LOCALSTORAGE_KEY = "strategaize:is_test_user";

function readIsTestFlag(): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(TEST_USER_LOCALSTORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function DiagnoseSessionCompletedBeacon({
  captureSessionId,
  isTest,
}: DiagnoseSessionCompletedBeaconProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (typeof fetch === "undefined") return;
    void fetch(ENDPOINT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capture_session_id: captureSessionId,
        event_type: "session_completed",
        question_key: null,
        payload: {},
        is_test: isTest ?? readIsTestFlag(),
      }),
      keepalive: true,
    }).catch(() => {
      // fire-and-forget.
    });
  }, [captureSessionId, isTest]);

  return null;
}
