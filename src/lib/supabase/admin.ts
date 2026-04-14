import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS.
// Use ONLY in API routes for admin operations.
//
// X-Forwarded-Host header is required because GoTrue uses the request Host
// header (not API_EXTERNAL_URL) to generate email verify links. Without it,
// invite emails contain internal Docker hostname (supabase-kong) instead of
// the external domain.
export function createAdminClient() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  let externalHost = "";
  try {
    externalHost = new URL(appUrl).host;
  } catch {
    // Fallback: no forwarded host
  }

  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          ...(externalHost
            ? {
                "X-Forwarded-Host": externalHost,
                "X-Forwarded-Proto": "https",
              }
            : {}),
        },
      },
    }
  );
}
