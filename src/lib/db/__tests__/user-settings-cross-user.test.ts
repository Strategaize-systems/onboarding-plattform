// SLC-049 MT-6 — Cross-User-Block fuer user_settings.
//
// Verifiziert die Sicherheits-Garantie hinter MT-5 (Settings-Page Opt-Out-Toggle):
// Ein authentifizierter Tenant-User darf ausschliesslich seine eigene
// user_settings-Zeile veraendern. Der UPDATE-Versuch auf eine fremde Zeile
// muss durch RLS auf 0 betroffene Rows reduziert werden — KEIN Permission-Error,
// der Filter wirkt schon im Query-Plan.
//
// Hintergrund: Die Server-Action `toggleRemindersOptOut` nutzt den Service-Role-
// Client mit explizitem `eq("user_id", auth.uid())`. RLS ist die zweite
// Verteidigungslinie, falls der Filter je weggepatcht wird.
//
// Foundation-Coverage: `src/__tests__/rls/v42-foundation-rls.test.ts` testet
// die volle 4-Rollen-Matrix. Diese Datei ist die SLC-049-spezifische Negativ-
// Probe und ist explizit benannt fuer kuenftige /qa-Verifikation.

import { describe, it, expect } from "vitest";
import { withTestDb } from "@/test/db";
import { withJwtContext } from "@/test/auth-context";
import { seedV4Fixtures } from "@/__tests__/rls/v4-fixtures";

describe("SLC-049 MT-6 — user_settings cross-user-block", () => {
  it("User A's UPDATE attempt on User B's user_settings row affects 0 rows (RLS DENY)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const r = await client.query<{ user_id: string }>(
          `UPDATE public.user_settings
              SET reminders_opt_out = true
            WHERE user_id = $1
            RETURNING user_id`,
          [f.tenantAdminBUserId]
        );
        expect(r.rowCount).toBe(0);
      });

      // Zustand danach lesen — Tenant B's Eintrag ist unveraendert.
      const stateAfter = await client.query<{ reminders_opt_out: boolean }>(
        `SELECT reminders_opt_out FROM public.user_settings WHERE user_id = $1`,
        [f.tenantAdminBUserId]
      );
      expect(stateAfter.rowCount).toBe(1);
      expect(stateAfter.rows[0].reminders_opt_out).toBe(false);
    });
  });

  it("User A's UPDATE on its own row affects exactly 1 row (positive control)", async () => {
    await withTestDb(async (client) => {
      const f = await seedV4Fixtures(client);

      await withJwtContext(client, f.tenantAdminAUserId, async () => {
        const r = await client.query<{ reminders_opt_out: boolean }>(
          `UPDATE public.user_settings
              SET reminders_opt_out = true
            WHERE user_id = $1
            RETURNING reminders_opt_out`,
          [f.tenantAdminAUserId]
        );
        expect(r.rowCount).toBe(1);
        expect(r.rows[0].reminders_opt_out).toBe(true);
      });
    });
  });
});
