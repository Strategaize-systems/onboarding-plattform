// SLC-143 MT-5 — Visual-Regression-Baselines fuer 4 Auth-Pages auf Mobile (375).
// Per DEC-152: nur Mobile-Baselines (kein Tablet/Desktop) — Auth-Pages sind primaer
// Mobile-Entry-Flows, Layout-Brueche treten dort zuerst auf.
//
// 4 Test-Cases / 4 Mobile-Snapshots:
//   - /login                                 (Login-Form)
//   - /auth/set-password                     (rendert ErrorPage ohne valid Token)
//   - /auth/verify-signup                    (rendert ErrorPage ohne valid Token)
//   - /accept-invitation/<dummy-token>       (rendert ErrorPage ohne valid Token)
//
// Diese Pages brauchen KEIN DB-Actor-Setup — sie rendern selbststaendig
// (Form-UI oder Error-State). Nur E2E_BASE_URL muss erreichbar sein.
//
// Baseline-Generation: `npm run test:e2e:update -- auth-pages` (lokal mit
// dev-server gegen localhost:3000 ODER E2E_BASE_URL gegen Staging).

import { test, expect } from "@playwright/test";

const PAGES: Array<{ path: string; snapshot: string }> = [
  { path: "/login", snapshot: "auth-login.png" },
  { path: "/auth/set-password", snapshot: "auth-set-password.png" },
  { path: "/auth/verify-signup", snapshot: "auth-verify-signup.png" },
  {
    path: "/accept-invitation/dummy-token-for-baseline",
    snapshot: "auth-accept-invitation.png",
  },
];

test.describe("Auth Pages — Mobile Visual Baselines", () => {
  test.skip(
    process.env.E2E_BASE_URL === undefined && !process.env.CI,
    "E2E_BASE_URL not set — defaulting to localhost:3000 requires dev-server",
  );

  for (const { path, snapshot } of PAGES) {
    test(`renders ${path} on mobile`, async ({ page, viewport }) => {
      test.skip(
        !viewport || viewport.width > 400,
        "Auth-Pages-Baselines per DEC-152 nur Mobile.",
      );
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(snapshot, { fullPage: true });
    });
  }
});
