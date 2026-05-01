"use client";

// SLC-044 MT-2/3/4/5 — Reader-Shell: 2-Pane-Layout fuer den In-App-Reader.
// SLC-045 MT-1 — SearchInput im Header + SearchResultsList ueber dem Markdown.
// SLC-045 MT-2 — Performance-Warning-Banner bei `isLargeSnapshot` + 500ms Debounce.
// SLC-045 MT-3 — Keyboard-Shortcuts (Ctrl/Cmd+F oeffnet Suche, Esc schliesst).
//
// Hosting fuer ReaderSidebar + HandbookReader. Eigene Sidebar (kein
// DashboardSidebar-Wrapper) — der Reader profitiert von voller Bildschirmbreite,
// Navigation passiert ueber die Section-Liste links + den "Zurueck"-Link.
//
// Mobile: Sidebar collapsiert via useState. Desktop: Sidebar fix 320px breit.

import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  AlertTriangle,
  Download,
  Info,
  Loader2,
  Menu,
  X,
} from "lucide-react";

import { HandbookReader } from "./HandbookReader";
import { ReaderSidebar } from "./ReaderSidebar";
import { SearchInput, type SearchInputHandle } from "./SearchInput";
import { SearchResultsList } from "./SearchResultsList";
import type {
  ReaderSnapshotHeaderInfo,
  ReaderSnapshotMeta,
} from "./types";
import type { SectionFile } from "@/lib/handbook/load-snapshot-content";
import {
  extractSnippetsFromMarkdown,
  type SectionSearchResult,
} from "@/lib/handbook/search";

interface ReaderShellProps {
  snapshotId: string;
  snapshotMeta: ReaderSnapshotHeaderInfo;
  snapshotList: ReaderSnapshotMeta[];
  sections: SectionFile[];
  indexMarkdown: string | null;
  isStale: boolean;
  isStrategaizeAdmin: boolean;
  captureSessionId: string;
  /** SLC-045 MT-2: total Markdown bytes > 500_000 → isLargeSnapshot=true. */
  isLargeSnapshot: boolean;
  /** SLC-045 MT-2: Anzeigewert (KB) fuer das Banner. */
  totalMarkdownBytes: number;
  /** SLC-050 MT-4: optionaler Help-Trigger im Header (vom Server vorgerendert). */
  helpTrigger?: ReactNode;
}

const SECTION_ID_PREFIX = "handbook-section-";
const LARGE_SNAPSHOT_DEBOUNCE_MS = 500;
const NORMAL_DEBOUNCE_MS = 200;

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
  isLargeSnapshot,
  totalMarkdownBytes,
  helpTrigger,
}: ReaderShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<SearchInputHandle>(null);

  const handleSectionSelect = useCallback((sectionKey: string) => {
    if (typeof window === "undefined") return;
    const el = document.getElementById(sectionDomId(sectionKey));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setSidebarOpen(false);
    }
  }, []);

  const handleJumpToMatch = useCallback((domId: string) => {
    if (typeof window === "undefined") return;
    const el = document.getElementById(domId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setSidebarOpen(false);
    el.classList.add("handbook-search-match-flash");
    window.setTimeout(() => {
      el.classList.remove("handbook-search-match-flash");
    }, 1500);
  }, []);

  // Section-Title-Map fuer die Treffer-Liste (sectionKey → Title).
  const sectionTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    m.set("__index", "Inhaltsverzeichnis");
    for (const s of sections) m.set(s.sectionKey, s.title);
    return m;
  }, [sections]);

  // Pro Section + INDEX die Treffer berechnen. Memoized auf (query, sections,
  // indexMarkdown), damit bei jedem Tastendruck nur einmal durchsucht wird.
  const searchResults = useMemo<SectionSearchResult[]>(() => {
    const q = searchQuery.trim();
    if (q.length < 3) return [];
    const out: SectionSearchResult[] = [];
    if (indexMarkdown) {
      out.push(
        extractSnippetsFromMarkdown({
          sectionKey: "__index",
          markdown: indexMarkdown,
          query: q,
        }),
      );
    }
    for (const s of sections) {
      out.push(
        extractSnippetsFromMarkdown({
          sectionKey: s.sectionKey,
          markdown: s.markdown,
          query: q,
        }),
      );
    }
    return out;
  }, [searchQuery, sections, indexMarkdown]);

  const totalMatches = searchResults.reduce((sum, r) => sum + r.matchCount, 0);
  const sectionsWithMatches = searchResults.filter((r) => r.matchCount > 0).length;

  // SLC-045 MT-3: Keyboard-Shortcuts.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac =
        typeof navigator !== "undefined" &&
        /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      if (cmd && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && searchQuery !== "") {
        searchInputRef.current?.clear();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchQuery]);

  const isReady = snapshotMeta.status === "ready";
  const isFailed = snapshotMeta.status === "failed";
  const isGenerating = snapshotMeta.status === "generating";

  const debounceMs = isLargeSnapshot
    ? LARGE_SNAPSHOT_DEBOUNCE_MS
    : NORMAL_DEBOUNCE_MS;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-white p-2 shadow-md lg:hidden print:hidden"
        aria-label={sidebarOpen ? "Sidebar schliessen" : "Sidebar oeffnen"}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden print:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[320px] transform overflow-y-auto border-r border-slate-200 bg-white transition-transform duration-300 lg:relative lg:translate-x-0 print:hidden ${
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
        <header className="flex-shrink-0 border-b border-slate-200/60 bg-white/95 backdrop-blur-xl shadow-sm print:hidden">
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
              {helpTrigger}
            </div>
          </div>

          {isReady && sections.length > 0 && (
            <div className="border-t border-slate-100 px-6 py-3 pl-14 lg:pl-6">
              <div className="mx-auto max-w-4xl">
                <SearchInput
                  ref={searchInputRef}
                  query={searchQuery}
                  onQueryChange={setSearchQuery}
                  totalMatches={totalMatches}
                  totalSectionsWithMatches={sectionsWithMatches}
                  debounceMs={debounceMs}
                />
              </div>
            </div>
          )}
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

            {isLargeSnapshot && isReady && (
              <div
                className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
                data-testid="reader-large-snapshot-banner"
              >
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <div className="font-semibold">
                    Grosser Snapshot ({formatBytes(totalMarkdownBytes)})
                  </div>
                  <p className="mt-0.5 text-blue-800">
                    Die Volltext-Suche kann hier eine halbe Sekunde brauchen, weil
                    sehr viel Text durchsucht wird.
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

            {isReady && sections.length > 0 && searchQuery.trim().length >= 3 && (
              <SearchResultsList
                query={searchQuery.trim()}
                results={searchResults}
                sectionTitleMap={sectionTitleMap}
                onJumpToMatch={handleJumpToMatch}
              />
            )}

            {isReady && sections.length > 0 && (
              <HandbookReader
                sections={sections}
                indexMarkdown={indexMarkdown}
                isStrategaizeAdmin={isStrategaizeAdmin}
                captureSessionId={captureSessionId}
                sectionDomIdFn={sectionDomId}
                searchQuery={searchQuery}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
