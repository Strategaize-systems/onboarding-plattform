import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// GET /auth/callback — Handle invite token verification
// GoTrue redirect: /auth/callback?token_hash=...&type=invite&locale=de
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const token = searchParams.get("token");
  const locale = searchParams.get("locale") || "de";

  const redirectBase = process.env.NEXT_PUBLIC_APP_URL || "";

  // Determine redirect target
  const isInvite = type === "invite";
  const successUrl = isInvite
    ? `${redirectBase}/auth/set-password`
    : `${redirectBase}/dashboard`;

  // Create redirect response FIRST — Supabase client writes cookies to it
  const response = NextResponse.redirect(successUrl);

  // Create Supabase client that binds cookies to the redirect response.
  // This ensures auth session cookies survive the redirect — the standard
  // createClient() from server.ts uses cookies() from next/headers which
  // may not transfer cookies to a NextResponse.redirect().
  const supabase = createServerClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Sign out any existing session FIRST (prevents admin session collision)
  await supabase.auth.signOut();

  // Handle token_hash (new GoTrue format) or token (legacy)
  const hashToVerify = token_hash || token;
  if (!hashToVerify || !type) {
    return NextResponse.redirect(
      `${redirectBase}/login?error=Invalid+callback+parameters`
    );
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: hashToVerify,
    type: type as "invite" | "email",
  });

  if (error) {
    return NextResponse.redirect(
      `${redirectBase}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // Set NEXT_LOCALE cookie so the set-password page renders in tenant language
  response.cookies.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  return response;
}
