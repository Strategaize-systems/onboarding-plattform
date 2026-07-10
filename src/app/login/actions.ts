"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { loginLimiter, loginAccountLimiter } from "@/lib/rate-limit";

// SLC-195 MT-1 (ISSUE-126, P-081): generische Fehlermeldung — kein verbatim
// GoTrue-error.message mehr (verhinderte User-Enumeration: "invalid credentials"
// vs "email not confirmed" o.ae. leakten die Account-Existenz).
const GENERIC_LOGIN_ERROR = "E-Mail oder Passwort ungültig";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "E-Mail und Passwort sind erforderlich" };
  }
  const emailLower = email.trim().toLowerCase();

  // Rate limiting: IP-scoped Flood-Bremse (zaehlt jeden Versuch).
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateCheck = loginLimiter.check(ip);
  if (!rateCheck.allowed) {
    return { error: rateCheck.error };
  }

  // account-scoped Lockout (P-081): peek VOR signInWithPassword — eine gesperrte
  // Anfrage beruehrt GoTrue nicht. Generische Message (kein Enumeration-Leak).
  if (!loginAccountLimiter.peek(emailLower).allowed) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Fehlversuch zaehlt gegen den account-scoped Bucket.
      loginAccountLimiter.check(emailLower);
      const { captureException } = await import("@/lib/logger");
      captureException(new Error(error.message), { source: "auth/login", metadata: { status: error.status } });
      return { error: GENERIC_LOGIN_ERROR };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { captureException } = await import("@/lib/logger");
    captureException(err, { source: "auth/login" });
    return { error: `Verbindungsfehler: ${msg}` };
  }

  // Erfolgreicher Login resettet den account-scoped Lockout.
  loginAccountLimiter.clear(emailLower);
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
