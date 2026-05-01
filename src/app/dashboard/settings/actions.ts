"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureException, captureWarning } from "@/lib/logger";

/**
 * SLC-049 MT-5 — Server-Action fuer den Reminders-Opt-Out-Toggle.
 *
 * Pattern (IMP-214): Auth wird ueber den authentifizierten Server-Client
 * geprueft, der eigentliche UPDATE laeuft ueber den Service-Role-Client mit
 * explizitem `eq("user_id", user.id)`-Filter. Damit umgehen wir RLS-Edge-Cases
 * bei State-Maschinen-UPDATEs durch Tenant-User, behalten aber die Sicherheit:
 * der Service-Role-UPDATE betrifft ausschliesslich die Zeile des authentifizierten
 * Users.
 */
export async function toggleRemindersOptOut(
  value: boolean
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    captureWarning("toggleRemindersOptOut: unauthenticated", {
      source: "settings:reminders-opt-out",
    });
    return { ok: false, error: "unauthenticated" };
  }

  try {
    const admin = createAdminClient();
    const { error: updateErr } = await admin
      .from("user_settings")
      .update({
        reminders_opt_out: value,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateErr) {
      captureException(updateErr, {
        source: "settings:reminders-opt-out",
        metadata: { user_id: user.id, value },
      });
      return { ok: false, error: "db_update_failed" };
    }

    revalidatePath("/dashboard/settings");
    return { ok: true };
  } catch (e) {
    captureException(e, {
      source: "settings:reminders-opt-out",
      metadata: { user_id: user.id, value },
    });
    return { ok: false, error: "internal" };
  }
}
