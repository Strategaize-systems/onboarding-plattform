"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * SLC-040 — Auto-Refresh fuer Pages mit asynchronem Background-Job.
 *
 * Solange ein Snapshot status='generating' hat, ruft die Komponente alle
 * `intervalMs` Millisekunden router.refresh() auf, damit der Server die
 * Snapshot-Liste neu laedt und der Status-Badge automatisch wechselt.
 *
 * Bewusst kein meta-refresh: das wuerde die ganze Seite neu rendern und
 * Scrollposition + Toaster verlieren.
 */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
