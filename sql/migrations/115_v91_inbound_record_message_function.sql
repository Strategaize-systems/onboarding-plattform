-- Migration 115 — V9.1 SLC-V9.1-A MT-4 MIG-060 rpc_inbound_record_message
--
-- Zweck:
--   Atomare Multi-Entity-Tx fuer den Inbound-Webhook-Full-Pass-Pfad (DEC-203):
--     1. Daily-Roll-Over: INSERT email_bulk_run (forward_bucket/continuous) ODER
--        email_count+1 ON CONFLICT auf idx_email_bulk_run_forward_daily_roll
--        (tenant_id, endpoint_id, daily_anchor_date) — race-sicher + idempotent.
--     2. INSERT email_message mit bulk_run_id + raw_storage_path + received_at.
--     3. RETURN bulk_run_id.
--   PL/pgSQL-Function ist atomar by Definition (EXCEPTION = impliziter ROLLBACK).
--   supabase-js kann email_count = email_count + 1 nicht race-sicher ausdruecken.
--
-- Source-of-Truth:
--   - slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-4, Flow A Schritt 13+14)
--   - docs/DECISIONS.md DEC-203 (Postgres-Function-via-rpc fuer atomare Multi-Entity-Tx,
--     Strategaize-Standard, backend.md Decision-Tree)
--   - Pattern-Quelle: IS V4.1 SLC-134 apply_distribution_plan_function (DEC-106)
--
-- Berechtigung (per supabase-self-hosted pg_default_acl: anon bekommt EXECUTE
--   automatisch -> explizit REVOKE noetig):
--   - Nur service_role darf ausfuehren (Webhook-System-Pfad).
--
-- Idempotenz:
--   - CREATE OR REPLACE FUNCTION (Re-Run = no-op).
--   - Daily-Roll-Over ON CONFLICT verhindert Duplikat-Runs.
--   - Re-Delivery derselben message_id durch AWS-Lambda-Retry erzeugt eine
--     zusaetzliche email_message-Row (kein UNIQUE auf message_id in V9 — wie
--     mbox-Upload; Dedup ist Pipeline-Stage-2-Scope, nicht Inbound-Scope).
--
-- Apply-Pattern: identisch zu MIG-057 (siehe 112_v91_inbound_foundation.sql Header)
--
-- Verifikation post-LIVE (AC-V9.1-A-7 + AC-V9.1-A-8):
--   SELECT pg_get_functiondef('public.rpc_inbound_record_message'::regproc);
--   SELECT has_function_privilege('anon','public.rpc_inbound_record_message(uuid,uuid,date,text,text,text,jsonb)','EXECUTE');
--     --> erwartet f (false)

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_inbound_record_message(
  p_tenant_id        uuid,
  p_endpoint_id      uuid,
  p_anchor_date      date,
  p_source_file_name text,
  p_file_hash        text,
  p_storage_path     text,
  p_message          jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_run_id uuid;
BEGIN
  -- 1. Daily-Roll-Over: insert-or-increment, atomic via partial UNIQUE index.
  INSERT INTO public.email_bulk_run (
    tenant_id, uploader_user_id, source_file_name, file_hash, storage_path,
    status, inbound_source, endpoint_id, daily_anchor_date, email_count
  ) VALUES (
    p_tenant_id, NULL, p_source_file_name, p_file_hash, p_storage_path,
    'continuous', 'forward_bucket', p_endpoint_id, p_anchor_date, 1
  )
  ON CONFLICT (tenant_id, endpoint_id, daily_anchor_date)
    WHERE inbound_source = 'forward_bucket' AND endpoint_id IS NOT NULL
  DO UPDATE SET
    email_count = public.email_bulk_run.email_count + 1,
    updated_at  = now()
  RETURNING id INTO v_run_id;

  -- 2. email_message INSERT.
  INSERT INTO public.email_message (
    tenant_id, bulk_run_id, message_id, in_reply_to, references_array,
    from_address, to_addresses, cc_addresses, subject, date,
    body_text, body_html, has_attachments, attachment_metadata,
    raw_storage_path, received_at
  ) VALUES (
    p_tenant_id,
    v_run_id,
    p_message->>'message_id',
    p_message->>'in_reply_to',
    COALESCE(
      (SELECT array_agg(value) FROM jsonb_array_elements_text(p_message->'references_array')),
      '{}'::text[]
    ),
    p_message->>'from_address',
    COALESCE(
      (SELECT array_agg(value) FROM jsonb_array_elements_text(p_message->'to_addresses')),
      '{}'::text[]
    ),
    COALESCE(
      (SELECT array_agg(value) FROM jsonb_array_elements_text(p_message->'cc_addresses')),
      '{}'::text[]
    ),
    p_message->>'subject',
    NULLIF(p_message->>'date', '')::timestamptz,
    p_message->>'body_text',
    p_message->>'body_html',
    COALESCE((p_message->>'has_attachments')::boolean, false),
    COALESCE(p_message->'attachment_metadata', '[]'::jsonb),
    p_message->>'raw_storage_path',
    now()
  );

  RETURN v_run_id;
END;
$fn$;

-- Berechtigung: nur service_role. anon/authenticated explizit ausschliessen.
REVOKE ALL ON FUNCTION public.rpc_inbound_record_message(uuid,uuid,date,text,text,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_inbound_record_message(uuid,uuid,date,text,text,text,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_inbound_record_message(uuid,uuid,date,text,text,text,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_inbound_record_message(uuid,uuid,date,text,text,text,jsonb) TO service_role;

COMMIT;
