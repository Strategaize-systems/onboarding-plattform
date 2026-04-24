import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes that don't require auth
  const publicPaths = [
    "/login",
    "/auth/callback",
    "/auth/set-password",
    "/accept-invitation", // SLC-034: Employee accepts invitation without being logged in
  ];
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));
  const isApiHealth = pathname === "/api/health";

  // Not logged in → redirect to login (unless on public path)
  if (!user && !isPublicPath && !isApiHealth) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in → redirect away from login (role-aware, SLC-034 MT-7)
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    const { data: loginProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (loginProfile?.role === "employee") {
      url.pathname = "/employee";
    } else if (loginProfile?.role === "strategaize_admin") {
      url.pathname = "/admin/tenants";
    } else {
      url.pathname = "/dashboard";
    }
    return NextResponse.redirect(url);
  }

  // Sync NEXT_LOCALE cookie with tenant language on every page load.
  // Always re-check — the cookie may be stale from a previous session
  // (e.g. admin tested EN invite, then NL user logs in).
  if (user && !isApiHealth && !pathname.startsWith("/api/")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    let expectedLocale = "de"; // Default for admin (no tenant)

    if (profile?.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("language")
        .eq("id", profile.tenant_id)
        .single();

      expectedLocale = tenant?.language ?? "de";
    }

    const currentLocale = request.cookies.get("NEXT_LOCALE")?.value;
    if (currentLocale !== expectedLocale) {
      supabaseResponse.cookies.set("NEXT_LOCALE", expectedLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: "lax",
      });
    }
  }

  return supabaseResponse;
}
