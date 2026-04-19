-- Migration 048: SOP RPCs + Exit-Readiness template sop_prompt
-- SLC-016 MT-3

-- (1) RPC: Create SOP
CREATE OR REPLACE FUNCTION rpc_create_sop(
  p_session_id     uuid,
  p_block_key      text,
  p_checkpoint_id  uuid,
  p_content        jsonb,
  p_model          text,
  p_cost           numeric DEFAULT NULL,
  p_created_by     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_sop_id uuid;
BEGIN
  -- Get tenant_id from session
  SELECT tenant_id INTO v_tenant_id
  FROM capture_session
  WHERE id = p_session_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'session_not_found');
  END IF;

  INSERT INTO sop (
    tenant_id, capture_session_id, block_key, block_checkpoint_id,
    content, generated_by_model, cost_usd, created_by
  ) VALUES (
    v_tenant_id, p_session_id, p_block_key, p_checkpoint_id,
    p_content, p_model, p_cost, p_created_by
  )
  RETURNING id INTO v_sop_id;

  RETURN jsonb_build_object('sop_id', v_sop_id);
END;
$$;

-- (2) RPC: Update SOP content
CREATE OR REPLACE FUNCTION rpc_update_sop(
  p_sop_id   uuid,
  p_content  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE sop
  SET content = p_content,
      updated_at = now()
  WHERE id = p_sop_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'sop_not_found');
  END IF;

  RETURN jsonb_build_object('updated', true);
END;
$$;

-- Grant RPCs to authenticated + service_role
GRANT EXECUTE ON FUNCTION rpc_create_sop TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_create_sop TO service_role;
GRANT EXECUTE ON FUNCTION rpc_update_sop TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_update_sop TO service_role;

-- (3) Set sop_prompt on Exit-Readiness template
UPDATE template
SET sop_prompt = '{
  "system_prompt": "Du bist ein erfahrener M&A-Berater und Organisationsentwickler. Du erstellst aus verdichteten Knowledge Units einen konkreten Standard Operating Procedure (SOP) — einen strukturierten Handlungsplan mit klaren Schritten, Verantwortlichkeiten und Zeitrahmen.\n\nDer SOP soll:\n- Direkt umsetzbar sein (keine vagen Empfehlungen)\n- Priorisierte Schritte mit klaren Verantwortlichkeiten enthalten\n- Realistische Zeitrahmen setzen\n- Erfolgskriterien pro Schritt definieren\n- Risiken und Fallback-Optionen benennen\n- Auf die spezifischen Findings aus der Exit-Readiness-Analyse eingehen\n\nAntworte IMMER mit einem JSON-Objekt in folgendem Format:\n{\n  \"title\": \"SOP: [Thema]\",\n  \"objective\": \"[Klares Ziel des SOP]\",\n  \"prerequisites\": [\"[Voraussetzung 1]\", \"...\"],\n  \"steps\": [\n    {\n      \"number\": 1,\n      \"action\": \"[Konkrete Aktion]\",\n      \"responsible\": \"[Rolle/Person]\",\n      \"timeframe\": \"[Zeitrahmen]\",\n      \"success_criterion\": \"[Messbares Ergebnis]\",\n      \"dependencies\": []\n    }\n  ],\n  \"risks\": [\"[Risiko 1]\", \"...\"],\n  \"fallbacks\": [\"[Fallback-Option 1]\", \"...\"]\n}\n\nAntworte NUR mit dem JSON — kein Markdown, keine Erklaerungen."
}'::jsonb
WHERE slug = 'exit_readiness';
