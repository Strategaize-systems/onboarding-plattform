-- Migration 072: 3 RPCs fuer Employee-Invitation-Flow
-- SLC-034 MT-1 — Employee-Auth + Invitation-Flow (FEAT-022, DEC-011, DEC-035, DEC-036)
--
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-120)
-- NOTE: Alle CREATE FUNCTION statements mit explicit public.-Prefix (IMP-120 aus SLC-033)
--
-- RPCs:
--   1. rpc_create_employee_invitation(p_email, p_display_name, p_role_hint)
--      tenant_admin-only. Generiert 32-Byte Token (64-char hex). INSERT mit status='pending',
--      expires_at = now() + 14 days. Returns (id, invitation_token).
--
--   2. rpc_revoke_employee_invitation(p_invitation_id)
--      tenant_admin-only (eigener Tenant). UPDATE status='revoked'. Idempotent.
--
--   3. rpc_accept_employee_invitation_finalize(p_invitation_id, p_accepted_user_id)
--      SECURITY DEFINER, wird NICHT direkt vom Client gerufen. Von Server-Action
--      NACH erfolgreichem supabase.auth.admin.createUser() aufgerufen (DEC-011).
--      UPDATE invitation status='accepted', accepted_at, accepted_user_id.
--      Idempotent: wenn bereits accepted mit gleicher user_id -> NO-OP success.
--
-- Rollback (nicht auto-bereitgestellt):
--   DROP FUNCTION IF EXISTS public.rpc_create_employee_invitation(text, text, text);
--   DROP FUNCTION IF EXISTS public.rpc_revoke_employee_invitation(uuid);
--   DROP FUNCTION IF EXISTS public.rpc_accept_employee_invitation_finalize(uuid, uuid);

BEGIN;

-- =============================================
-- 1. rpc_create_employee_invitation
--    tenant_admin ruft via authenticated. Token wird mit gen_random_bytes(32) erzeugt.
--    UNIQUE-Index idx_employee_invitation_pending_email verhindert doppelte Pendings
--    pro Tenant+Email (case-insensitive).
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_create_employee_invitation(
  p_email        text,
  p_display_name text DEFAULT NULL,
  p_role_hint    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role    text;
  v_caller_tenant  uuid;
  v_caller_id      uuid;
  v_token          text;
  v_invitation_id  uuid;
BEGIN
  v_caller_id     := auth.uid();
  v_caller_role   := auth.user_role();
  v_caller_tenant := auth.user_tenant_id();

  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  IF v_caller_role NOT IN ('tenant_admin', 'strategaize_admin') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- strategaize_admin braucht explicit tenant_id (aus profile NULL) — hier nicht unterstuetzt.
  -- In V4 laedt tenant_admin ein, strategaize_admin kann via direct-DB-Access einladen (RLS-Bypass).
  IF v_caller_role = 'tenant_admin' AND v_caller_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'tenant_id_missing');
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN jsonb_build_object('error', 'email_required');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  BEGIN
    INSERT INTO public.employee_invitation (
      tenant_id,
      email,
      display_name,
      role_hint,
      invitation_token,
      invited_by_user_id,
      status,
      expires_at
    ) VALUES (
      v_caller_tenant,
      trim(p_email),
      NULLIF(trim(COALESCE(p_display_name, '')), ''),
      NULLIF(trim(COALESCE(p_role_hint, '')), ''),
      v_token,
      v_caller_id,
      'pending',
      now() + interval '14 days'
    )
    RETURNING id INTO v_invitation_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('error', 'duplicate_pending_invitation');
  END;

  RETURN jsonb_build_object(
    'invitation_id', v_invitation_id,
    'invitation_token', v_token
  );
END;
$$;

-- =============================================
-- 2. rpc_revoke_employee_invitation
--    tenant_admin kann eigene Tenant-Invitations revoken. Idempotent fuer revoked-State.
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_revoke_employee_invitation(
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role    text;
  v_caller_tenant  uuid;
  v_invitation     public.employee_invitation%ROWTYPE;
BEGIN
  v_caller_role   := auth.user_role();
  v_caller_tenant := auth.user_tenant_id();

  IF v_caller_role NOT IN ('tenant_admin', 'strategaize_admin') THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT * INTO v_invitation
    FROM public.employee_invitation
   WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invitation_not_found');
  END IF;

  -- tenant_admin darf nur eigenen Tenant
  IF v_caller_role = 'tenant_admin' AND v_invitation.tenant_id <> v_caller_tenant THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF v_invitation.status = 'accepted' THEN
    RETURN jsonb_build_object('error', 'already_accepted');
  END IF;

  IF v_invitation.status = 'revoked' THEN
    -- Idempotent
    RETURN jsonb_build_object('revoked', true, 'already', true);
  END IF;

  UPDATE public.employee_invitation
     SET status = 'revoked'
   WHERE id = p_invitation_id;

  RETURN jsonb_build_object('revoked', true);
END;
$$;

-- =============================================
-- 3. rpc_accept_employee_invitation_finalize
--    Wird NICHT direkt vom Client gerufen. Die Server-Action (DEC-011):
--      a) validiert Token via direktem SELECT (service_role)
--      b) ruft supabase.auth.admin.createUser (REST POST /auth/v1/admin/users)
--      c) ruft DIESEN RPC mit (invitation_id, neue user_id)
--      d) bei Fehler -> auth.admin.deleteUser Rollback
--
--    Idempotent:
--      - status='pending' + expires_at > now() -> UPDATE und Return {finalized: true}
--      - status='accepted' mit selber accepted_user_id -> NO-OP und Return {finalized: true, already: true}
--      - status='accepted' mit anderer user_id -> Error 'already_accepted_by_other'
--      - status='expired' | expires_at < now() -> Error 'expired'
--      - status='revoked' -> Error 'revoked'
-- =============================================
CREATE OR REPLACE FUNCTION public.rpc_accept_employee_invitation_finalize(
  p_invitation_id   uuid,
  p_accepted_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_invitation public.employee_invitation%ROWTYPE;
BEGIN
  IF p_invitation_id IS NULL OR p_accepted_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'arguments_required');
  END IF;

  SELECT * INTO v_invitation
    FROM public.employee_invitation
   WHERE id = p_invitation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invitation_not_found');
  END IF;

  -- Idempotenz
  IF v_invitation.status = 'accepted' THEN
    IF v_invitation.accepted_user_id = p_accepted_user_id THEN
      RETURN jsonb_build_object('finalized', true, 'already', true);
    END IF;
    RETURN jsonb_build_object('error', 'already_accepted_by_other');
  END IF;

  IF v_invitation.status = 'revoked' THEN
    RETURN jsonb_build_object('error', 'revoked');
  END IF;

  IF v_invitation.status = 'expired' OR v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  UPDATE public.employee_invitation
     SET status = 'accepted',
         accepted_at = now(),
         accepted_user_id = p_accepted_user_id
   WHERE id = p_invitation_id;

  RETURN jsonb_build_object('finalized', true);
END;
$$;

-- =============================================
-- 4. GRANTs
-- =============================================
GRANT EXECUTE ON FUNCTION public.rpc_create_employee_invitation(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_employee_invitation(text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_revoke_employee_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_employee_invitation(uuid) TO service_role;

-- finalize darf NICHT authenticated — wird nur vom service_role der Server-Action gerufen
GRANT EXECUTE ON FUNCTION public.rpc_accept_employee_invitation_finalize(uuid, uuid) TO service_role;

COMMIT;
