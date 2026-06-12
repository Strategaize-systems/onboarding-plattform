import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";
import { mapSynthesizedUnitToKnowledgeUnit } from "@/lib/bulk-email/handbook-import";

// V9.5 SLC-V9.5-D MT-5 (AC-D-6) — Gesamt-V9.5 End-to-End-Fixture gegen die
// Coolify-DB: rohe email_pattern-Rows → Synthese-Persist (SLC-V9.5-B-Contract)
// → Critic-gefilterte Units (SLC-V9.5-C: nur Surviving werden persistiert)
// → Curation (SLC-V9.5-D: accept/reject auf email_synthesized_unit, RLS-
// behavioral als tenant_admin) → Handbook-Import (echter Mapper
// mapSynthesizedUnitToKnowledgeUnit → knowledge_unit-INSERT → Snapshot-RPC).
//
// Der LLM-Anteil (Bedrock-Synthese/Critic) ist hier NICHT live — die Persist-
// Shapes entsprechen exakt dem Worker-Code (handle-synthesis-job.ts Schritt 11).
// Echter Bedrock-Live-Smoke ist Founder-gated → /deploy (AC-B-3).
//
// Verifiziert DB-seitig:
//   - email_bulk_run.status-Kette pattern_extracted → synthesizing →
//     synthesized → importing → completed (MIG-111 18-Werte-CHECK)
//   - ai_jobs.job_type CHECK akzeptiert 'email_bulk_synthesis' (MIG-111)
//   - ai_cost_ledger.role CHECK akzeptiert 'email_bulk_synthesis' (MIG-111)
//     + 'email_bulk_critic' (MIG-112)
//   - synthesis_cost_eur fliesst in total_cost_eur GENERATED ein (DEC-217)
//   - Reduktions-Quote (6 Patterns → 2 Units) + Evidenz-Aggregation
//     (evidence_count = _source-Rows, source_pattern_ids konsistent)
//   - Curation-UPDATE als tenant_admin durch RLS (behavioral positiv)
//   - knowledge_unit-Promotion via echtem Mapper (AC-D-1-Contract) inkl.
//     metadata-Fallback-Pfad (DEC-193) + Snapshot-RPC behavioral
//   - P1/P2-Pseudonym-Scan auf knowledge_unit title+body (AC-D-2 / R-D-2)
//
// node:20-Sidecar gegen Coolify-DB (TEST_DATABASE_URL). Ohne DB DB-gated skip.

interface E2eFixture {
  tenantA: string;
  userA: string;
  sessionA: string;
  runId: string;
  patternIds: string[];
  threadIds: string[];
}

async function seedRunWithPatterns(client: Client): Promise<E2eFixture> {
  const { tenantA, userA, templateId, templateVersion } =
    await seedTestTenants(client);

  const session = await client.query<{ id: string }>(
    `INSERT INTO public.capture_session
       (tenant_id, template_id, template_version, owner_user_id, status)
     VALUES ($1, $2, $3, $4, 'open')
     RETURNING id`,
    [tenantA, templateId, templateVersion, userA],
  );
  const sessionA = session.rows[0].id;

  const run = await client.query<{ id: string }>(
    `INSERT INTO public.email_bulk_run
       (tenant_id, capture_session_id, source_file_name, file_hash,
        storage_path, status)
     VALUES ($1, $2, 'mailbox.mbox', 'hash-e2e', 'bulk/e2e', 'pattern_extracted')
     RETURNING id`,
    [tenantA, sessionA],
  );
  const runId = run.rows[0].id;

  const threads = await client.query<{ id: string }>(
    `INSERT INTO public.email_thread (tenant_id, bulk_run_id, root_message_id)
     VALUES ($1, $2, '<e2e-t1@test>'), ($1, $2, '<e2e-t2@test>')
     RETURNING id`,
    [tenantA, runId],
  );
  const threadIds = threads.rows.map((r) => r.id);

  // 6 rohe Patterns ueber 2 Threads — Descriptions enthalten thread-lokale
  // P1/P2-Pseudonyme (legitimer Roh-Zustand VOR der Synthese).
  const patterns = await client.query<{ id: string }>(
    `INSERT INTO public.email_pattern
       (tenant_id, bulk_run_id, thread_id, title, description, confidence)
     VALUES
       ($1, $2, $3, 'Preis-Eskalation A', 'P1 eskaliert Preisthemen an P2.', 0.8),
       ($1, $2, $3, 'Preis-Eskalation B', 'P2 antwortet auf P1 mit Rabatt.', 0.7),
       ($1, $2, $3, 'Freigabe-Schleife', 'P1 wartet auf Freigabe von P2.', 0.9),
       ($1, $2, $4, 'Preis-Eskalation C', 'P1 fragt P3 nach Preisliste.', 0.85),
       ($1, $2, $4, 'Reklamation', 'P2 meldet Reklamation an P1.', 0.6),
       ($1, $2, $4, 'Freigabe-Schleife 2', 'P3 erinnert P1 an Freigabe.', 0.75)
     RETURNING id`,
    [tenantA, runId, threadIds[0], threadIds[1]],
  );
  const patternIds = patterns.rows.map((r) => r.id);

  return { tenantA, userA, sessionA, runId, patternIds, threadIds };
}

async function flipStatus(
  client: Client,
  runId: string,
  status: string,
): Promise<void> {
  const res = await client.query(
    `UPDATE public.email_bulk_run SET status = $2, updated_at = now()
     WHERE id = $1`,
    [runId, status],
  );
  expect(res.rowCount).toBe(1);
}

describe("V9.5 E2E (AC-D-6): Patterns → Synthese → Critic → Curation → Handbook-Import", () => {
  it("walks the full stage chain on the live schema", async () => {
    await withTestDb(async (client) => {
      const f = await seedRunWithPatterns(client);

      // ── Stage-Link Extraktor→Synthese (SLC-V9.5-B AC-B-5): Enqueue-Row.
      const job = await client.query<{ id: string }>(
        `INSERT INTO public.ai_jobs (tenant_id, job_type, status, payload)
         VALUES ($1, 'email_bulk_synthesis', 'pending',
                 jsonb_build_object('bulk_run_id', $2::text))
         RETURNING id`,
        [f.tenantA, f.runId],
      );
      const jobId = job.rows[0].id;

      // ── Synthese-Stage (Worker-Contract Schritt 4 + 11).
      await flipStatus(client, f.runId, "synthesizing");

      // 2 Surviving-Units (Critic-Gate SLC-V9.5-C haette Draft 3 rejected —
      // nur Surviving werden persistiert; Reduktion 6 Patterns → 2 Units).
      const unitDefs = [
        {
          title: "Preisbezogene Eskalationen laufen ueber die Geschaeftsfuehrung",
          description:
            "Preisthemen werden konsequent an die Geschaeftsfuehrung eskaliert, " +
            "bevor Rabatte zugesagt werden.",
          suggested_section: "kommunikation",
          confidence: 0.9,
          sourcePatterns: [f.patternIds[0], f.patternIds[1], f.patternIds[3]],
          threads: [f.threadIds[0], f.threadIds[0], f.threadIds[1]],
        },
        {
          title: "Freigaben haengen an einer Person",
          description:
            "Interne Freigaben stauen sich, weil sie an eine einzelne Rolle " +
            "gebunden sind.",
          suggested_section: "prozesse",
          confidence: 0.75,
          sourcePatterns: [f.patternIds[2], f.patternIds[5], f.patternIds[4]],
          threads: [f.threadIds[0], f.threadIds[1], f.threadIds[1]],
        },
      ];

      const unitIds: string[] = [];
      for (const u of unitDefs) {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO public.email_synthesized_unit
             (tenant_id, bulk_run_id, title, description, evidence_snippets,
              themes, suggested_section, aggregated_confidence, evidence_count,
              source_pattern_ids)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::uuid[])
           RETURNING id`,
          [
            f.tenantA,
            f.runId,
            u.title,
            u.description,
            JSON.stringify(
              u.sourcePatterns.map((p) => ({
                text: "Beleg-Snippet ohne Klarnamen",
                source_pattern_id: p,
              })),
            ),
            ["pricing"],
            u.suggested_section,
            u.confidence,
            u.sourcePatterns.length,
            u.sourcePatterns,
          ],
        );
        const unitId = ins.rows[0].id;
        unitIds.push(unitId);

        for (let i = 0; i < u.sourcePatterns.length; i++) {
          await client.query(
            `INSERT INTO public.email_synthesized_unit_source
               (synthesized_unit_id, pattern_id, thread_id, tenant_id)
             VALUES ($1, $2, $3, $4)`,
            [unitId, u.sourcePatterns[i], u.threads[i], f.tenantA],
          );
        }
      }

      // ── Cost-Ledger (MIG-111 role 'email_bulk_synthesis' + MIG-112
      //    'email_bulk_critic') — beide CHECKs muessen die Werte akzeptieren.
      await client.query(
        `INSERT INTO public.ai_cost_ledger
           (tenant_id, job_id, model_id, tokens_in, tokens_out, usd_cost,
            duration_ms, iteration, role)
         VALUES
           ($1, $2, 'eu.anthropic.claude-sonnet-4-20250514-v1:0', 9000, 1200,
            0.045, 8000, 1, 'email_bulk_synthesis'),
           ($1, $2, 'eu.anthropic.claude-sonnet-4-20250514-v1:0', 3000, 400,
            0.015, 4000, 1, 'email_bulk_critic')`,
        [f.tenantA, jobId],
      );

      // ── synthesis_cost_eur → total_cost_eur GENERATED (DEC-217).
      const before = await client.query<{ total_cost_eur: string }>(
        `SELECT total_cost_eur FROM public.email_bulk_run WHERE id = $1`,
        [f.runId],
      );
      await client.query(
        `UPDATE public.email_bulk_run SET synthesis_cost_eur = 0.42
         WHERE id = $1`,
        [f.runId],
      );
      const after = await client.query<{ total_cost_eur: string }>(
        `SELECT total_cost_eur FROM public.email_bulk_run WHERE id = $1`,
        [f.runId],
      );
      expect(
        parseFloat(after.rows[0].total_cost_eur) -
          parseFloat(before.rows[0].total_cost_eur),
      ).toBeCloseTo(0.42, 4);

      await flipStatus(client, f.runId, "synthesized");

      // ── Curation (SLC-V9.5-D AC-D-3) — behavioral durch RLS als
      //    tenant_admin A (nicht als Superuser).
      await withJwtContext(client, f.userA, async () => {
        const accept = await client.query(
          `UPDATE public.email_synthesized_unit
           SET curation_status = 'accepted', curated_section = 'kommunikation',
               curator_user_id = $2, curated_at = now()
           WHERE id = $1`,
          [unitIds[0], f.userA],
        );
        expect(accept.rowCount).toBe(1);

        const reject = await client.query(
          `UPDATE public.email_synthesized_unit
           SET curation_status = 'rejected', curator_user_id = $2,
               curated_at = now()
           WHERE id = $1`,
          [unitIds[1], f.userA],
        );
        expect(reject.rowCount).toBe(1);
      });

      // ── finishCuration-Aequivalent (AC-D-4): synthesized → importing.
      await flipStatus(client, f.runId, "importing");

      // ── Handbook-Import (AC-D-1): Pseudo-Checkpoint + echter Mapper.
      const cp = await client.query<{ id: string }>(
        `INSERT INTO public.block_checkpoint
           (tenant_id, capture_session_id, block_key, checkpoint_type,
            content, content_hash, created_by)
         VALUES ($1, $2, 'email_bulk', 'email_bulk_import',
                 '{}'::jsonb, 'e2e-cp-hash', $3)
         RETURNING id`,
        [f.tenantA, f.sessionA, f.userA],
      );
      const checkpointId = cp.rows[0].id;

      const acceptedUnit = await client.query<{
        id: string;
        title: string;
        description: string;
        evidence_snippets: unknown[] | null;
        aggregated_confidence: string;
        evidence_count: number;
        source_pattern_ids: string[] | null;
        curated_section: string | null;
        created_at: string;
      }>(
        `SELECT id, title, description, evidence_snippets,
                aggregated_confidence, evidence_count, source_pattern_ids,
                curated_section, created_at::text
         FROM public.email_synthesized_unit
         WHERE bulk_run_id = $1 AND curation_status = 'accepted'
           AND curated_section IS NOT NULL
           AND imported_to_handbook_at IS NULL`,
        [f.runId],
      );
      expect(acceptedUnit.rowCount).toBe(1);
      const u = acceptedUnit.rows[0];

      const kuInput = mapSynthesizedUnitToKnowledgeUnit({
        unit: {
          id: u.id,
          title: u.title,
          description: u.description,
          evidence_snippets: u.evidence_snippets,
          aggregated_confidence: parseFloat(u.aggregated_confidence),
          evidence_count: u.evidence_count,
          source_pattern_ids: u.source_pattern_ids,
          curated_section: u.curated_section,
        },
        bulkRun: {
          id: f.runId,
          tenant_id: f.tenantA,
          capture_session_id: f.sessionA,
          source_file_name: "mailbox.mbox",
        },
        captureSessionId: f.sessionA,
        blockCheckpointId: checkpointId,
        curatorUserId: f.userA,
        extractedAt: new Date(u.created_at).toISOString(),
      });

      // INSERT mit metadata, Fallback ohne (DEC-193-Pfad wie importToHandbook).
      let kuId: string | null = null;
      await client.query("SAVEPOINT ku_insert");
      try {
        const kuRes = await client.query<{ id: string }>(
          `INSERT INTO public.knowledge_unit
             (tenant_id, capture_session_id, block_checkpoint_id, block_key,
              unit_type, source, title, body, confidence, status, updated_by,
              evidence_refs, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                   $12::jsonb, $13::jsonb)
           RETURNING id`,
          [
            kuInput.tenant_id,
            kuInput.capture_session_id,
            kuInput.block_checkpoint_id,
            kuInput.block_key,
            kuInput.unit_type,
            kuInput.source,
            kuInput.title,
            kuInput.body,
            kuInput.confidence,
            kuInput.status,
            kuInput.updated_by,
            JSON.stringify(kuInput.evidence_refs ?? []),
            JSON.stringify(kuInput.metadata ?? null),
          ],
        );
        kuId = kuRes.rows[0].id;
      } catch {
        await client.query("ROLLBACK TO SAVEPOINT ku_insert");
        const kuRes = await client.query<{ id: string }>(
          `INSERT INTO public.knowledge_unit
             (tenant_id, capture_session_id, block_checkpoint_id, block_key,
              unit_type, source, title, body, confidence, status, updated_by,
              evidence_refs)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
           RETURNING id`,
          [
            kuInput.tenant_id,
            kuInput.capture_session_id,
            kuInput.block_checkpoint_id,
            kuInput.block_key,
            kuInput.unit_type,
            kuInput.source,
            kuInput.title,
            kuInput.body,
            kuInput.confidence,
            kuInput.status,
            kuInput.updated_by,
            JSON.stringify(kuInput.evidence_refs ?? []),
          ],
        );
        kuId = kuRes.rows[0].id;
      }
      expect(kuId).toBeTruthy();

      await client.query(
        `UPDATE public.email_synthesized_unit
         SET imported_knowledge_unit_id = $2, imported_to_handbook_at = now()
         WHERE id = $1`,
        [u.id, kuId],
      );

      // ── Snapshot-RPC behavioral als tenant_admin (SECURITY DEFINER).
      await withJwtContext(client, f.userA, async () => {
        const rpc = await client.query<{ result: Record<string, unknown> }>(
          `SELECT public.rpc_trigger_handbook_snapshot($1) AS result`,
          [f.sessionA],
        );
        const result = rpc.rows[0].result;
        expect(result.error).toBeUndefined();
        expect(typeof result.handbook_snapshot_id).toBe("string");
      });

      await flipStatus(client, f.runId, "completed");

      // ── Gesamt-Assertions.
      // Reduktions-Quote: 6 Patterns → 2 Units.
      const counts = await client.query<{ patterns: string; units: string }>(
        `SELECT
           (SELECT count(*) FROM public.email_pattern WHERE bulk_run_id = $1) AS patterns,
           (SELECT count(*) FROM public.email_synthesized_unit WHERE bulk_run_id = $1) AS units`,
        [f.runId],
      );
      expect(parseInt(counts.rows[0].patterns)).toBe(6);
      expect(parseInt(counts.rows[0].units)).toBe(2);

      // Evidenz-Aggregation: _source-Rows == sum(evidence_count) == 6;
      // source_pattern_ids konsistent zur evidence_count.
      const evidence = await client.query<{
        src_rows: string;
        evidence_sum: string;
        mismatched: string;
      }>(
        `SELECT
           (SELECT count(*) FROM public.email_synthesized_unit_source s
             JOIN public.email_synthesized_unit eu ON eu.id = s.synthesized_unit_id
            WHERE eu.bulk_run_id = $1) AS src_rows,
           (SELECT coalesce(sum(evidence_count), 0)
              FROM public.email_synthesized_unit WHERE bulk_run_id = $1) AS evidence_sum,
           (SELECT count(*) FROM public.email_synthesized_unit
            WHERE bulk_run_id = $1
              AND cardinality(source_pattern_ids) <> evidence_count) AS mismatched`,
        [f.runId],
      );
      expect(parseInt(evidence.rows[0].src_rows)).toBe(6);
      expect(parseInt(evidence.rows[0].evidence_sum)).toBe(6);
      expect(parseInt(evidence.rows[0].mismatched)).toBe(0);

      // knowledge_unit-Contract (AC-D-1) + Attribution (R-D-4).
      const ku = await client.query<{
        title: string;
        body: string;
        confidence: string;
        status: string;
        source: string;
        unit_type: string;
        block_key: string;
      }>(
        `SELECT title, body, confidence, status, source, unit_type, block_key
         FROM public.knowledge_unit WHERE id = $1`,
        [kuId],
      );
      const kuRow = ku.rows[0];
      expect(kuRow.source).toBe("email_bulk");
      expect(kuRow.unit_type).toBe("observation");
      expect(kuRow.status).toBe("accepted");
      expect(kuRow.confidence).toBe("high"); // 0.9 >= 0.85
      expect(kuRow.block_key).toBe("kommunikation");
      expect(kuRow.body).toContain("**Belege**: 3 Quell-Patterns");
      expect(kuRow.body).toContain(`/dashboard/bulk-email-import/${f.runId}`);

      // P1/P2-Scan (AC-D-2 / R-D-2): keine Pseudonym-Token im promoteten
      // Handbuch-Content — obwohl die ROHEN Patterns sie enthalten.
      expect(kuRow.title).not.toMatch(/\bP\d+\b/);
      expect(kuRow.body).not.toMatch(/\bP\d+\b/);

      // Import-Marker auf der Unit.
      const marked = await client.query<{ imported: boolean }>(
        `SELECT (imported_knowledge_unit_id IS NOT NULL
                 AND imported_to_handbook_at IS NOT NULL) AS imported
         FROM public.email_synthesized_unit WHERE id = $1`,
        [u.id],
      );
      expect(marked.rows[0].imported).toBe(true);

      // Finaler Run-Status.
      const finalRun = await client.query<{ status: string }>(
        `SELECT status FROM public.email_bulk_run WHERE id = $1`,
        [f.runId],
      );
      expect(finalRun.rows[0].status).toBe("completed");
    });
  });

  it("rejects unknown email_bulk_run.status values (CHECK intact)", async () => {
    await withTestDb(async (client) => {
      const f = await seedRunWithPatterns(client);
      let errorMessage: string | null = null;
      await client.query("SAVEPOINT try_bogus_status");
      try {
        await client.query(
          `UPDATE public.email_bulk_run SET status = 'bogus_status'
           WHERE id = $1`,
          [f.runId],
        );
      } catch (e) {
        errorMessage = (e as Error).message;
      }
      await client.query("ROLLBACK TO SAVEPOINT try_bogus_status");
      expect(errorMessage).toMatch(/check constraint/i);
    });
  });
});
