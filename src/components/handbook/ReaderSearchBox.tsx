"use client";

// SLC-054 MT-3 — ReaderSearchBox: Cross-Snapshot-Suche in der Reader-Sidebar.
//
// Position per Q-V4.3-H: in der Sidebar oben, ueber der TOC-Liste. Eingabe
// triggert eine debounced Live-Suche (300ms) ueber alle Tenant-Snapshots
// (CrossSearchSnapshot-Liste vom Server). Bei Focus ohne Eingabe zeigt das
// Dropdown die Search-History (max 10 Eintraege per DEC-063).
//
// Klick auf einen Treffer navigiert zu /dashboard/handbook/<snapshotId>#<sectionDomId>
// und persistiert die Query in der History (addQuery).
//
// MT-6 Performance-Warning: bei snapshots.length > 20 zeigt eine kleine
// Hinweis-Zeile unter dem Input "Suche kann langsamer sein bei vielen Versionen".

import {
  Search,
  X,
  Clock,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSearchHistory } from "./use-search-history";
import {
  searchAcrossSnapshots,
  type CrossSearchSnapshot,
  type CrossSnapshotSearchResult,
} from "@/lib/handbook/cross-snapshot-search";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const PERFORMANCE_WARNING_THRESHOLD = 20;

interface ReaderSearchBoxProps {
  snapshots: CrossSearchSnapshot[];
  /** Mapper sectionKey → DOM-ID (vom Reader exportiert: sectionDomId). */
  sectionDomIdFn: (sectionKey: string) => string;
}

export function ReaderSearchBox({
  snapshots,
  sectionDomIdFn,
}: ReaderSearchBoxProps) {
  const router = useRouter();
  const { history, addQuery, clearHistory } = useSearchHistory();

  const [inputValue, setInputValue] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced query → Live-Search. setState passiert ausschliesslich im
  // Timeout-Callback, niemals synchron im Effect-Body (vermeidet kaskadierende
  // Renders bei jedem Tastendruck, react-hooks/set-state-in-effect).
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const trimmed = inputValue.trim();
    const next = trimmed.length >= MIN_QUERY_LENGTH ? trimmed : "";
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(next);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [inputValue]);

  // Click-Outside schliesst das Dropdown.
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: PointerEvent) {
      const root = containerRef.current;
      if (!root) return;
      if (e.target instanceof Node && !root.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const searchResults = useMemo<CrossSnapshotSearchResult[]>(() => {
    if (debouncedQuery.length < MIN_QUERY_LENGTH) return [];
    return searchAcrossSnapshots(debouncedQuery, snapshots);
  }, [debouncedQuery, snapshots]);

  const handleResultClick = useCallback(
    (result: CrossSnapshotSearchResult) => {
      addQuery(debouncedQuery || inputValue.trim());
      const target = `/dashboard/handbook/${result.snapshotId}#${sectionDomIdFn(result.sectionKey)}`;
      setIsOpen(false);
      setInputValue("");
      router.push(target);
    },
    [addQuery, debouncedQuery, inputValue, router, sectionDomIdFn],
  );

  const handleHistoryClick = useCallback((entry: string) => {
    setInputValue(entry);
    setDebouncedQuery(entry);
    inputRef.current?.focus();
  }, []);

  const handleClearInput = useCallback(() => {
    setInputValue("");
    setDebouncedQuery("");
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }, []);

  const isQueryActive = inputValue.trim().length >= MIN_QUERY_LENGTH;
  const showHistory = isOpen && !isQueryActive && history.length > 0;
  const showResults = isOpen && isQueryActive && debouncedQuery.length > 0;
  const showEmptyResults =
    isOpen &&
    isQueryActive &&
    debouncedQuery.length > 0 &&
    searchResults.length === 0;
  const showPerformanceWarning =
    snapshots.length > PERFORMANCE_WARNING_THRESHOLD;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="In allen Versionen suchen..."
          className="block w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
          data-testid="reader-cross-search-input"
          aria-label="In allen Versionen suchen"
          autoComplete="off"
        />
        {inputValue.length > 0 && (
          <button
            type="button"
            onClick={handleClearInput}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Suche zuruecksetzen"
            data-testid="reader-cross-search-clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showPerformanceWarning && (
        <div
          className="mt-1.5 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
          data-testid="reader-cross-search-perf-warning"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>
            Suche kann langsamer sein bei vielen Versionen ({snapshots.length}).
          </span>
        </div>
      )}

      {(showHistory || showResults || showEmptyResults) && (
        <div
          className="absolute z-50 mt-1 max-h-[360px] w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg"
          data-testid="reader-cross-search-dropdown"
        >
          {showHistory && (
            <div className="py-1">
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <Clock className="h-3 w-3" />
                Verlauf
              </div>
              <ul>
                {history.map((entry) => (
                  <li key={entry}>
                    <button
                      type="button"
                      onClick={() => handleHistoryClick(entry)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                      data-testid="reader-cross-search-history-item"
                    >
                      <Search className="h-3.5 w-3.5 text-slate-400" />
                      <span className="truncate">{entry}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  clearHistory();
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-left text-[11px] text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                data-testid="reader-cross-search-clear-history"
              >
                <Trash2 className="h-3 w-3" />
                Verlauf loeschen
              </button>
            </div>
          )}

          {showResults && searchResults.length > 0 && (
            <ul className="py-1">
              {searchResults.map((result) => (
                <li
                  key={`${result.snapshotId}::${result.sectionKey}`}
                >
                  <button
                    type="button"
                    onClick={() => handleResultClick(result)}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-slate-50"
                    data-testid="reader-cross-search-result"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold text-slate-900">
                        {result.sectionTitle}
                      </span>
                      <span className="flex-shrink-0 text-slate-500">
                        {result.snapshotDate}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-slate-600">
                      {result.snippet}
                    </p>
                    {result.matchCount > 1 && (
                      <span className="text-[10px] text-slate-400">
                        {result.matchCount} Treffer
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showEmptyResults && (
            <div className="px-3 py-3 text-xs text-slate-500">
              Keine Treffer fuer &quot;{debouncedQuery}&quot;.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
