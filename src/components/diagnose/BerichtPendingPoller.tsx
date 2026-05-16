"use client";

// V6.3 SLC-105 MT-7 — Client-Polling auf capture_session.status.
//
// Pattern: setInterval alle 3s, fetch eines API-Routes der die Session-
// Status zurueckgibt. Bei status='finalized' router.push zur Bericht-Page.
// Bei status='failed' router.refresh damit Server-Component das Failure-
// Banner rendert (siehe bericht-pending/page.tsx).
//
// Ref: docs/ARCHITECTURE.md V6.3 Phase 5.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface BerichtPendingPollerProps {
  sessionId: string;
}

const POLL_MS = 3000;
const MAX_POLLS = 60; // 3 Minuten Hard-Stop

export function BerichtPendingPoller({ sessionId }: BerichtPendingPollerProps) {
  const router = useRouter();
  const [polls, setPolls] = useState(0);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(
          `/api/diagnose/${sessionId}/status`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          throw new Error(`status fetch failed: ${res.status}`);
        }
        const body = (await res.json()) as { status?: string };
        if (cancelled) return;

        if (body.status === "finalized") {
          router.push(`/dashboard/diagnose/${sessionId}/bericht`);
          return;
        }
        if (body.status === "failed") {
          router.refresh();
          return;
        }

        setPolls((p) => p + 1);
      } catch {
        // Schluck Netz-Fehler — naechster Poll versucht erneut.
        if (!cancelled) setPolls((p) => p + 1);
      }
    }

    if (polls >= MAX_POLLS) {
      setTimedOut(true);
      return;
    }

    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, polls, router]);

  if (timedOut) {
    return (
      <p className="text-sm text-amber-700">
        Der Bericht braucht laenger als gewoehnlich. Bitte aktualisieren Sie
        die Seite in einer Minute oder kontaktieren Sie Strategaize.
      </p>
    );
  }

  return (
    <p className="text-sm text-slate-500">
      Pruefe Status... ({polls > 0 ? `${polls * 3}s` : "gleich"})
    </p>
  );
}
