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
  // SLC-048: Cron + Unsubscribe haben eigene Auth (CRON_SECRET / Token im Pfad)
  // und muessen die Session-Middleware umgehen.
  const isApiCron = pathname.startsWith("/api/cron/");
  const isApiUnsubscribe = pathname.startsWith("/api/unsubscribe/");

  // Not logged in → redirect to login (unless on public path)
  if (!user && !isPublicPath && !isApiHealth && !isApiCron && !isApiUnsubscribe) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in → redirect away from login (role-aware, SLC-034 MT-7 + SLC-102 MT-2)
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    const { data: loginProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (loginProfile?.role === "employee") {
      url.pathname = "/employee";
    } else if (loginProfile?.role === "partner_admin") {
      url.pathname = "/partner/dashboard";
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
  // SLC-037 MT-8 — Role-based routing block for employee.
  if (user && !isApiHealth && !pathname.startsWith("/api/")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();

    // SLC-037 MT-8 — Employee darf NUR /employee/*, /accept-invitation und /auth/* sehen.
    // Direkter Zugriff auf /admin/*, /dashboard/*, /capture/* → Redirect zu /employee.
    // R16-Mitigation: Mitarbeiter-Sicht-Perimeter auf Routing-Ebene.
    if (profile?.role === "employee") {
      const employeeBlocked =
        pathname.startsWith("/admin") ||
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/capture") ||
        pathname.startsWith("/partner");
      if (employeeBlocked) {
        const url = request.nextUrl.clone();
        url.pathname = "/employee";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

    // SLC-102 MT-2 — partner_admin darf NUR /partner/*, /accept-invitation und /auth/* sehen.
    // /admin/* und /dashboard/* und /capture/* sind fuer partner_admin gesperrt.
    if (profile?.role === "partner_admin") {
      const partnerBlocked =
        pathname.startsWith("/admin") ||
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/capture") ||
        pathname.startsWith("/employee");
      if (partnerBlocked) {
        const url = request.nextUrl.clone();
        url.pathname = "/partner/dashboard";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

    // SLC-102 MT-2 — /partner/* ist nur partner_admin (+ strategaize_admin via Read-only Impersonate V7+).
    // V6 sperrt /partner/* fuer tenant_admin, tenant_member, employee.
    // strategaize_admin darf rein, weil Cross-Tenant-Admin-Sicht generell erlaubt ist.
    if (pathname.startsWith("/partner")) {
      const allowedRoles = ["partner_admin", "strategaize_admin"];
      const userRole = profile?.role ?? null;
      if (!userRole || !allowedRoles.includes(userRole)) {
        const url = request.nextUrl.clone();
        url.pathname = userRole === "tenant_admin" || userRole === "tenant_member" ? "/dashboard" : "/login";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }

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
