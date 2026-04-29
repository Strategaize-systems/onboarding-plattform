"use client";

// SLC-045 MT-1 — Search-Input mit Debounce, Reset-Button und Treffer-Counter.
// Min-Trigger-Length: 3 Zeichen (siehe Slice AC-2). Debounce default 200ms,
// 500ms bei `isLargeSnapshot`.

import { Search, X, Loader2 } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

interface SearchInputProps {
  query: string;
  onQueryChange: (q: string) => void;
  totalMatches: number;
  totalSectionsWithMatches: number;
  debounceMs?: number;
  isPending?: boolean;
}

export interface SearchInputHandle {
  focus: () => void;
}

export const SearchInput = forwardRef<SearchInputHandle, SearchInputProps>(
  function SearchInput(
    {
      query,
      onQueryChange,
      totalMatches,
      totalSectionsWithMatches,
      debounceMs = 200,
      isPending = false,
    },
    ref,
  ) {
    const [localValue, setLocalValue] = useState(query);
    const inputRef = useRef<HTMLInputElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    // Aussen-Reset durch Esc oder onClear-Aufruf
    useEffect(() => {
      if (query !== localValue && query === "") {
        setLocalValue("");
      }
    }, [query, localValue]);

    function emitDebounced(next: string) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onQueryChange(next);
      }, debounceMs);
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const next = e.target.value;
      setLocalValue(next);
      if (next.length === 0) {
        if (timerRef.current) clearTimeout(timerRef.current);
        onQueryChange("");
        return;
      }
      if (next.length < 3) {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (query !== "") onQueryChange("");
        return;
      }
      emitDebounced(next);
    }

    function handleClear() {
      if (timerRef.current) clearTimeout(timerRef.current);
      setLocalValue("");
      onQueryChange("");
      inputRef.current?.focus();
    }

    const showCounter = query.length >= 3;
    const counterText =
      totalMatches === 0
        ? `Keine Treffer fuer "${query}"`
        : `${totalMatches} ${totalMatches === 1 ? "Treffer" : "Treffer"} in ${totalSectionsWithMatches} ${totalSectionsWithMatches === 1 ? "Sektion" : "Sektionen"}`;

    return (
      <div className="w-full">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="search"
            value={localValue}
            onChange={handleChange}
            placeholder="Im Handbuch suchen (mind. 3 Zeichen)"
            className="block w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            data-testid="reader-search-input"
            aria-label="Im Handbuch suchen"
          />
          {isPending ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
          ) : localValue.length > 0 ? (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Suche zuruecksetzen"
              data-testid="reader-search-clear"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {showCounter && (
          <div
            className={`mt-1.5 text-xs ${totalMatches === 0 ? "text-slate-500" : "text-slate-700"}`}
            data-testid="reader-search-counter"
            aria-live="polite"
          >
            {counterText}
          </div>
        )}
      </div>
    );
  },
);
