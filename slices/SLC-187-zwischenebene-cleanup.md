# SLC-187 — Zwischenebene-Cleanup: tenant_member/mirror/tenant_owner (FEAT-104)

- Status: planned
- Feature: FEAT-104 (PRD §V10.3) · DEC-263 (Zwischenebene entfällt) · DEC-264 (MIG-131, Live-Stand-Rebuild)
- Branch: `v10-3-rollenmodell-p1` (kumulativ nach SLC-186)
- Migration: **MIG-131** (reserviert; File-Nummer bei MT-2-Start per `ls sql/migrations/` final vergeben)
- Created: 2026-07-06

## Ziel

Die Kunden-Zwischenebene verschwindet vollständig aus Code und Datenbank: `tenant_member` (Rolle), `mirror_respondent` (Legacy-Pfad) und `tenant_owner` (Policy-Leichen). Danach gilt das 5-Rollen-Zielmodell aus DEC-263 mit sauberem Grep-Count 0.

## Verified-Against-Code-Reality (2026-07-06)

- Betroffenheit (Grep, Requirements-Recon): `tenant_member` in **48 src-Dateien + 27 sql-Dateien**; `mirror` in ~20 src-Dateien; `tenant_owner` in 6 Migrations-Files. Exakte, verbindliche Liste erstellt MT-1 (Audit) — die 48er-Zahl ist Scope-Indikator, nicht File-Liste.
- Live-DB verifiziert (2026-07-06, Prod): **0 User mit role='tenant_member'**; CHECK-Constraint 5 Werte; **18 distinkte Policies** mit tenant_member/tenant_owner (Namensliste in ARCHITECTURE Addendum U.2); handle_new_user()-prosrc live gezogen.
- DELETE-Pfad existiert (per ls): `src/app/api/admin/tenants/[tenantId]/mirror-respondents/route.ts`.
- Kern-MODIFY-Pfade existieren (per ls): `src/lib/auth/role-check.ts` + `__tests__/role-check.test.ts`, `src/lib/api-utils.ts`, `src/app/api/admin/tenants/[tenantId]/invite/route.ts`, `src/lib/email.ts` (sendMirrorInviteEmail:130), `src/app/admin/tenants/tenants-client.tsx`.

## Micro-Tasks

#### MT-1: Read-only Grep-Audit (Pflicht bei Sweep-Slices) [audit]
- Goal: Exhaustive Enumeration ALLER Use-Sites von `tenant_member`, `mirror` (case-insensitive, respondent/invite/UI) und `tenant_owner` in src/ + sql/ inkl. Tests; Klassifikation pro Treffer (DELETE-File / MODIFY-Zeile / Test-Anpassung / Migrations-Historie=unantastbar).
- Files: keine (read-only); Ergebnis als Audit-Tabelle in diese Spec (Abschnitt "MT-1-Audit").
- Expected behavior: Finale File-Liste ersetzt die 48er-Schätzung; MT-3/MT-4-Scope wird daraus finalisiert.
- Verification: Audit-Tabelle vollständig (Grep-Counts als Baseline dokumentiert).
- Dependencies: SLC-186 gemergt/abgeschlossen (kumulativer Branch).

#### MT-2: MIG-131 Code-Side-Authoring [backend]
- Goal: Idempotente Migration per DEC-264 (Live-Apply ist BEWUSST /deploy-Phase — MT-Xa/Xb-Split).
- Files: NEW `sql/migrations/131_v103_role_cleanup.sql` (Nummer bei Start gegen `ls sql/migrations/` verifizieren); MODIFY `docs/MIGRATIONS.md` (MIG-131 Status).
- Expected behavior: (1) defensives UPDATE tenant_member→employee; (2) profiles_role_check auf 4 Werte; (3) handle_new_user() ohne tenant_member (Basis: live prosrc aus Addendum U.2); (4) 18 Policies DROP/CREATE ohne tote Literale — Quelltext der Policies aus frischem Live-pg_policies-Dump, NICHT aus alten Migration-Files.
- Verification: SQL-Review gegen U.2-Liste (18/18 abgedeckt); Idempotenz-Muster (DROP POLICY IF EXISTS etc.); DB-gebundene RLS-Tests laufen erst im /deploy-Kontext (coolify-test-setup) — Code-Side-Gate ist Review + bestehende Pure-Mock-Suite.
- Dependencies: MT-1.

#### MT-3: Kern-Auth-Pfade bereinigen [backend, TDD]
- Goal: Rollen-Matrix und Invite-Pfad auf das 4-Rollen-Modell.
- Files: MODIFY `src/lib/auth/role-check.ts` (PathClasses dashboard/capture ohne tenant_member) + `src/lib/auth/__tests__/role-check.test.ts` (Matrix-Neufassung); MODIFY `src/lib/api-utils.ts` (requireTenant ohne tenant_member/mirror_respondent); MODIFY `src/app/api/admin/tenants/[tenantId]/invite/route.ts` (Fallback → employee, mirror-Zweig raus); MODIFY `src/lib/email.ts` (sendMirrorInviteEmail entfernen); DELETE `src/app/api/admin/tenants/[tenantId]/mirror-respondents/route.ts`.
- Expected behavior: Kein Auth-Pfad akzeptiert/vergibt tote Rollen; zweiter Invite-User ohne explizite Rolle wird employee.
- Verification: role-check-Tests RED→GREEN; targeted vitest der betroffenen Suiten; tsc 0 / eslint 0.
- Dependencies: MT-1 (finale Liste), MT-2 unabhängig.

#### MT-4: Rest-Fanout bis Grep-Count 0 [shared]
- Goal: Alle verbleibenden Treffer aus der MT-1-Audit-Liste (UI-Reste tenants-client/roster-actions, Layout-Redirect-Zeilen, Tests, Kommentare).
- Files: per MT-1-Audit-Tabelle (erwartet ~40 weitere Dateien, überwiegend Tests).
- Expected behavior: Done-Gate als Grep-Count: `tenant_member|mirror_respondent` = **0 Treffer in src/**; `tenant_owner` = 0 Treffer außerhalb `sql/migrations/`-Historie + MIG-131.
- Verification: Grep-Counts + Full-Vitest Baseline-Delta 0 Regression + next build PASS (Dummy-ENV).
- Dependencies: MT-3.

## Acceptance Criteria

- AC-187-1 [MT-4, Grep]: 0 Treffer tenant_member/mirror_respondent in src/; tenant_owner nur in Migrations-Historie + MIG-131.
- AC-187-2 [MT-3, Pure-Mock]: role-check-Matrix-Tests decken das 4-Rollen-Modell (tenant_member-Zeilen entfernt, keine false-allows).
- AC-187-3 [MT-2, Review]: MIG-131 deckt alle 18 U.2-Policies + CHECK + Trigger + Safety-UPDATE, idempotent.
- AC-187-4 [MT-4, Suite]: Full-Vitest Baseline-Delta 0 Regression; next build EXIT 0.
- AC-187-5 [/deploy, Live]: Pre-Apply-Live-Audit (pg_dump-Snapshot + pg_policies-Diff) → Apply → Live-Verify: CHECK 4 Werte, 0 Policies mit toten Literalen, Login-Smoke aller LIVE VORHANDENEN Rollen (Stand 2026-07-06: strategaize_admin, tenant_admin, employee — kein partner_admin-Testuser live; partner-Pfad code-verified).

## Cross-Slice-Dependencies

- Blockiert-von: SLC-186 (kumulativer Branch; Reihenfolge-Rationale Addendum U.7).
- MIG-131-Live-Apply + AC-187-5 = /deploy-Phase (MT-Xa/Xb-Split per Planungs-Heuristik).
- Nachgelagert: P2 (SLC-18x strategaize_berater) setzt auf dem bereinigten 4-Rollen-CHECK auf — MIG-131 muss VOR der P2-Rollen-Migration live sein.
