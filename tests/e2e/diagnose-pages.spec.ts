// SLC-140 MT-6c — Visual-Regression-Baselines fuer 3 Diagnose-Pages
// x 3 Viewports (375 Mobile / 768 Tablet / 1280 Desktop) = 9 Baseline-Snapshots.
//
// Baseline-Run-Anleitung (in spaeterer Mini-Session):
//   1. .env.local mit Coolify-Werten setzen:
//        NEXT_PUBLIC_SUPABASE_URL=https://api.onboarding.strategaizetransition.com
//        SUPABASE_SERVICE_ROLE_KEY=<aus Coolify-app-Resource>
//        TEST_DATABASE_URL=postgresql://postgres:<pw>@<supabase-db-container>:5432/postgres
//          (lokal: via SSH-Tunnel auf Hetzner-Coolify-DB, ODER Test-Run direkt
//           im node:20-Docker-Container auf dem Server per
//           reference_coolify_test_setup-Pattern)
//        E2E_BASE_URL=http://localhost:3000
//   2. `npm run dev` (separates Terminal)
//   3. `npm run test:e2e:update` — schreibt 9 Baselines unter
//      tests/e2e/diagnose-pages.spec.ts-snapshots/
//   4. Baselines committen + naechste Runs koennen ueber `npm run test:e2e`
//      Pixel-Drift detektieren.
//
// Touch-Target-Audit (Mobile 375): pruefe dass alle interaktiven Elemente
// >= 44px hoch sind (WCAG 2.5.5 + Apple HIG + Android Material).

import { test, expect } from "@playwright/test";
import {
  setupPartnerClientActor,
  loginViaMagicLink,
  cleanupActor,
  type PartnerClientActor,
} from "./helpers/auth-setup";
import { checkE2EEnv, skipReason } from "./helpers/env";

const envCheck = checkE2EEnv();

test.describe("Diagnose Start Page", () => {
  test.skip(!envCheck.ok, envCheck.ok ? "" : skipReason(envCheck.missing));

  let actor: PartnerClientActor;

  test.beforeAll(async () => {
    if (!envCheck.ok) return;
    actor = await setupPartnerClientActor(envCheck.env, "start");
  });

  test.afterAll(async () => {
    if (!envCheck.ok || !actor) return;
    await cleanupActor(envCheck.env, actor);
  });

  test("renders start page baseline", async ({ page }) => {
    if (!envCheck.ok) return;
    await loginViaMagicLink(page, envCheck.env, actor.email, "/dashboard/diagnose/start");
    await page.waitForURL(/\/dashboard\/diagnose\/start/, { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("diagnose-start.png", { fullPage: true });
  });

  test("mobile: interactive targets >= 44px", async ({ page, viewport }) => {
    if (!envCheck.ok) return;
    test.skip(!viewport || viewport.width > 400, "Touch-Target-Audit gilt nur fuer Mobile-Viewport.");
    await loginViaMagicLink(page, envCheck.env, actor.email, "/dashboard/diagnose/start");
    await page.waitForURL(/\/dashboard\/diagnose\/start/, { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    const buttons = page.locator("button:visible, a[role='button']:visible, [data-testid='cta']:visible");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (!box) continue;
      expect.soft(box.height, `Button #${i} hat boundingBox.height=${box.height}px (< 44px).`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("Diagnose Run Page", () => {
  test.skip(!envCheck.ok, envCheck.ok ? "" : skipReason(envCheck.missing));

  let actor: PartnerClientActor;

  test.beforeAll(async () => {
    if (!envCheck.ok) return;
    actor = await setupPartnerClientActor(envCheck.env, "run");
  });

  test.afterAll(async () => {
    if (!envCheck.ok || !actor) return;
    await cleanupActor(envCheck.env, actor);
  });

  test("renders run page baseline", async ({ page }) => {
    if (!envCheck.ok || !actor.captureSessionId) return;
    await loginViaMagicLink(
      page,
      envCheck.env,
      actor.email,
      `/dashboard/diagnose/run/${actor.captureSessionId}`,
    );
    await page.waitForURL(/\/dashboard\/diagnose\/run\//, { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("diagnose-run.png", { fullPage: true });
  });

  test("mobile: answer cards + nav buttons >= 44px", async ({ page, viewport }) => {
    if (!envCheck.ok || !actor.captureSessionId) return;
    test.skip(!viewport || viewport.width > 400, "Touch-Target-Audit gilt nur fuer Mobile-Viewport.");
    await loginViaMagicLink(
      page,
      envCheck.env,
      actor.email,
      `/dashboard/diagnose/run/${actor.captureSessionId}`,
    );
    await page.waitForURL(/\/dashboard\/diagnose\/run\//, { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    const targets = page.locator("button:visible, [role='radio']:visible, label:has(input[type='radio']):visible");
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await targets.nth(i).boundingBox();
      if (!box) continue;
      expect.soft(box.height, `Target #${i} hat boundingBox.height=${box.height}px (< 44px).`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("Diagnose Bericht Page", () => {
  test.skip(!envCheck.ok, envCheck.ok ? "" : skipReason(envCheck.missing));

  let actor: PartnerClientActor;

  test.beforeAll(async () => {
    if (!envCheck.ok) return;
    actor = await setupPartnerClientActor(envCheck.env, "bericht");
  });

  test.afterAll(async () => {
    if (!envCheck.ok || !actor) return;
    await cleanupActor(envCheck.env, actor);
  });

  test("renders bericht page baseline", async ({ page }) => {
    if (!envCheck.ok || !actor.captureSessionId) return;
    await loginViaMagicLink(
      page,
      envCheck.env,
      actor.email,
      `/dashboard/diagnose/${actor.captureSessionId}/bericht`,
    );
    await page.waitForURL(/\/bericht(\/|$|\?)/, { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("diagnose-bericht.png", { fullPage: true });
  });
});
