"use client";

// V7.1 SLC-137 MT-2 — Client-Hook fuer TextOverride-Context (FEAT-056).
//
// Stellt EditableText.tsx + sonstigen Client-Components eine kleine
// React-Context-API zur Verfuegung. Der Provider in Provider.tsx ist eine
// Server-Component die initial die Override-Map laedt (SLC-136 Resolver) und
// die Daten via dieser Context-Implementierung an die Client-Welt durchreicht.

import { createContext, useContext } from "react";
import type { UserRole } from "@/types/db";

export interface TextOverrideContextValue {
  map: ReadonlyMap<string, string>;
  role: UserRole | null;
  partnerOrgId: string | null;
  locale: string;
}

export const EMPTY_TEXT_OVERRIDE_CONTEXT: TextOverrideContextValue = {
  map: new Map(),
  role: null,
  partnerOrgId: null,
  locale: "de",
};

export const TextOverrideReactContext = createContext<TextOverrideContextValue>(
  EMPTY_TEXT_OVERRIDE_CONTEXT,
);

/**
 * Client-Hook fuer EditableText + sonstige client-side Konsumenten.
 *
 * Aufruf ausserhalb eines TextOverrideProvider liefert sichere Defaults
 * (leere Map, role=null) — kein Crash, EditableText rendert dann nur
 * defaultText ohne Editor.
 */
export function useTextOverride(): TextOverrideContextValue {
  return useContext(TextOverrideReactContext);
}
