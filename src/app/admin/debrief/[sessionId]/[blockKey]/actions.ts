"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateKnowledgeUnit(
  kuId: string,
  patch: { title?: string; body?: string },
  action: "accept" | "edit" | "reject",
  note?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nicht authentifiziert" };
  }

  const { data, error } = await supabase.rpc(
    "rpc_update_knowledge_unit_with_audit",
    {
      p_ku_id: kuId,
      p_patch: patch,
      p_action: action,
      p_note: note ?? null,
    }
  );

  if (error) {
    return { error: error.message };
  }

  return { validationId: data };
}

export async function addKnowledgeUnit(
  sessionId: string,
  blockKey: string,
  kuData: { title: string; body: string; unitType?: string },
  note?: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Nicht authentifiziert" };
  }

  const { data, error } = await supabase.rpc("rpc_add_knowledge_unit", {
    p_session_id: sessionId,
    p_block_key: blockKey,
    p_title: kuData.title,
    p_body: kuData.body,
    p_unit_type: kuData.unitType ?? "observation",
    p_note: note ?? null,
  });

  if (error) {
    return { error: error.message };
  }

  return { kuId: data };
}
