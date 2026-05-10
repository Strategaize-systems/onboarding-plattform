// SLC-092 MT-4 — RLS-Matrix fuer rpc_get_walkthrough_video_path (V5.1, MIG-033).
//
// Pflicht-Gate aus Slice-Spec AC-7 + AC-8: 4 Rollen × 3 Statuses × 2 Tenants
// gegen Live-Coolify-DB. Pattern aus block-review-rls.test.ts (V4.1) +
// v5-walkthrough-rls.test.ts (V5).
//
// Was wird hier *nicht* getestet:
//   - Tabellen-RLS auf walkthrough_session/_step/_review_mapping — bereits in
//     `v5-walkthrough-rls.test.ts` (48 Faelle) abgedeckt.
//   - Storage-Proxy-HTTP-Status-Mapping — in
//     `app/api/walkthrough/[sessionId]/embed/__tests__/route.test.ts`.
//   Hier verifizieren wir nur die RPC selbst (DEC-099) — sie ist das
//   Authorization-Gateway, das der Storage-Proxy konsumiert.

import { describe, it, expect } from "vitest";
import type { Client } from "pg";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedTestTenants } from "@/test/fixtures/tenants";

interface EmbedFixture {
  tenantA: string;
  tenantB: string;
  /** tenant_admin von Tenant A. */
  adminA: string;
  /** tenant_admin von Tenant B. */
  adminB: string;
  /** tenant_member in Tenant A. */
  memberA: string;
  /** employee in Tenant A. */
  employeeA: string;
  /** strategaize_admin (kein tenant_id). */
  saAdmin: string;
  /** approved walkthrough_session in Tenant A — liefert storage_path. */
  approvedA: string;
  /** pending_review walkthrough_session in Tenant A — liefert error=not_approved. */
  pendingA: string;
  /** rejected walkthrough_session in Tenant A — liefert error=not_approved. */
  rejectedA: string;
  /** approved walkthrough_session in Tenant B (cross-tenant). */
  approvedB: string;
  /** Erwarteter storage_path-Wert von approvedA. */
  storagePathA: string;
}

async function seedEmbedFixture(client: Client): Promise<EmbedFixture> {
  const seeded = await seedTestTenants(client);
  const { tenantA, tenantB, userA: adminA, userB: adminB, templateId, templateVersion } = seeded;

  // strategaize_admin (no tenant)
  const saInsert = await client.query<{ id: string }>(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     )
     VALUES (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
       'authenticated', 'authenticated',
       'sa-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
       '{}'::jsonb, jsonb_build_object('role', 'strategaize_admin'),
       now(), now()
     )
     RETURNING id`
  );
  const saAdmin = saInsert.rows[0].id;
  await client.query(
    `UPDATE public.profiles SET role='strategaize_admin', tenant_id=NULL WHERE id=$1`,
    [saAdmin]
  );

  async function makeMember(
    tenant: string,
    role: "tenant_member" | "employee",
  ): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at
       )
       VALUES (
         '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
         'authenticated', 'authenticated',
         '${role.slice(0, 3)}-' || substr(gen_random_uuid()::text, 1, 8) || '@onboarding.test', '',
         '{}'::jsonb, jsonb_build_object('tenant_id', $1::text, 'role', $2::text),
         now(), now()
       )
       RETURNING id`,
      [tenant, role]
    );
    return r.rows[0].id;
  }

  const memberA = await makeMember(tenantA, "tenant_member");
  const employeeA = await makeMember(tenantA, "employee");

  // capture_session FKs
  const cap = await client.query<{ id: string; tenant: string }>(
    `INSERT INTO public.capture_session
       (tenant_id, template_id, template_version, owner_user_id, status)
     VALUES ($1, $2, $3, $4, 'open'), ($5, $2, $3, $6, 'open')
     RETURNING id, tenant_id AS tenant`,
    [tenantA, templateId, templateVersion, adminA, tenantB, adminB]
  );
  const captureA = cap.rows.find((r) => r.tenant === tenantA)!.id;
  const captureB = cap.rows.find((r) => r.tenant === tenantB)!.id;

  const storagePathA = `${tenantA}/__test__/recording.webm`;
  const storagePathB = `${tenantB}/__test__/recording.webm`;

  // walkthrough_sessions: 3 in A (approved/pending/rejected) + 1 in B (approved)
  const wsInsert = await client.query<{
    id: string;
    tenant_id: string;
    status: string;
  }>(
    `INSERT INTO public.walkthrough_session
       (tenant_id, capture_session_id, recorded_by_user_id, status,
        storage_path, reviewer_user_id, reviewed_at)
     VALUES
       ($1, $2, $3, 'approved',       $8,   $9,   now()),
       ($1, $2, $3, 'pending_review', NULL, NULL, NULL),
       ($1, $2, $3, 'rejected',       NULL, $9,   now()),
       ($4, $5, $6, 'approved',       $10,  $7,   now())
     RETURNING id, tenant_id, status`,
    [
      tenantA,        // $1
      captureA,       // $2
      adminA,         // $3
      tenantB,        // $4
      captureB,       // $5
      adminB,         // $6
      saAdmin,        // $7  — reviewer fuer approvedB (saAdmin reviewed cross-tenant)
      storagePathA,   // $8
      saAdmin,        // $9  — reviewer fuer approvedA + rejectedA
      storagePathB,   // $10
    ]
  );

  const approvedA = wsInsert.rows.find(
    (r) => r.tenant_id === tenantA && r.status === "approved",
  )!.id;
  const pendingA = wsInsert.rows.find(
    (r) => r.tenant_id === tenantA && r.status === "pending_review",
  )!.id;
  const rejectedA = wsInsert.rows.find(
    (r) => r.tenant_id === tenantA && r.status === "rejected",
  )!.id;
  const approvedB = wsInsert.rows.find(
    (r) => r.tenant_id === tenantB && r.status === "approved",
  )!.id;

  return {
    tenantA, tenantB,
    adminA, adminB, memberA, employeeA, saAdmin,
    approvedA, pendingA, rejectedA, approvedB,
    storagePathA,
  };
}

interface RpcResult {
  result: {
    storage_path?: string;
    created_at?: string;
    reviewed_at?: string;
    error?: string;
    status?: string;
  } | null;
}

async function callRpc(
  client: Client,
  sessionId: string,
): Promise<RpcResult["result"]> {
  const res = await client.query<RpcResult>(
    `SELECT public.rpc_get_walkthrough_video_path($1::uuid) AS result`,
    [sessionId],
  );
  return res.rows[0]?.result ?? null;
}

// ============================================================================
// Unauthenticated (1 case)
// ============================================================================

describe("RLS Matrix — rpc_get_walkthrough_video_path / unauthenticated", () => {
  it("Case 1: ohne JWT-Context (auth.user_role()=NULL) → error=unauthenticated", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      // Kein withJwtContext-Wrap → request.jwt.claims ist nicht gesetzt.
      // RESET ROLE auf postgres-Superuser ist OK, weil rpc_get_walkthrough_video_path
      // SECURITY DEFINER ist und user_role() ueber JWT-Claims liest, nicht ueber
      // session-rolle.
      const r = await callRpc(client, f.approvedA);
      expect(r?.error).toBe("unauthenticated");
    });
  });
});

// ============================================================================
// tenant_admin (5 cases)
// ============================================================================

describe("RLS Matrix — rpc_get_walkthrough_video_path / tenant_admin", () => {
  it("Case 2: tenant_admin own approved → liefert storage_path", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.adminA, async () => {
        r = await callRpc(client, f.approvedA);
      });
      expect(r!.error).toBeUndefined();
      expect(r!.storage_path).toBe(f.storagePathA);
      expect(r!.reviewed_at).toBeTruthy();
    });
  });

  it("Case 3: tenant_admin own pending_review → error=not_approved", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.adminA, async () => {
        r = await callRpc(client, f.pendingA);
      });
      expect(r!.error).toBe("not_approved");
      expect(r!.status).toBe("pending_review");
    });
  });

  it("Case 4: tenant_admin own rejected → error=not_approved", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.adminA, async () => {
        r = await callRpc(client, f.rejectedA);
      });
      expect(r!.error).toBe("not_approved");
      expect(r!.status).toBe("rejected");
    });
  });

  it("Case 5: tenant_admin cross-tenant approved → error=forbidden", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.adminA, async () => {
        r = await callRpc(client, f.approvedB);
      });
      expect(r!.error).toBe("forbidden");
    });
  });

  it("Case 6: tenant_admin not_found UUID → error=not_found", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.adminA, async () => {
        r = await callRpc(client, "00000000-0000-0000-0000-000000000000");
      });
      expect(r!.error).toBe("not_found");
    });
  });
});

// ============================================================================
// tenant_member (3 cases)
// ============================================================================

describe("RLS Matrix — rpc_get_walkthrough_video_path / tenant_member", () => {
  it("Case 7: tenant_member own-tenant approved → error=forbidden (Reader-Rolle nur tenant_admin/sa_admin)", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.memberA, async () => {
        r = await callRpc(client, f.approvedA);
      });
      expect(r!.error).toBe("forbidden");
    });
  });

  it("Case 8: tenant_member own-tenant pending_review → error=forbidden", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.memberA, async () => {
        r = await callRpc(client, f.pendingA);
      });
      expect(r!.error).toBe("forbidden");
    });
  });

  it("Case 9: tenant_member cross-tenant approved → error=forbidden (Rollen-Check vor Tenant-Check)", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.memberA, async () => {
        r = await callRpc(client, f.approvedB);
      });
      expect(r!.error).toBe("forbidden");
    });
  });
});

// ============================================================================
// employee (3 cases)
// ============================================================================

describe("RLS Matrix — rpc_get_walkthrough_video_path / employee", () => {
  it("Case 10: employee own-tenant approved → error=forbidden", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.employeeA, async () => {
        r = await callRpc(client, f.approvedA);
      });
      expect(r!.error).toBe("forbidden");
    });
  });

  it("Case 11: employee own-tenant pending_review → error=forbidden", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.employeeA, async () => {
        r = await callRpc(client, f.pendingA);
      });
      expect(r!.error).toBe("forbidden");
    });
  });

  it("Case 12: employee own-tenant rejected → error=forbidden", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.employeeA, async () => {
        r = await callRpc(client, f.rejectedA);
      });
      expect(r!.error).toBe("forbidden");
    });
  });
});

// ============================================================================
// strategaize_admin (4 cases — cross-tenant approved is the key path)
// ============================================================================

describe("RLS Matrix — rpc_get_walkthrough_video_path / strategaize_admin", () => {
  it("Case 13: strategaize_admin cross-tenant approved (Tenant B) → liefert storage_path", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.saAdmin, async () => {
        r = await callRpc(client, f.approvedB);
      });
      expect(r!.error).toBeUndefined();
      expect(r!.storage_path).toBeTruthy();
      expect(r!.storage_path).toContain(f.tenantB);
    });
  });

  it("Case 14: strategaize_admin cross-tenant pending → error=not_approved", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.saAdmin, async () => {
        r = await callRpc(client, f.pendingA);
      });
      expect(r!.error).toBe("not_approved");
      expect(r!.status).toBe("pending_review");
    });
  });

  it("Case 15: strategaize_admin cross-tenant rejected → error=not_approved", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.saAdmin, async () => {
        r = await callRpc(client, f.rejectedA);
      });
      expect(r!.error).toBe("not_approved");
      expect(r!.status).toBe("rejected");
    });
  });

  it("Case 16: strategaize_admin own-tenant approved (Tenant A) → liefert storage_path", async () => {
    await withTestDb(async (client) => {
      const f = await seedEmbedFixture(client);
      let r: RpcResult["result"] = null;
      await withJwtContext(client, f.saAdmin, async () => {
        r = await callRpc(client, f.approvedA);
      });
      expect(r!.error).toBeUndefined();
      expect(r!.storage_path).toBe(f.storagePathA);
    });
  });
});
