import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ checkpointId: string }> }
) {
  const { checkpointId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Nicht authentifiziert" },
      { status: 401 }
    );
  }

  // Load checkpoint — RLS handles tenant isolation automatically:
  // - strategaize_admin sees all (admin_full policy)
  // - tenant_admin sees only own tenant (tenant_read policy)
  const { data: checkpoint, error } = await supabase
    .from("block_checkpoint")
    .select(
      "id, tenant_id, capture_session_id, block_key, checkpoint_type, content, content_hash, created_at"
    )
    .eq("id", checkpointId)
    .single();

  if (error || !checkpoint) {
    return NextResponse.json(
      { error: "Checkpoint nicht gefunden" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: checkpoint.id,
    tenant_id: checkpoint.tenant_id,
    session_id: checkpoint.capture_session_id,
    block_key: checkpoint.block_key,
    checkpoint_type: checkpoint.checkpoint_type,
    content: checkpoint.content,
    content_hash: checkpoint.content_hash,
    created_at: checkpoint.created_at,
  });
}
