import type { Client } from "pg";

export interface V4Fixtures {
  tenantA: string;
  tenantB: string;
  templateId: string;
  templateVersion: string;
  // Per-Tenant: je ein User pro Rolle (strategaize_admin ist tenant-unabhaengig).
  strategaizeAdminUserId: string;
  tenantAdminAUserId: string;
  tenantMemberAUserId: string;
  employeeAUserId: string;
  tenantAdminBUserId: string;
  tenantMemberBUserId: string;
  employeeBUserId: string;
  // Eigene capture_session pro employee + je eine tenant_admin-Session pro Tenant.
  sessionAdminA: string;
  sessionAdminB: string;
  sessionEmployeeA: string;
  sessionEmployeeB: string;
  // SLC-037 MT-7 — RLS-Matrix (32 Pflicht-Faelle): zusaetzliche Rows pro Tenant
  // damit jede Rolle eine erwartete Sichtbarkeit gegen reale Daten testen kann.
  blockCheckpointA: string;
  blockCheckpointB: string;
  knowledgeUnitA: string;
  knowledgeUnitB: string;
  validationLayerA: string;
  validationLayerB: string;
  blockDiagnosisA: string;
  blockDiagnosisB: string;
  sopA: string;
  sopB: string;
  handbookSnapshotA: string;
  handbookSnapshotB: string;
  bridgeRunA: string;
  bridgeRunB: string;
  bridgeProposalA: string;
  bridgeProposalB: string;
  employeeInvitationA: string;
  employeeInvitationB: string;
}

/**
 * V4 Test-Fixtures fuer die RLS-Perimeter-Matrix.
 *
 * Erzeugt:
 *   - 2 Tenants (A, B)
 *   - 1 Template
 *   - 7 User (1 strategaize_admin + 3 pro Tenant: admin, member, employee)
 *   - 4 capture_sessions (1 admin-owned + 1 employee-owned pro Tenant)
 *   - SLC-037 MT-7: je 1 Row pro Tenant in:
 *     block_checkpoint, knowledge_unit, validation_layer, block_diagnosis, sop,
 *     handbook_snapshot, bridge_run, bridge_proposal, employee_invitation.
 *
 * Muss innerhalb einer Transaktion laufen (siehe `withTestDb`). Nach ROLLBACK
 * sind alle Rows weg.
 */
export async function seedV4Fixtures(client: Client): Promise<V4Fixtures> {
  // Tenants
  const tenantInsert = await client.query<{ id: string }>(
    `INSERT INTO public.tenants (name, language)
     VALUES ($1, 'de'), ($2, 'de')
     RETURNING id`,
    ["V4 Test Tenant A", "V4 Test Tenant B"]
  );
  const [tenantA, tenantB] = tenantInsert.rows.map((r) => r.id);

  // Template (minimal)
  const templateInsert = await client.query<{ id: string; version: string }>(
    `INSERT INTO public.template (slug, name, version, blocks)
     VALUES ('v4-test-template-' || substr(gen_random_uuid()::text, 1, 8),
             'V4 Test Template', '1.0.0', '[]'::jsonb)
     RETURNING id, version`
  );
  const templateId = templateInsert.rows[0].id;
  const templateVersion = templateInsert.rows[0].version;

  // User anlegen. handle_new_user()-Trigger erzeugt die Profile.
  // strategaize_admin: tenant_id leer.
  const mkUser = async (
    label: string,
    role: "strategaize_admin" | "tenant_admin" | "tenant_member" | "employee",
    tenantId: string | null
  ): Promise<string> => {
    const metadata =
      role === "strategaize_admin"
        ? { role }
        : { role, tenant_id: tenantId };
    const res = await client.query<{ id: string }>(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at
       )
       VALUES (
         '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
         'authenticated', 'authenticated',
         $1 || '-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
         '{}'::jsonb, $2::jsonb,
         now(), now()
       )
       RETURNING id`,
      [label, JSON.stringify(metadata)]
    );
    return res.rows[0].id;
  };

  const strategaizeAdminUserId = await mkUser("v4-sa", "strategaize_admin", null);
  // Profile fuer strategaize_admin zur Sicherheit explizit auf tenant_id=NULL setzen
  await client.query(
    `UPDATE public.profiles SET role = 'strategaize_admin', tenant_id = NULL WHERE id = $1`,
    [strategaizeAdminUserId]
  );

  const tenantAdminAUserId = await mkUser("v4-ta-a", "tenant_admin", tenantA);
  const tenantMemberAUserId = await mkUser("v4-tm-a", "tenant_member", tenantA);
  const employeeAUserId = await mkUser("v4-emp-a", "employee", tenantA);

  const tenantAdminBUserId = await mkUser("v4-ta-b", "tenant_admin", tenantB);
  const tenantMemberBUserId = await mkUser("v4-tm-b", "tenant_member", tenantB);
  const employeeBUserId = await mkUser("v4-emp-b", "employee", tenantB);

  // capture_sessions
  const mkSession = async (
    tenantId: string,
    ownerUserId: string,
    captureMode: "questionnaire" | "employee_questionnaire" = "questionnaire"
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.capture_session
         (tenant_id, template_id, template_version, owner_user_id, status, capture_mode)
       VALUES ($1, $2, $3, $4, 'open', $5)
       RETURNING id`,
      [tenantId, templateId, templateVersion, ownerUserId, captureMode]
    );
    return res.rows[0].id;
  };

  const sessionAdminA = await mkSession(tenantA, tenantAdminAUserId, "questionnaire");
  const sessionAdminB = await mkSession(tenantB, tenantAdminBUserId, "questionnaire");
  const sessionEmployeeA = await mkSession(tenantA, employeeAUserId, "employee_questionnaire");
  const sessionEmployeeB = await mkSession(tenantB, employeeBUserId, "employee_questionnaire");

  // ============================================================
  // SLC-037 MT-7 — Zusaetzliche Rows pro Tenant fuer RLS-Matrix
  // ============================================================

  // block_checkpoint (eines pro employee-Session, damit employee SELECT eine Row hat)
  const mkBlockCheckpoint = async (
    tenantId: string,
    sessionId: string,
    userId: string,
    hashSuffix: string
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.block_checkpoint
         (tenant_id, capture_session_id, block_key, checkpoint_type,
          content, content_hash, created_by)
       VALUES ($1, $2, 'A', 'questionnaire_submit', '{}'::jsonb, $3, $4)
       RETURNING id`,
      [tenantId, sessionId, `hash-v4-mat-${hashSuffix}`, userId]
    );
    return res.rows[0].id;
  };
  const blockCheckpointA = await mkBlockCheckpoint(
    tenantA,
    sessionEmployeeA,
    employeeAUserId,
    "a-" + Math.random().toString(36).slice(2, 10)
  );
  const blockCheckpointB = await mkBlockCheckpoint(
    tenantB,
    sessionEmployeeB,
    employeeBUserId,
    "b-" + Math.random().toString(36).slice(2, 10)
  );

  // knowledge_unit (eines pro employee-Session mit source='employee_questionnaire')
  const mkKnowledgeUnit = async (
    tenantId: string,
    sessionId: string,
    checkpointId: string
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.knowledge_unit
         (tenant_id, capture_session_id, block_checkpoint_id, block_key,
          unit_type, source, title, body, confidence, evidence_refs, status)
       VALUES ($1, $2, $3, 'A',
               'finding', 'employee_questionnaire', 'V4-Matrix-KU', 'Body', 'medium',
               '[]'::jsonb, 'proposed')
       RETURNING id`,
      [tenantId, sessionId, checkpointId]
    );
    return res.rows[0].id;
  };
  const knowledgeUnitA = await mkKnowledgeUnit(tenantA, sessionEmployeeA, blockCheckpointA);
  const knowledgeUnitB = await mkKnowledgeUnit(tenantB, sessionEmployeeB, blockCheckpointB);

  // validation_layer (eines pro KU). reviewer_role CHECK: nur 'strategaize_admin'
  // oder 'tenant_admin' erlaubt (siehe Migration 021). action CHECK: accept|edit|reject|comment.
  const mkValidationLayer = async (
    tenantId: string,
    kuId: string,
    reviewerUserId: string
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.validation_layer
         (tenant_id, knowledge_unit_id, reviewer_user_id, reviewer_role,
          action, previous_status, new_status, note)
       VALUES ($1, $2, $3, 'tenant_admin', 'comment', NULL, 'proposed', 'V4-Matrix-Test')
       RETURNING id`,
      [tenantId, kuId, reviewerUserId]
    );
    return res.rows[0].id;
  };
  const validationLayerA = await mkValidationLayer(tenantA, knowledgeUnitA, tenantAdminAUserId);
  const validationLayerB = await mkValidationLayer(tenantB, knowledgeUnitB, tenantAdminBUserId);

  // block_diagnosis
  const mkBlockDiagnosis = async (
    tenantId: string,
    sessionId: string,
    checkpointId: string
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.block_diagnosis
         (tenant_id, capture_session_id, block_checkpoint_id, block_key, content, status, generated_by_model)
       VALUES ($1, $2, $3, 'A', '{}'::jsonb, 'draft', 'test-model')
       RETURNING id`,
      [tenantId, sessionId, checkpointId]
    );
    return res.rows[0].id;
  };
  const blockDiagnosisA = await mkBlockDiagnosis(tenantA, sessionEmployeeA, blockCheckpointA);
  const blockDiagnosisB = await mkBlockDiagnosis(tenantB, sessionEmployeeB, blockCheckpointB);

  // sop
  const mkSop = async (
    tenantId: string,
    sessionId: string,
    checkpointId: string
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.sop
         (tenant_id, capture_session_id, block_checkpoint_id, block_key, content, generated_by_model)
       VALUES ($1, $2, $3, 'A', '{}'::jsonb, 'test-model')
       RETURNING id`,
      [tenantId, sessionId, checkpointId]
    );
    return res.rows[0].id;
  };
  const sopA = await mkSop(tenantA, sessionEmployeeA, blockCheckpointA);
  const sopB = await mkSop(tenantB, sessionEmployeeB, blockCheckpointB);

  // handbook_snapshot
  const mkHandbookSnapshot = async (
    tenantId: string,
    sessionId: string,
    userId: string
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.handbook_snapshot
         (tenant_id, capture_session_id, template_id, template_version, status, generated_by_user_id)
       VALUES ($1, $2, $3, $4, 'generating', $5)
       RETURNING id`,
      [tenantId, sessionId, templateId, templateVersion, userId]
    );
    return res.rows[0].id;
  };
  const handbookSnapshotA = await mkHandbookSnapshot(tenantA, sessionEmployeeA, tenantAdminAUserId);
  const handbookSnapshotB = await mkHandbookSnapshot(tenantB, sessionEmployeeB, tenantAdminBUserId);

  // bridge_run
  const mkBridgeRun = async (
    tenantId: string,
    sessionId: string,
    userId: string
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.bridge_run
         (tenant_id, capture_session_id, template_id, template_version, status, triggered_by_user_id)
       VALUES ($1, $2, $3, $4, 'completed', $5)
       RETURNING id`,
      [tenantId, sessionId, templateId, templateVersion, userId]
    );
    return res.rows[0].id;
  };
  const bridgeRunA = await mkBridgeRun(tenantA, sessionAdminA, tenantAdminAUserId);
  const bridgeRunB = await mkBridgeRun(tenantB, sessionAdminB, tenantAdminBUserId);

  // bridge_proposal
  const mkBridgeProposal = async (
    tenantId: string,
    runId: string
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.bridge_proposal
         (tenant_id, bridge_run_id, proposal_mode, proposed_block_title, status)
       VALUES ($1, $2, 'free_form', 'V4-Matrix-Proposal', 'proposed')
       RETURNING id`,
      [tenantId, runId]
    );
    return res.rows[0].id;
  };
  const bridgeProposalA = await mkBridgeProposal(tenantA, bridgeRunA);
  const bridgeProposalB = await mkBridgeProposal(tenantB, bridgeRunB);

  // employee_invitation
  const mkEmployeeInvitation = async (
    tenantId: string,
    inviterUserId: string,
    suffix: string
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.employee_invitation
         (tenant_id, email, invitation_token, invited_by_user_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [
        tenantId,
        `inv-v4-${suffix}@onboarding.test`,
        `tok-v4-${suffix}-${Math.random().toString(36).slice(2, 10)}`,
        inviterUserId,
      ]
    );
    return res.rows[0].id;
  };
  const employeeInvitationA = await mkEmployeeInvitation(tenantA, tenantAdminAUserId, "a");
  const employeeInvitationB = await mkEmployeeInvitation(tenantB, tenantAdminBUserId, "b");

  return {
    tenantA,
    tenantB,
    templateId,
    templateVersion,
    strategaizeAdminUserId,
    tenantAdminAUserId,
    tenantMemberAUserId,
    employeeAUserId,
    tenantAdminBUserId,
    tenantMemberBUserId,
    employeeBUserId,
    sessionAdminA,
    sessionAdminB,
    sessionEmployeeA,
    sessionEmployeeB,
    blockCheckpointA,
    blockCheckpointB,
    knowledgeUnitA,
    knowledgeUnitB,
    validationLayerA,
    validationLayerB,
    blockDiagnosisA,
    blockDiagnosisB,
    sopA,
    sopB,
    handbookSnapshotA,
    handbookSnapshotB,
    bridgeRunA,
    bridgeRunB,
    bridgeProposalA,
    bridgeProposalB,
    employeeInvitationA,
    employeeInvitationB,
  };
}
