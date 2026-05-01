import type { SupabaseClient } from "@supabase/supabase-js";

export interface InactiveEmployeesResult {
  inactiveCount: number;
  totalAccepted: number;
}

export interface InactiveCardDisplay {
  value: string;
  hint: string;
  tone: "default" | "warning" | "success";
}

export function deriveInactiveCardDisplay(
  result: InactiveEmployeesResult
): InactiveCardDisplay {
  if (result.totalAccepted === 0) {
    return {
      value: "–",
      hint: "Noch keine Mitarbeiter eingeladen",
      tone: "default",
    };
  }
  if (result.inactiveCount === 0) {
    return {
      value: "0",
      hint: `von ${result.totalAccepted} eingeladenen`,
      tone: "success",
    };
  }
  return {
    value: String(result.inactiveCount),
    hint: `von ${result.totalAccepted} eingeladenen`,
    tone: "warning",
  };
}

// Inaktiv = Mitarbeiter mit accepted Invitation, aber ohne block_checkpoint.
// Aufruf erfolgt aus /dashboard Server-Component als tenant_admin.
// RLS regelt die Sicht auf employee_invitation + block_checkpoint pro Tenant.
export async function getInactiveEmployeesCount(
  supabase: SupabaseClient,
  tenantId: string
): Promise<InactiveEmployeesResult> {
  const { data: invitations, error: invErr } = await supabase
    .from("employee_invitation")
    .select("accepted_user_id")
    .eq("tenant_id", tenantId)
    .eq("status", "accepted")
    .not("accepted_user_id", "is", null);

  if (invErr) {
    throw new Error(`getInactiveEmployeesCount(invitations): ${invErr.message}`);
  }

  const accepted = (invitations ?? []) as Array<{ accepted_user_id: string | null }>;
  const userIds = Array.from(
    new Set(
      accepted
        .map((r) => r.accepted_user_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const totalAccepted = userIds.length;

  if (totalAccepted === 0) {
    return { inactiveCount: 0, totalAccepted: 0 };
  }

  const { data: checkpoints, error: cpErr } = await supabase
    .from("block_checkpoint")
    .select("created_by")
    .in("created_by", userIds);

  if (cpErr) {
    throw new Error(`getInactiveEmployeesCount(checkpoints): ${cpErr.message}`);
  }

  const active = new Set(
    ((checkpoints ?? []) as Array<{ created_by: string }>).map((r) => r.created_by)
  );

  const inactiveCount = userIds.filter((uid) => !active.has(uid)).length;
  return { inactiveCount, totalAccepted };
}
