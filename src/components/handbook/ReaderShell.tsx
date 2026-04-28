"use client";

// SLC-044 MT-2/3/4/5 — Reader-Shell: 2-Pane-Layout fuer den In-App-Reader.
//
// Hosting fuer ReaderSidebar + HandbookReader. Eigene Sidebar (kein
// DashboardSidebar-Wrapper) — der Reader profitiert von voller Bildschirmbreite,
// Navigation passiert ueber die Section-Liste links + den "Zurueck"-Link.
//
// Mobile: Sidebar collapsiert via useState. Desktop: Sidebar fix 320px breit.

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  Download,
  Loader2,
  Menu,
  X,
} from "lucide-react";

import { HandbookReader } from "./HandbookReader";
import { ReaderSidebar } from "./ReaderSidebar";
import type {
  ReaderSnapshotHeaderInfo,
  ReaderSnapshotMeta,
} from "./types";
import type { SectionFile } from "@/lib/handbook/load-snapshot-content";

interface ReaderShellProps {
  snapshotId: string;
  snapshotMeta: ReaderSnapshotHeaderInfo;
  snapshotList: ReaderSnapshotMeta[];
  sections: SectionFile[];
  indexMarkdown: string | null;
  isStale: boolean;
  isStrategaizeAdmin: boolean;
  captureSessionId: string;
}

const SECTION_ID_PREFIX = "handbook-section-";

export function sectionDomId(sectionKey: string): string {
  return `${SECTION_ID_PREFIX}${sectionKey}`;
}

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return "–";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function ReaderShell({
  snapshotId,
  snapshotMeta,
  snapshotList,
  sections,
  indexMarkdown,
  isStale,
  isStrategaizeAdmin,
  captureSessionId,
}: ReaderShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSectionSelect = useCallback((sectionKey: string) => {
    if (typeof window === "undefined") return;
    const el = document.getElementById(sectionDomId(sectionKey));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setSidebarOpen(false);
    }
  }, []);

  const isReady = snapshotMeta.status === "ready";
  const isFailed = snapshotMeta.status === "failed";
  const isGenerating = snapshotMeta.status === "generating";

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden"
        aria-label={sidebarOpen ? "Sidebar schliessen" : "Sidebar oeffnen"}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[320px] transform overflow-y-auto border-r border-slate-200 bg-white transition-transform duration-300 lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <ReaderSidebar
          sections={sections}
          snapshots={snapshotList}
          activeSnapshotId={snapshotId}
          onSectionSelect={handleSectionSelect}
        />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex-shrink-0 border-b border-slate-200/60 bg-white/95 backdrop-blur-xl shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 pl-14 lg:pl-6">
            <div className="min-w-0">
              <Link
                href="/dashboard/handbook"
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Alle Snapshots
              </Link>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                Unternehmerhandbuch
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                {snapshotMeta.tenantName
                  ? `${snapshotMeta.tenantName} · `
                  : ""}
                Stand {snapshotMeta.createdAtFormatted}
                {isReady && snapshotMeta.sizeBytes
                  ? ` · ${formatBytes(snapshotMeta.sizeBytes)}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {isReady && (
                <a
                  href={`/api/handbook/${snapshotId}/download`}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  download
                >
                  <Download className="h-4 w-4" />
                  ZIP herunterladen
                </a>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
            {isStale && isReady && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <div className="font-semibold">Snapshot moeglicherweise veraltet</div>
                  <p className="mt-0.5 text-amber-800">
                    Seit der Erstellung dieses Snapshots wurden weitere Bloecke abgeschlossen.
                    Erzeuge ein neues Handbuch, um die aktuellsten Inhalte zu lesen.
                  </p>
                </div>
              </div>
            )}

            {isGenerating && (
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <Loader2 className="h-4 w-4 animate-spin" />
                Handbuch wird im Hintergrund erzeugt. Lade die Seite in einigen
                Sekunden neu.
              </div>
            )}

            {isFailed && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <div className="font-semibold">Generierung fehlgeschlagen</div>
                  {snapshotMeta.errorMessage && (
                    <p className="mt-0.5 break-words text-red-800">
                      {snapshotMeta.errorMessage}
                    </p>
                  )}
                </div>
              </div>
            )}

            {snapshotMeta.errorMessage && isReady && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                Fehler beim Laden der Markdown-Inhalte: {snapshotMeta.errorMessage}
              </div>
            )}

            {isReady && sections.length === 0 && !snapshotMeta.errorMessage && (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
                Dieser Snapshot enthaelt keine lesbaren Markdown-Sektionen. Lade das
                ZIP herunter, um den vollen Inhalt zu pruefen.
              </div>
            )}

            {isReady && sections.length > 0 && (
              <HandbookReader
                sections={sections}
                indexMarkdown={indexMarkdown}
                isStrategaizeAdmin={isStrategaizeAdmin}
                captureSessionId={captureSessionId}
                sectionDomIdFn={sectionDomId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
