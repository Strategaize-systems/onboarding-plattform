"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { loginLimiter } from "@/lib/rate-limit";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "E-Mail und Passwort sind erforderlich" };
  }

  // Rate limiting by IP
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateCheck = loginLimiter.check(ip);
  if (!rateCheck.allowed) {
    return { error: rateCheck.error };
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      const { captureException } = await import("@/lib/logger");
      captureException(new Error(error.message), { source: "auth/login", metadata: { status: error.status } });
      return { error: error.message };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { captureException } = await import("@/lib/logger");
    captureException(err, { source: "auth/login" });
    return { error: `Verbindungsfehler: ${msg}` };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
