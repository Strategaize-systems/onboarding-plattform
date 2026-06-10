// V9.1 SLC-V9.1-A MT-R7 — Fixtures fuer die RLS-Pen-Test-Matrix von
// email_inbound_sync_state (MIG-061 / Migration 116).
//
// Aufbau analog v9-bulk-email-fixtures.ts:
//   - Wir reusen seedV4Fixtures fuer 2 Tenants + 7 User (1 sa + je 3 pro Tenant).
//   - Pro Tenant kommt je 1 email_inbound_endpoint (MIG-057/112) + je 1
//     email_inbound_sync_state (MIG-061/116, PK endpoint_id) dazu.
//   - Zusaetzlich endpointA2 (Tenant A, OHNE sync_state-Row) als FK-valider
//     INSERT-Target fuer die "tenant_admin/-member/-employee INSERT DENY"-Cases
//     (vermeidet PK-Konflikt mit der bestehenden syncState-Row von endpointA).
//   - Inserts laufen als Superuser (kein withJwtContext) damit RLS sie nicht
//     blockiert — die Pen-Tests setzen den User-Kontext dann selbst.
//
// Wichtig: Diese Fixtures benoetigen Migration 112 (MIG-057, endpoint-Tabelle)
// + 116 (MIG-061, sync_state) auf der Test-DB. Beide sind LIVE auf der
// Coolify-DB (RPT-438); lokale Tests muessen gegen dieselbe DB laufen
// (TEST_DATABASE_URL, .claude/rules/coolify-test-setup.md).

import type { Client } from "pg";

import { seedV4Fixtures, type V4Fixtures } from "./v4-fixtures";

export interface V91InboundFixtures extends V4Fixtures {
  endpointA: string;
  endpointB: string;
  /** Tenant A, ohne sync_state-Row — FK-valider Target fuer INSERT-DENY-Cases. */
  endpointA2: string;
}

export async function seedV91InboundFixtures(
  client: Client,
): Promise<V91InboundFixtures> {
  const base = await seedV4Fixtures(client);

  const mkEndpoint = async (
    tenantId: string,
    slugSuffix: string,
  ): Promise<string> => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.email_inbound_endpoint
         (tenant_id, slug, setup_token, status, display_name)
       VALUES ($1,
               'v91-inbound-' || $2 || '-' || substr(gen_random_uuid()::text, 1, 8),
               'tok-' || substr(gen_random_uuid()::text, 1, 16),
               'active', $3)
       RETURNING id`,
      [tenantId, slugSuffix, `V9.1 Inbound Endpoint ${slugSuffix}`],
    );
    return res.rows[0].id;
  };

  const endpointA = await mkEndpoint(base.tenantA, "a");
  const endpointB = await mkEndpoint(base.tenantB, "b");
  const endpointA2 = await mkEndpoint(base.tenantA, "a2");

  const mkSyncState = async (
    endpointId: string,
    tenantId: string,
    lastUid: number,
  ): Promise<void> => {
    await client.query(
      `INSERT INTO public.email_inbound_sync_state
         (endpoint_id, tenant_id, folder, last_uid, status, emails_synced_total)
       VALUES ($1, $2, 'INBOX', $3, 'idle', 0)`,
      [endpointId, tenantId, lastUid],
    );
  };

  // endpointA + endpointB bekommen eine sync_state-Row; endpointA2 bewusst nicht.
  await mkSyncState(endpointA, base.tenantA, 42);
  await mkSyncState(endpointB, base.tenantB, 17);

  return {
    ...base,
    endpointA,
    endpointB,
    endpointA2,
  };
}
