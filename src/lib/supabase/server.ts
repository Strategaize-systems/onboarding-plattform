import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

// SLC-110 F-110-H1 (ISSUE-049) — React cache() Request-Scope-Memoization.
// Layout (resolveBrandingForCurrentRequest) UND Mandanten-Dashboard rufen
// createClient() pro Request separat auf. Ohne cache() entstehen zwei
// SupabaseClient-Instanzen, was die Object.is-Args-Memoization in
// resolveBrandingForTenant entwertet (Cache-Miss -> 2x RPC). Mit cache()
// liefert createClient() pro Render-Phase dieselbe Instanz, womit
// resolveBrandingForTenant korrekt deduplicated.
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from Server Component — ignore
          }
        },
      },
    }
  );
});
