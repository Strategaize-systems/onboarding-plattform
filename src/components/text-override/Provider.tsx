// V7.1 SLC-137 MT-2 — Server-Component-Provider fuer TextOverride-Context.
//
// Laedt einmalig pro Request die Override-Map ueber den SLC-136 Resolver
// (mit 60s-Cache) + die Editor-Rolle des angemeldeten Users. Reicht die
// Daten an TextOverrideClientProvider weiter, der den eigentlichen
// React-Context fuer Client-Components bereitstellt.
//
// Verwendung:
//   <TextOverrideProvider partnerOrgId={partnerOrgId} locale="de">
//     <DiagnoseFunnelSubLayout>...</DiagnoseFunnelSubLayout>
//   </TextOverrideProvider>
//
// Performance-Ziel (FEAT-056 AC-11): Server-Render mit 50 EditableText < 100ms.
// Erreicht via Single-Query-Load + In-Memory-Cache (DEC-145, resolver.ts).

import { createClient } from "@/lib/supabase/server";
import { loadOverridesWithCache } from "@/lib/text-override/resolver";
import { TextOverrideClientProvider } from "./TextOverrideClientProvider";
import type { UserRole } from "@/types/db";

export interface TextOverrideProviderProps {
  partnerOrgId: string | null;
  locale?: string;
  children: React.ReactNode;
}

export async function TextOverrideProvider({
  partnerOrgId,
  locale = "de",
  children,
}: TextOverrideProviderProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: UserRole | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = ((profile?.role as UserRole | undefined) ?? null) as UserRole | null;
  }

  // Load + Map -> serialisierbares Array fuer Client-Brueke.
  const map = await loadOverridesWithCache(supabase, partnerOrgId, locale);
  const entries: ReadonlyArray<readonly [string, string]> = Array.from(
    map.entries(),
  );

  return (
    <TextOverrideClientProvider
      entries={entries}
      role={role}
      partnerOrgId={partnerOrgId}
      locale={locale}
    >
      {children}
    </TextOverrideClientProvider>
  );
}
