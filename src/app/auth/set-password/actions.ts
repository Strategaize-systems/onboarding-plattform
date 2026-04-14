"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { setPasswordLimiter } from "@/lib/rate-limit";

export async function setPassword(formData: FormData) {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!password || password.length < 8) {
    return { error: "Passwort muss mindestens 8 Zeichen lang sein" };
  }

  if (password !== confirmPassword) {
    return { error: "Passwörter stimmen nicht überein" };
  }

  // Rate limiting by IP
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateCheck = setPasswordLimiter.check(ip);
  if (!rateCheck.allowed) {
    return { error: rateCheck.error };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      const { captureException } = await import("@/lib/logger");
      captureException(new Error(error.message), { source: "auth/set-password" });
      return { error: error.message };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { captureException } = await import("@/lib/logger");
    captureException(err, { source: "auth/set-password" });
    return { error: `Verbindungsfehler: ${msg}` };
  }

  redirect("/dashboard");
}
