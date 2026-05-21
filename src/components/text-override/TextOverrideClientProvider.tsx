"use client";

// V7.1 SLC-137 MT-2 — Client-Side Context-Provider (FEAT-056).
//
// Eine duenne Client-Brueke fuer TextOverrideContext.Provider. Daten werden
// vom Server (Provider.tsx) als serialisiertes Array reingereicht (Map ist
// nicht JSON-serialisierbar), hier zur Map rekonstruiert und ueber den
// React-Context geliefert.

import { useMemo } from "react";
import type { UserRole } from "@/types/db";
import { TextOverrideReactContext } from "./use-text-override";

export interface TextOverrideClientProviderProps {
  entries: ReadonlyArray<readonly [string, string]>;
  role: UserRole | null;
  partnerOrgId: string | null;
  locale: string;
  children: React.ReactNode;
}

export function TextOverrideClientProvider({
  entries,
  role,
  partnerOrgId,
  locale,
  children,
}: TextOverrideClientProviderProps) {
  const value = useMemo(
    () => ({
      map: new Map(entries),
      role,
      partnerOrgId,
      locale,
    }),
    [entries, role, partnerOrgId, locale],
  );
  return (
    <TextOverrideReactContext.Provider value={value}>
      {children}
    </TextOverrideReactContext.Provider>
  );
}
