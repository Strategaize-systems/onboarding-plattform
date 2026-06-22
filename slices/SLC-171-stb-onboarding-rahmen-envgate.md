# SLC-171 — StB-Onboarding-Rahmen + Env-Gate

- Version: V10
- Feature: FEAT-090
- Backlog: BL-509
- Status: planned
- Priority: Medium
- Created: 2026-06-21
- Parallel-Group: A (Foundation) — keine MIG, disjunkt zu SLC-169/170
- MIG reserviert: keine
- Worktree (SaaS-Pflicht): eigener Branch `v10-slc171-onboarding-envgate`, Merge nach /qa-PASS

## Ziel
Der StB onboardet die EIGENE Kanzlei als normaler Tenant (`tenant_admin`) via bestehendem Provisioning — kein neuer Code-Kern, keine neue Rolle. Zusaetzlich: der Env-Flag-Rahmen (`NEXT_PUBLIC_ENABLE_STB_VERTIKALE`), der die V10-Routen (`dashboard/stb/*`) und Job-Typen OFF haelt bis bereit (Internal-Test-Mode, `module-lifecycle-discipline`). Kleiner Reuse-Slice (DEC-238).

## Architektur-Anker
- DEC-238: StB = `tenant_admin` der eigenen Kanzlei via vorhandenem Tenant-Provisioning (Invitation `role_hint='tenant_admin'` ODER Self-Signup `provisionSelfSignupTenant`). Keine neue Rolle, keine Partner/Mandanten-Hierarchie (V11+).
- DEC-239: Gating via Env-Flag `NEXT_PUBLIC_ENABLE_STB_VERTIKALE` (Default OFF) + Tier-Gating fuer Job-Typen.
- StB-Vertical-Marker als `tenant.metadata`/`capture_session.metadata`-jsonb-Flag (kein DDL — ARCH: „0 Aenderung an bestehenden OP-Funktionen", 1 Migration gesamt = 124).
  - **DEC-243 (Spec-Schema-Drift-Fix, /backend 2026-06-22):** `tenants` hat KEINE metadata/settings-jsonb-Spalte — der `tenant.metadata`-Pfad ist ohne neue Migration nicht moeglich, was die "1 MIG = 124"-Invariante verletzen wuerde. Marker lebt daher in **`capture_session.metadata.stb_vertical_stage`** (Founder-delegiert). Folge: MT-1 = thin Helper + RLS-erbt (kein Provisioning-Touchpoint); der Set-Aufruf wird in **SLC-173** (Capture-Erstellung) verdrahtet. AC-171-2 „Tenant erkennbar" = „die StB-Capture-Sessions des Tenants tragen den Marker".

## Akzeptanzkriterien
- **AC-171-1:** StB legt die eigene Kanzlei als Tenant an (Reuse FEAT-031-Wizard / Provisioning) und loggt als `tenant_admin` ein. Kein neuer Provisioning-Pfad.
- **AC-171-2:** Tenant ist als „StB-Vertikale Stufe-1" erkennbar — metadata-Flag (jsonb), kein neues Schema. Spaetere Tier-/Pfad-Unterscheidung kann darauf greifen.
- **AC-171-3:** Tenant-Isolation (RLS) verifiziert — StB sieht nur die eigene Kanzlei.
- **AC-171-4:** `NEXT_PUBLIC_ENABLE_STB_VERTIKALE` als Env-Gate: bei OFF sind die V10-Routen (`dashboard/stb/*`) nicht erreichbar (Route-Group-Guard/Redirect) und der Synthese-Job tier-gated; bei ON sichtbar. Default OFF.
- **AC-171-5:** `tsc` 0, `eslint` 0, `next build` PASS; Guard-Verhalten hermetisch getestet.

## Micro-Tasks

### MT-1: StB-Vertical-Tenant-Marker (metadata-Flag) + RLS-Verify
- Goal: onboardeter Tenant als StB-Vertikale-Stufe-1 markierbar/erkennbar, ohne neues Schema.
- Files: `src/lib/stb-vertikale/tenant-marker.ts` (neu — Helper liest/setzt `tenant.metadata.stb_vertical_stage`), 1 Touchpoint im bestehenden Provisioning-/Onboarding-Pfad (genaue Datei im /backend code-verifizieren — Reuse, kein Rewrite), Test.
- Expected behavior: nach Onboarding traegt der Tenant `metadata.stb_vertical_stage='1'`; Helper idempotent; RLS unveraendert.
- Verification: hermetischer Test (Marker gesetzt/gelesen); RLS-Verify Reuse bestehender Tenant-Isolation.
- Dependencies: none.

### MT-2: Env-Gate `NEXT_PUBLIC_ENABLE_STB_VERTIKALE`
- Goal: V10-Oberflaeche/Job hinter zentralem Flag, Default OFF.
- Files: `src/lib/stb-vertikale/feature-gate.ts` (neu — `isStbVerticalEnabled()`), Route-Group-Guard fuer `src/app/dashboard/stb/*` (Layout-Redirect bei OFF), `.env.example` (Flag dokumentiert), Test.
- Expected behavior: OFF → `dashboard/stb/*` redirect/404, Job tier-gated; ON → sichtbar. Reader-Slice (SLC-175) konsumiert den Guard.
- Verification: hermetischer Guard-Test (OFF blockt, ON erlaubt).
- Dependencies: none.

## Risiken & Dependencies
- **R-171-1 (Provisioning-Touchpoint):** den genauen bestehenden Onboarding-/Provisioning-Einstieg im /backend code-verifizieren (FEAT-031-Wizard vs. Self-Signup) — Reuse, NICHT neu schreiben (`strategaize-pattern-reuse.md`).
- **Dependency:** keine. Env-Gate wird von SLC-172/173/175 (Routen) + SLC-174 (Job) konsumiert — daher fruehe Foundation.

## Out of Scope
Billing/Wholesale-Abrechnung; Mandanten-/Partner-Hierarchie (V11+); Public-Self-Signup-Landing; neue Rolle `stb_admin` (V11+).
