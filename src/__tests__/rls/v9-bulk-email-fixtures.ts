// V9 SLC-165 MT-6 — Fixtures fuer die V9-Bulk-Email-RLS-Matrix.
//
// Aufbau analog v4-fixtures.ts:
//   - Wir reusen seedV4Fixtures fuer 2 Tenants + 7 User (1 sa + je 3 pro Tenant).
//   - Pro Tenant kommt je 1 Row in jede der 4 V9-Tabellen dazu:
//     email_bulk_run -> email_thread -> email_message (FK auf thread)
//     -> email_pattern (FK auf thread + bulk_run, NOT NULL).
//   - Inserts laufen als Superuser (kein withJwtContext) damit RLS sie nicht
//     blockiert — die Pen-Tests setzen den User-Kontext dann selbst.
//
// Wichtig: Diese Fixtures benoetigen Migration 106 (MIG-051) auf der Test-DB.
// Per RPT-382 ist die Migration LIVE auf der Coolify-DB; lokale Tests muessen
// gegen dieselbe DB laufen (TEST_DATABASE_URL).

import type { Client } from "pg";

import { seedV4Fixtures, type V4Fixtures } from "./v4-fixtures";

export interface V9BulkEmailFixtures extends V4Fixtures {
  bulkRunA: string;
  bulkRunB: string;
  threadA: string;
  threadB: string;
  messageA: string;
  messageB: string;
  patternA: string;
  patternB: string;
}

export async function seedV9BulkEmailFixtures(
  client: Client,
): Promise<V9BulkEmailFixtures> {
  const base = await seedV4Fixtures(client);

  const mkBulkRun = async (
    tenantId: string,
    uploaderUserId: string,
    hashSuffix: string,
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.email_bulk_run
         (tenant_id, uploader_user_id, source_file_name, file_hash,
          storage_path, status)
       VALUES ($1, $2, $3, $4, $5, 'uploaded')
       RETURNING id`,
      [
        tenantId,
        uploaderUserId,
        `v9-fixture-${hashSuffix}.mbox`,
        `hash-v9-${hashSuffix}-${Math.random().toString(36).slice(2, 10)}`,
        `${tenantId}/v9-fixture-${hashSuffix}/v9-fixture-${hashSuffix}.mbox`,
      ],
    );
    return res.rows[0].id;
  };

  const bulkRunA = await mkBulkRun(base.tenantA, base.tenantAdminAUserId, "a");
  const bulkRunB = await mkBulkRun(base.tenantB, base.tenantAdminBUserId, "b");

  const mkThread = async (
    tenantId: string,
    bulkRunId: string,
    suffix: string,
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.email_thread
         (tenant_id, bulk_run_id, root_message_id, subject, email_count,
          thread_status)
       VALUES ($1, $2, $3, $4, 1, 'aggregated')
       RETURNING id`,
      [
        tenantId,
        bulkRunId,
        `<root-v9-${suffix}@example.com>`,
        `V9 Fixture Thread ${suffix.toUpperCase()}`,
      ],
    );
    return res.rows[0].id;
  };

  const threadA = await mkThread(base.tenantA, bulkRunA, "a");
  const threadB = await mkThread(base.tenantB, bulkRunB, "b");

  const mkMessage = async (
    tenantId: string,
    bulkRunId: string,
    threadId: string,
    suffix: string,
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.email_message
         (tenant_id, bulk_run_id, thread_id, message_id, subject, body_text)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        tenantId,
        bulkRunId,
        threadId,
        `<msg-v9-${suffix}@example.com>`,
        `V9 Fixture Message ${suffix.toUpperCase()}`,
        `Body for V9 fixture ${suffix}`,
      ],
    );
    return res.rows[0].id;
  };

  const messageA = await mkMessage(base.tenantA, bulkRunA, threadA, "a");
  const messageB = await mkMessage(base.tenantB, bulkRunB, threadB, "b");

  const mkPattern = async (
    tenantId: string,
    bulkRunId: string,
    threadId: string,
    suffix: string,
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.email_pattern
         (tenant_id, bulk_run_id, thread_id, title, description, confidence,
          curation_status)
       VALUES ($1, $2, $3, $4, $5, 0.85, 'pending_curation')
       RETURNING id`,
      [
        tenantId,
        bulkRunId,
        threadId,
        `V9 Fixture Pattern ${suffix.toUpperCase()}`,
        `Description for V9 fixture pattern ${suffix}`,
      ],
    );
    return res.rows[0].id;
  };

  const patternA = await mkPattern(base.tenantA, bulkRunA, threadA, "a");
  const patternB = await mkPattern(base.tenantB, bulkRunB, threadB, "b");

  return {
    ...base,
    bulkRunA,
    bulkRunB,
    threadA,
    threadB,
    messageA,
    messageB,
    patternA,
    patternB,
  };
}
