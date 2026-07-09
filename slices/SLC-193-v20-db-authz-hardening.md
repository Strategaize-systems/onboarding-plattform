# SLC-193 — V20 DB/Authz-Hardening

- Feature: FEAT-110 (BL-537)
- Status: planned
- Priority: Blocker
- Delivery Mode: SaaS → Worktree-Isolation Pflicht, kumulativer Branch `v20-security-hardening`
- Architektur: PRD §V20, ARCHITECTURE §X, DEC-279 / DEC-280 / DEC-283 / DEC-286 + profiles.role-Port
- Migrationen: **MIG-133** (Authz-Bundle) + **MIG-134** (search_path-Sweep). File-Nummern erst beim /backend-MT-Start per `ls sql/migrations/` vergeben (aktuell frei: 133_, 134_).

## Goal
Alle DB-/Authz-Findings der Security-Audit schliessen: tier-INSERT-Bypass (ISSUE-125), evidence-IDOR (ISSUE-124), berater-RPC Caller-Param-Trust (ISSUE-129), SECURITY-DEFINER search_path-Sweep (SEC-001), profiles.role-Defense-in-Depth-Port. Grundlage-Slice der V20-Sequenz.

## In Scope
tier-Guard INSERT+UPDATE + DEFAULT-Senken; evidence/list + download Ownership-Check; berater-RPC COALESCE-Härtung; search_path-Sweep; profiles.role-Guard-Trigger-Port.

## Out of Scope
XSS/Headers (SLC-194), Auth/Secrets-Cleanup (SLC-195). LLM-Cost-Cap (deferred). Berater-Evidence-Zugriff (kein berater-Branch — separates Feature).

## Verified-Against-Code-Reality (diese Session gegroundet, /architecture §X.2)
| Pfad | Status | Befund |
|---|---|---|
| `sql/migrations/121_v975_tier_gating_foundation.sql:172-192` | Quelle | Guard BEFORE UPDATE only; `NEW.tier IS DISTINCT FROM OLD.tier AND current_user<>'service_role'` |
| `sql/migrations/121:54-56` | Quelle | `tier text NOT NULL DEFAULT 'handbook' CHECK (tier IN ('free','blueprint','handbook'))` |
| `src/app/api/capture/[sessionId]/evidence/list/route.ts` | MODIFY | createAdminClient, KEIN tenant-Check |
| `src/app/api/capture/[sessionId]/evidence/upload/route.ts:54-78` | Referenz | kanonischer Ownership-Check (spiegeln) |
| `src/app/api/capture/[sessionId]/evidence/[fileId]/download/route.ts` | MODIFY | admin-Read ohne expliziten tenant-Match (unvollständig) |
| `sql/migrations/132_v104_berater_foundation.sql:129-176` | Quelle | `berater_assigned_tenant_ids(p_uid uuid)` DEFINER + GRANT authenticated |
| `src/app/dashboard/bulk-email-import/actions.ts:130`, `src/app/dashboard/diagnose/actions.ts:164`, `src/lib/db/capture-session-queries.ts:73`, `src/app/actions/walkthrough.ts:136` | MODIFY? | 4 tier-Insert-Sites; kein Prod-Insert setzt elevated tier (Client-Typ = MT-0) |
| `sql/migrations/133_v20_authz_hardening.sql`, `sql/migrations/134_v20_search_path_sweep.sql` | NEU | dürfen nicht existieren (bestätigt: 132 latest) |
| profiles.role-Trigger | NEU | in OP NICHT vorhanden (nur BS-Referenz) → Port |

## Schema-Grounding
- `capture_session.tier` verbatim: `text NOT NULL DEFAULT 'handbook' CHECK (tier IN ('free','blueprint','handbook'))` (121:54-56). Ziel: DEFAULT→`'free'`, CHECK unverändert.
- Guard-Function `public.capture_session_tier_change_guard()` (121:172-185), Trigger (121:187-192). Ziel: Body um INSERT-Zweig, Trigger auf `BEFORE INSERT OR UPDATE`.
- `berater_assigned_tenant_ids(p_uid uuid)` RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public (132:129-151); GRANT authenticated,service_role (132:175-176). CHECK-/FK-/Enum-frei.
- SEC-001-Umfang: `pg_proc WHERE prosecdef AND proconfig ohne search_path` → Live-Sweep in MT-0 (~31, Heuristik). Trigger-Funcs bereits ok.

## Symbol-/API-Verifikation
- `capture_session_tier_change_guard` (Trigger + Function, 121). `berater_assigned_tenant_ids` (132). `auth.uid()` (Supabase-GUC, unter service_role NULL — verifiziert via Consumer-Grounding: `workspace-scope.ts:72` admin.rpc).
- evidence-Ownership-Muster verbatim aus `upload/route.ts:54-78` (`profile.role !== "strategaize_admin" && session.tenant_id !== profile.tenant_id` → 403).

## Test-Infra-Klassifikation (vitest node-env, kein jsdom — vitest.config.ts:6)
- **Coolify-DB-Vitest** (node:20-Sidecar + SAVEPOINT, `coolify-test-setup.md`, TEST_DATABASE_URL-gated): tier-Guard-In-Tx-Probe, evidence-RLS-Isolation, berater-RPC-COALESCE, search_path-Rest-Count. Pfad `src/__tests__/rls/*.test.ts`.
- **Pure-Mock-Vitest**: evidence-Route-Ownership-Branch (Mock-Client), sofern ohne DB testbar.
- **Live-Smoke** (/deploy): MIG-133/134 Live-Apply + DB-Verify.

## Reuse-Claim-Verifikation
- **P-080 / IMP-1717** profiles.role-INSERT-Coverage-Muster (BS V8.14 SLC-912) — `current_user<>'service_role'`-Pattern real in 121:172-185 vorhanden; als Vorlage für den INSERT-Zweig + profiles.role-Port. Quell-Header Pflicht.
- **evidence upload-Route** als lokale Reuse-Vorlage (upload/route.ts:54-78).

## Micro-Tasks

### MT-0: Grounding-Spike (read-only + Live-DB) — BLOCKING
- Goal: tier-Insert-Client-Typ + entitled-tier-Set-Ort bestimmen; SEC-001-Funktionsliste live erzeugen.
- Files: keine (read-only). Output = Scope-Finalisierung MT-2 + MT-4.
- Expected: (a) Für die 4 Insert-Sites Client-Typ (createAdminClient/service_role vs authenticated) + ob/wo tier gesetzt wird feststellen → entscheidet, ob MT-2 nötig ist und wo der entitled tier via service_role gesetzt wird. (b) `SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')` → Funktionsliste für MIG-134. (c) Live tier-DEFAULT + Guard-Def bestätigen (`\d capture_session`, `\df+ capture_session_tier_change_guard`).
- Verification: Insert-Site-Tabelle (Client-Typ je Site) + SEC-001-Funktionsliste dokumentiert; tier-DEFAULT live = 'handbook' bestätigt.
- Dependencies: none.

### MT-1: MIG-133 tier-Guard INSERT+UPDATE + DEFAULT + berater-RPC + profiles.role-Port [backend]
- Goal: Ein idempotentes Authz-Migrations-File.
- Files: `sql/migrations/133_v20_authz_hardening.sql` (NEU), `src/__tests__/rls/tier-guard-insert.test.ts` (NEU, Coolify-DB), `src/__tests__/rls/berater-rpc-coalesce.test.ts` (NEU, Coolify-DB).
- Expected: (1) CREATE OR REPLACE `capture_session_tier_change_guard()` (bleibt `LANGUAGE plpgsql`, **SECURITY INVOKER** — NICHT DEFINER, sonst bricht `current_user`; verifiziert 121:172-185): INSERT-Zweig `IF TG_OP='INSERT' AND current_user<>'service_role' THEN NEW.tier:='free'`; UPDATE-Zweig unverändert (deny tier-Change non-service_role). (2) DROP TRIGGER + CREATE TRIGGER `BEFORE INSERT OR UPDATE`. (3) `ALTER TABLE capture_session ALTER COLUMN tier SET DEFAULT 'free'`. (4) CREATE OR REPLACE `berater_assigned_tenant_ids(uuid)` — **Plan-QA-Korrektur (RPT-637): die Funktion ist `LANGUAGE sql STABLE SECURITY DEFINER` (132:129-151), KEINE plpgsql-Variable möglich → COALESCE INLINE in BEIDE WHERE-Klauseln** (`WHERE bta.berater_user_id = COALESCE(auth.uid(), p_uid)`), LANGUAGE/STABLE/DEFINER/SET-search_path unverändert. (5) profiles.role-Guard-Trigger BEFORE INSERT OR UPDATE (LANGUAGE plpgsql SECURITY INVOKER, current_user-aware, Defense-in-Depth). Quell-Header-Kommentar (121/132 + P-080).
- **Consumer-Enumeration berater-RPC (Plan-QA-Ergänzung, grounding-gate check 3):** 4 Consumer, alle übergeben die eigene/aktuelle uid → COALESCE-safe: `workspace-scope.ts:53` (user-Client), `:72` (admin), `exit-report/route.ts:57` (admin), **`can_see_tenant(uuid)` (132, ruft intern `berater_assigned_tenant_ids(auth.uid())`, SECURITY DEFINER, P4-RLS-latent)**. RPC hat bereits `REVOKE ALL FROM PUBLIC, anon` (132) → Exposure nur `authenticated`; COALESCE schliesst den authenticated-fremd-p_uid-IDOR.
- Hinweis: postgres-Superuser-INSERT würde durch den INSERT-Coerce ebenfalls auf 'free' gesetzt (Wartung via `SET ROLE service_role`) — akzeptiert, konsistent mit dem 121-Kommentarblock.
- Verification: In-Tx-Probe (Coolify-DB): tenant_admin-INSERT tier='handbook' → gespeichert 'free'; service_role-INSERT tier='handbook' → 'handbook'; UPDATE tier durch tenant_admin → EXCEPTION; berater-RPC via authenticated mit fremdem p_uid → nur eigene Tenants; via service_role mit p_uid → wie bisher. Migration idempotent (2× apply).
- Dependencies: MT-0.

### MT-2: App-Insert-Sites entitled tier explizit setzen [backend] — konditional auf MT-0
- Goal: DEFAULT-Senken darf legit Sessions nicht auf 'free' stranden.
- Files: (nach MT-0) `src/app/dashboard/bulk-email-import/actions.ts`, `src/app/dashboard/diagnose/actions.ts`, `src/lib/db/capture-session-queries.ts`, `src/app/actions/walkthrough.ts` (MODIFY, soweit MT-0 zeigt, dass sie den entitled tier nicht bereits explizit via service_role setzen).
- Expected: Jede legit Session-Creation setzt den entitled tier explizit (service_role-Pfad), sodass nach dem DEFAULT-Senken kein Feature ungewollt gatet. Falls MT-0 zeigt, dass alle via service_role laufen UND der Founder-Test-Flow mit 'free' korrekt gated → No-Op + Begründung im Report.
- Verification: App-Session-Creation-Flow grün (SC-V20-2); Founder-Test-Session erreicht erwarteten tier.
- Dependencies: MT-0, MT-1.

### MT-3: evidence/list + download Ownership-Check [backend]
- Goal: Cross-Tenant-IDOR schliessen, alle 3 evidence-Routes konsistent.
- Files: `src/app/api/capture/[sessionId]/evidence/list/route.ts` (MODIFY), `src/app/api/capture/[sessionId]/evidence/[fileId]/download/route.ts` (MODIFY), `src/app/api/capture/[sessionId]/evidence/list/route.test.ts` (NEU, Pure-Mock).
- Expected: Beide Routes laden `capture_session` (id,tenant_id) und wenden den upload-Muster-Check an (404 bei fehlend, 403 wenn `role!=='strategaize_admin' && session.tenant_id!==profile.tenant_id`) VOR dem admin-Read. createAdminClient bleibt.
- Verification: Pure-Mock-Test: fremd-tenant → 403, eigen → 200, admin → 200; download analog. Diff-Konsistenz mit upload-Route.
- Dependencies: none (parallel zu MT-1 möglich, aber im selben Branch nach MT-1).

### MT-4: MIG-134 search_path-Sweep [backend]
- Goal: Alle DEFINER-Funcs mit SET search_path.
- Files: `sql/migrations/134_v20_search_path_sweep.sql` (NEU), `src/__tests__/rls/search-path-sweep.test.ts` (NEU, Coolify-DB).
- Expected: `ALTER FUNCTION public.<name>(<args>) SET search_path = public, pg_catalog;` je Funktion aus MT-0-Liste. Body unberührt, idempotent. **Plan-QA-Option (RPT-637, empfohlen):** statt statisch generierter ALTER-Liste ein dynamischer `DO`-Block, der über `pg_proc WHERE prosecdef AND kein search_path` loopt und `EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_catalog', p.oid::regprocedure)` ausführt — robust gegen Drift zwischen MT-0-Sweep-Zeitpunkt und Apply-Zeitpunkt (fängt jede zwischenzeitlich hinzugekommene DEFINER-Funktion). MT-0-Liste dient dann als Erwartungswert für das Rest-Count-0-Gate.
- Verification: Coolify-DB Rest-Count-Query = 0 nach Apply (SC-V20-3); Migration 2× idempotent.
- Dependencies: MT-0.

## Cross-Slice-Dependencies
- **blockiert:** SLC-194, SLC-195 (kumulativer Branch, Foundation zuerst).
- **blockiert-von:** keine (erster V20-Slice, off aktuellem main).
- **Produced:** Branch `v20-security-hardening`, MIG-133 + MIG-134 (beide im selben Slice — MIG-Kollision intern vermeiden: 133 vor 134 anlegen).
- **Reihenfolge:** MT-0 → (MT-1, MT-4 brauchen MT-0-Output) → MT-2 (nach MT-1) → MT-3 unabhängig. Migrationen bleiben Code-Side; Live-Apply erst /deploy.

## Acceptance Criteria
- AC-193-1 [backend/Coolify-DB]: tier-Guard feuert auf INSERT (coerce→'free' non-service_role) UND UPDATE (deny); service_role-Path unverändert (SC-V20-2).
- AC-193-2 [backend]: DEFAULT `tier`='free' live; App-Session-Creation grün (MT-2).
- AC-193-3 [backend/Pure-Mock]: evidence/list + download → 403 cross-tenant, konsistent mit upload.
- AC-193-4 [backend/Coolify-DB]: berater-RPC via authenticated kann nur eigene Tenants auflösen; admin-Pfad unverändert.
- AC-193-5 [backend/Coolify-DB]: SEC-001 Rest-Count 0 (SC-V20-3).
- AC-193-6 [backend]: profiles.role-Guard-Trigger vorhanden (INSERT+UPDATE, Defense-in-Depth).
- AC-193-7: tsc 0 / eslint 0 / next build PASS / Vitest 0 Regression + neue Tests grün; MIG-133/134 idempotent.
