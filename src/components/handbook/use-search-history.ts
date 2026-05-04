"use client";

// SLC-054 MT-1 — useSearchHistory-Hook (per DEC-063: localStorage statt user_settings).
//
// Persistiert die letzten Search-Queries des Users pro Browser-Profil unter
// `localStorage['onboarding.reader.searchHistory.v1']`. Kein DB-Round-Trip,
// kein Cross-Device-Sync (per V4.3-Trade-off akzeptiert).
//
// Mutation-Logik wird als pure helper (`addQueryToHistory`, `parseHistory`)
// exportiert, damit sie ohne jsdom unit-getestet werden kann. Der Hook selbst
// ist der duenne React-Wrapper um localStorage + useState; sein Verhalten wird
// in der Browser-Smoke-Phase (Pflicht-Gate 1280×800/375×667) verifiziert.

import { useCallback, useEffect, useState } from "react";

export const SEARCH_HISTORY_STORAGE_KEY = "onboarding.reader.searchHistory.v1";
export const MAX_HISTORY_ENTRIES = 10;

/**
 * Pure helper: liest ein localStorage-Roh-Value und liefert eine bereinigte
 * String-Liste. Tolerant gegen JSON-Parse-Errors, falsche Typen und
 * Mixed-Type-Arrays — gibt im Fehlerfall ein leeres Array zurueck.
 */
export function parseHistory(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cleaned: string[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && item.length > 0) cleaned.push(item);
    }
    return cleaned.slice(0, MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

/**
 * Pure helper: fuegt eine neue Query an Position 0 ein. Dedupliziert
 * (case-sensitive trim-vergleich), trimmt auf MAX_HISTORY_ENTRIES (FIFO am Ende).
 * Ignoriert leere Queries.
 */
export function addQueryToHistory(history: string[], query: string): string[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return history;
  const filtered = history.filter((h) => h !== trimmed);
  const next = [trimmed, ...filtered];
  if (next.length > MAX_HISTORY_ENTRIES) return next.slice(0, MAX_HISTORY_ENTRIES);
  return next;
}

export interface UseSearchHistoryResult {
  history: string[];
  addQuery: (query: string) => void;
  clearHistory: () => void;
}

export function useSearchHistory(): UseSearchHistoryResult {
  const [history, setHistory] = useState<string[]>([]);

  // SSR-safe Initial-Hydration: localStorage existiert nur im Browser, also
  // erst nach Mount lesen. Verhindert Hydration-Mismatch (Server rendert immer
  // mit []). setState ist hier der kanonische Hydration-Pfad fuer Browser-only
  // Storages — Lint-Rule react-hooks/set-state-in-effect lokal unterdrueckt.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistory(parseHistory(raw));
    } catch (err) {
      console.warn("[useSearchHistory] Read aus localStorage fehlgeschlagen:", err);
    }
  }, []);

  const addQuery = useCallback((query: string) => {
    setHistory((prev) => {
      const next = addQueryToHistory(prev, query);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            SEARCH_HISTORY_STORAGE_KEY,
            JSON.stringify(next),
          );
        } catch (err) {
          // DEC-063: Quota-Fehler werden silent geschluckt (10 Strings * ~50 chars
          // sind weit unter 5MB-Quota — Fehler hier ist Edge-Case).
          console.warn("[useSearchHistory] Write in localStorage fehlgeschlagen:", err);
        }
      }
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, "[]");
      } catch (err) {
        console.warn("[useSearchHistory] Clear in localStorage fehlgeschlagen:", err);
      }
    }
    setHistory([]);
  }, []);

  return { history, addQuery, clearHistory };
}
