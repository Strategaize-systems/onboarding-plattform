# SLC-164 — V8.1.1 Hotfix: Partner-Resolution via Tenant-Chain (ISSUE-086 + verdeckter Bug B)

**Version:** V8.1.1
**Feature:** FEAT-068 (Strategaize-Freigabe-CTA + Dual-Email-Trigger) — Hotfix-Korrektur
**Backlog:** BL-145
**Status:** in_progress
**Created:** 2026-06-01
**Priority:** Blocker
**Estimate:** ~30-45min Code-Side + Live-Smoke + Master-Merge + Coolify-Redeploy
**Worktree Branch:** `slc-164-hotfix-partner-resolution`

## Slice Goal

V8.1 SLC-163 CTA-Mechanik schreibt aktuell `partner_organization` nicht erfolgreich auf — zwei verbundene Schema-Bugs:

- **Bug A (ISSUE-086)** — `capture_session.partner_organization_id` existiert nicht. Schema-Wahrheit: `capture_session.tenant_id → tenants.parent_partner_tenant_id → partner_organization.tenant_id`.
- **Bug B (verdeckt durch A)** — `partner_organization.name` existiert nicht. Schema kennt nur `legal_name` + `display_name`.

Sobald Bug A weg ist, faellt der Code in Bug B. Beide werden gemeinsam korrigiert via Helper-Extraktion + 4 Call-Site-Refactorings.

## In Scope

### Neuer Helper (Pure async function)
- **`src/lib/cta/resolve-partner.ts`** (NEU) — `resolvePartnerForCaptureSession(admin, captureSession)` → `{ id, name, contact_email } | null`
  - Input: `SupabaseClient`, `{ tenant_id: string }` (aus `capture_session`)
  - Lookup-1: `tenants.parent_partner_tenant_id` via `tenant_id` (1 RT)
  - Lookup-2: `partner_organization.{id, display_name, contact_email}` via `parent_partner_tenant_id` (1 RT)
  - `name` im Return = `partner_organization.display_name` (Bug B Fix)
  - Returns `null` wenn entweder tenant-row nicht existiert ODER `parent_partner_tenant_id IS NULL` (direct_client-Mandant ohne Partner) ODER partner-row nicht gefunden
- **`src/lib/cta/__tests__/resolve-partner.test.ts`** (NEU) — Vitest
  - Mock-Tests fuer happy-path (tenant mit parent_partner_tenant_id → partner-row mit display_name)
  - Mock-Tests fuer null-Returns: tenant nicht gefunden, kein parent_partner_tenant_id, partner-row nicht gefunden
  - Live-DB-Test (TEST_DATABASE_URL-gated) gegen Coolify-Schema fuer das End-to-End-Pattern

### Call-Site Refactoring (4 Stellen)
- **`src/app/strategaize-anfrage/route.ts`** (UPDATE) — SLC-163 MT-7 PDF-Magic-Link-Endpoint
  - Lines 103-122: `session.select("...partner_organization_id...")` ersetzen durch `tenant_id`-Select + `resolvePartnerForCaptureSession`-Call
  - Token-Payload `partner_organization_id`-Fallback bleibt erhalten fuer Logging-Audit, ist aber nur noch Fallback-Display-Wert (nicht mehr authoritative Source)
- **`src/app/dashboard/diagnose/[capture_session_id]/bericht/actions.ts`** (UPDATE) — 3 Call-Sites
  - **`triggerStrategaizeFreigabe`** (Lines 678-731) — Web-Action MT-9: `session.select("...partner_organization_id...")` + `.from("partner_organization").select("id, name, ...")`-Pattern durch Helper-Call ersetzen
  - **`sendDiagnoseReportByEmail`** Lines 324-337 — PDF-Magic-Link-Embedding: `magicLinkConfig.partnerOrganizationId` aus Helper-Call statt aus capture_session-Spalte
  - **`downloadMandantenReportV2Pdf`** Lines 592-607 — PDF-Magic-Link-Embedding: gleiche Korrektur

### Records-Update
- **`docs/KNOWN_ISSUES.md`** — ISSUE-086 → `Status: resolved` + Resolution-Note, Bug B als zweite Resolution-Note unter selbem Issue
- **`docs/RELEASES.md`** — REL-028 V8.1.1 Hotfix-Entry
- **`docs/STATE.md`** — Current Focus auf V8.1.1 RELEASED post-Live-Smoke
- **`docs/SKILL_IMPROVEMENTS.md`** — IMP fuer "Slice-Spec muss explizit auf vorhandene Helper-Patterns im selben File verweisen" (V7.2-Pattern war im selben File schon korrekt, wurde in V8.1 nicht wiederverwendet)
- **`slices/INDEX.md`** — V8.1.1-Section + SLC-164 Entry
- **`features/INDEX.md`** — FEAT-068 bleibt deployed (Hotfix korrigiert kein neues Feature)
- **`planning/backlog.json`** — BL-145 V8.1.1 Hotfix done

## Out of Scope

- Founder-Text-Tausch ISSUE-084/085 — separate User-Pflicht
- V8.1 STABLE-Bestaetigung — separater /post-launch nach Burn-In
- Sonstige V8.1-Polish-Items (existieren aktuell keine)

## Micro-Task Decomposition

| MT | Aufgabe | Aufwand |
|----|---------|---------|
| MT-1 | Vitest-Tests fuer `resolvePartnerForCaptureSession` schreiben (RED) | ~10min |
| MT-2 | Helper-File `src/lib/cta/resolve-partner.ts` implementieren (GREEN) | ~10min |
| MT-3 | 4 Call-Sites umstellen (route.ts + 3× actions.ts) | ~15min |
| MT-4 | tsc + ESLint + Vitest-Suite gruen + Records-Update + Master-Merge | ~10-15min |

## Acceptance Criteria

| ID | Acceptance | Verifikation |
|----|------------|--------------|
| AC-SLC-164-1 | Helper `resolvePartnerForCaptureSession` existiert mit Tenant-Chain-Lookup | Code-Audit + Vitest-Roundtrip |
| AC-SLC-164-2 | Alle 4 Call-Sites nutzen Helper statt direkt `capture_session.partner_organization_id` | grep -r `partner_organization_id` in CTA-Bereichen = 0 (ausser audit-payload + token-payload-Logging) |
| AC-SLC-164-3 | tsc + ESLint EXIT=0 | `npm run typecheck` + `npm run lint` |
| AC-SLC-164-4 | Vitest-Suite resolve-partner.test.ts gruen (Mock + Live-DB-gated) | `npm run test -- resolve-partner` |
| AC-SLC-164-5 | Vitest-Suite CTA-Bundle weiterhin gruen (audit + token + email/v8-1 + bericht/actions) | `npm run test -- src/lib/cta src/lib/email/v8-1` |
| AC-SLC-164-6 | ISSUE-086 → resolved in KNOWN_ISSUES.md mit Resolution-Note auch fuer Bug B | Datei-Diff |
| AC-SLC-164-7 | Master-Merge + Coolify-Redeploy + Live-Smoke 0 cta_invalid_token + 0 PostgrestError im error_log | SSH-error_log-scan post-deploy |

## Pre-Conditions

- V8.1 RELEASED (REL-027 main HEAD `1e2a68d`) ✅
- Schema gegen Coolify-DB verifiziert: `capture_session.partner_organization_id` existiert nicht, `partner_organization.name` existiert nicht ✅
- Worktree `slc-164-hotfix-partner-resolution` aufgesetzt ✅

## Risks

- **R1** — Test-Coverage. Helper wird in 4 Call-Sites genutzt; muss in jedem Branch funktional sein. Mitigation: Mock-Tests + Live-DB-gated Roundtrip-Test.
- **R2** — Live-Smoke ohne echte capture_session-Row schwierig zu testen. Mitigation: post-deploy ein synthetisches capture_session-Insert via psql mit tenant_kind='partner_client' + parent_partner_tenant_id; ein zweites Insert ohne parent (direct_client) fuer null-Return-Pfad.

## Related

- ISSUE-086 (Bug A) — primaerer Grund
- Bug B (silent durch A) — `partner_organization.name` existiert nicht
- V7.2 `src/app/dashboard/diagnose/[capture_session_id]/bericht/actions.ts:158-167` — existierendes Tenant-Chain-Pattern im selben File
- feedback `db_schema_verify_before_code_write.md` (IMP-928) — Schema-Verify-Pflicht etabliert
- feedback `strategaize-pattern-reuse.md` — Pattern-Reuse innerhalb selber Datei haette das verhindert
