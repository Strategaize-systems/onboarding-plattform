# SLC-189 — Admin: Berater anlegen + Tenants zuweisen

- Feature: FEAT-106
- Backlog: BL-534
- Version: V10.4 (Rollenmodell V2 Paket P2)
- Status: planned
- Track: backend (Actions/RPC) + schmales Admin-UI
- Branch: `v10-4-rollenmodell-p2` (kumulativ, nach SLC-188)
- Migration: keine (Schema steht aus SLC-188/MIG-132)

## Goal
`strategaize_admin` kann einen `strategaize_berater`-Account anlegen (Invite ohne tenant_id) und Berater ↔ Kanzleien/Direkt-Kunden-Tenants zuweisen/entfernen. Nur Admin. Keine Berater-Sicht (SLC-190).

## Architektur-Bindung
PRD §V10.4 FEAT-106 · Addendum V.5 (Datenfluss Anlage+Zuweisung) · DEC-267 (Tabelle) · DEC-268 (Zuweisung auf Kanzlei-/Direkt-Tenant). Port-Vorlage BS `inviteUserAndCreateProfile` (`cockpit/src/lib/auth/invite.ts:32-101`) + OP-Invite-Route.

## Verified-Against-Code-Reality (Gate 1+3)
| Referenz | Status | Befund |
|---|---|---|
| `src/app/api/admin/tenants/[tenantId]/invite/route.ts:11` `requireAdmin()` | Reuse-Vorlage | Gate-Muster; `auth.errorResponse` 403 |
| `…invite/route.ts:87-98` `adminClient!.auth.admin.generateLink({type:"invite", …data:{tenant_id, role, allowed_blocks?}})` | Port-Quelle | **Berater-Variante: OHNE `tenant_id` in `data`**, `role:"strategaize_berater"` |
| `src/lib/api-utils.ts:87` `requireAdmin` (403 bei ≠ strategaize_admin) | Reuse | für neue Route/Action |
| `src/lib/workspace/admin-gate.ts:20-36` `assertStrategaizeAdmin` | Reuse | für Server-Actions |
| `src/app/admin/berater/**` | NEU | existiert nicht (0 Kollision) |
| `berater_tenant_assignments` | Schema-Pre-Cond | aus SLC-188/MIG-132 |
| `src/components/admin-sidebar.tsx:9-20` NAV_ITEMS | MODIFY (optional) | Admin-Nav-Eintrag „Berater" ergänzen |

## Schema-Grounding (Gate 2)
- INSERT/DELETE auf `berater_tenant_assignments(berater_user_id, tenant_id, assigned_by)` — Spalten aus SLC-188 Addendum V.4. `assigned_by = auth.uid()` (Admin).
- Zuweisbare Tenants = alle `tenants` (Kanzlei/Direkt); Mandanten-Zeilen NICHT einzeln (Cascade DEC-268).
- Berater-Anlage schreibt KEINE Zeile in `berater_tenant_assignments` (Zuweisung ist separater Schritt).

## Micro-Tasks

### MT-1: Berater-Anlage-Action (Invite ohne tenant_id)
- Goal: Admin legt Berater per Invite-Mail an.
- Files: `src/app/admin/berater/actions.ts` (NEU: `createBerater(email: string)`)
- Expected behavior: `assertStrategaizeAdmin()` (sonst unauthorized) → `createAdminClient().auth.admin.generateLink({type:"invite", email, options:{ data:{ role:"strategaize_berater" }, redirectTo }})` — **kein tenant_id** → `handle_new_user` (SLC-188) legt Profile ohne tenant_id an → Invite-Mail via SMTP-Adapter (Reuse). Header-Kommentar mit Port-Quelle (invite/route.ts + BS invite.ts).
- Verification: Pure-Mock-Vitest: gemockter admin-client, assert generateLink-Args enthalten role, KEIN tenant_id; Nicht-Admin → unauthorized.
- Dependencies: SLC-188 (handle_new_user berater-Zweig).

### MT-2: Zuweisungs-Actions (set/unset)
- Goal: Zuweisung setzen/entfernen.
- Files: `src/app/admin/berater/actions.ts` (MODIFY: `assignBerater(beraterUserId, tenantId)`, `unassignBerater(beraterUserId, tenantId)`), optional RPC `sql/…` — **kein neues SQL** falls direkter Admin-Client-Write genügt (Tabelle hat Admin-RLS; über service_role/createAdminClient INSERT/DELETE). Entscheidung: direkter `createAdminClient().from("berater_tenant_assignments").insert/delete` nach Admin-Gate (kein RPC nötig — 1 Statement, atomar).
- Expected behavior: `assertStrategaizeAdmin()` → INSERT `{berater_user_id, tenant_id, assigned_by:user.id}` (idempotent: onConflict PK ignore) / DELETE per PK. Nicht-Admin → unauthorized.
- Verification: Pure-Mock-Vitest (Args + Gate) + Coolify-DB-Vitest optional (INSERT/DELETE + PK-Konflikt No-Op).
- Dependencies: SLC-188 (Tabelle).

### MT-3: Admin-UI `/admin/berater`
- Goal: Verwaltungs-Seite.
- Files: `src/app/admin/berater/page.tsx` (NEU), `src/app/admin/berater/BeraterAdmin.tsx` (NEU, Client-Component: Berater-Liste + „Berater anlegen"-Form + pro Berater Tenant-Zuweisungs-Multiselect set/unset), `src/components/admin-sidebar.tsx` (MODIFY: NAV_ITEM „Berater", z. B. Icon `UserCog`).
- Expected behavior: Page `assertStrategaizeAdmin`-re-gate (redirect sonst) → lädt Berater (`profiles` role=strategaize_berater) + Tenants + bestehende Assignments → UI ruft Actions MT-1/MT-2. Nur strategaize_admin sichtbar (Berater-Zugriff = 403/redirect, kommt in SLC-190-Gate; hier admin-only).
- Verification: `next build` PASS (Route im Manifest); statisch. Browser-Smoke = /deploy-Phase.
- Dependencies: MT-1, MT-2.

### MT-4: Action-Tests + Gate-Regression
- Goal: SC-V10.4-4 absichern.
- Files: `src/app/admin/berater/actions.test.ts` (NEU)
- Expected behavior: createBerater/assign/unassign — Admin ok, Nicht-Admin (tenant_admin/berater/anon) → unauthorized/403; generateLink ohne tenant_id; assign idempotent.
- Verification: Pure-Mock-Vitest grün; tsc 0 / eslint 0.
- Test-AC-Klasse: **Pure-Mock-Vitest** (Actions) + optional Coolify-DB (INSERT/DELETE).
- Dependencies: MT-1..3.

## Cross-Slice-Dependencies
- **blockiert von:** SLC-188 (role-CHECK, handle_new_user, Tabelle).
- **blockiert:** SLC-190 (liefert den Admin-Pfad, über den Assignments real entstehen — SLC-190 kann aber mit Fixture-Assignments testen, daher weiche Kopplung).
- **Consumed:** `berater_tenant_assignments` (SLC-188), `assertStrategaizeAdmin` (Bestand), Invite-Route-Muster, SMTP-Adapter.
- **Produced:** `createBerater`/`assignBerater`/`unassignBerater`, `/admin/berater`.

## Risiken
- R-189-1: Invite-Redirect/Set-Password-Kette für tenant-lose Rolle. Mitigation: Reuse bestehende `/auth/callback` (type=invite) + set-password (SLC-186); Live-E2E im /deploy.
- R-189-2: generateLink setzt versehentlich tenant_id (Copy-Paste aus Vorlage). Mitigation: MT-4 assert-Test „kein tenant_id".

## Verification Summary (Done-Gate SLC-189)
tsc 0 / eslint 0 / Pure-Mock-Vitest grün / `next build` PASS. Live-Anlage+Zuweisung-Smoke = /deploy.
