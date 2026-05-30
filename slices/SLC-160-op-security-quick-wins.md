# SLC-160 — OP Security Quick-Wins

- **Version**: V20 (Security Sprint 1 — am Ende des Baus per Founder-Direktive 2026-05-30, vormals als V8.0.1 / "Pre-Live-Pflicht" gefuehrt)
- **Feature**: FEAT-160 / BL-141 (war BL-128, 2026-05-30 renamed wegen Duplikat-Kollision mit V8-Mandanten-Report-BL-128)
- **Created**: 2026-05-30
- **Status**: planned
- **Branch**: `slc-160-security-quick-wins-op` (Worktree empfohlen — OP = SaaS-Mode, Worktree-Isolation per SaaS-Mode-Pflicht. Worktree-Pfad: `c:/strategaize/strategaize-onboarding-plattform-slc160`)
- **Aufwand**: M (2-3h Code + ~1h /qa + Coolify-Redeploy)

## Purpose

Schliesst die 3 hoechst-priorisierten Security-Findings aus dem Cross-Repo-Audit 2026-05-30 (`docs/SECURITY_AUDIT_2026-05-30.md`):

- **SEC-001** (High, DSGVO, search_path-Hijack): 12 SECURITY DEFINER Funktionen in `sql/migrations/047_rpc_orchestrator_and_gaps.sql`, `054_rpc_evidence.sql`, `062_rpc_dialogue.sql` ohne `SET search_path`. Postgres-Footgun unter Service-Role-Privilegien. Restmigrationen folgen dem Pattern korrekt — dies sind Inkonsistenz-Drifts gegen das eigene Pattern aus V4+/V6+.
- **SEC-002** (High, Timing-Side-Channel): 4 Endpoints vergleichen CRON_SECRET/RECORDING_WEBHOOK_SECRET mit nativem `!==`. Helper `crypto.timingSafeEqual` existiert bereits in `src/lib/auth/service-key.ts` aus V7 Self-Signup-Flow, wird aber von den 4 Endpoints nicht genutzt.
- **SEC-004** (High, Stored-XSS): partner-branding-Bucket erlaubt `image/svg+xml`. Quickest-Fix: SVG aus `allowed_mime_types` entfernen. PNG/JPG/WEBP reichen real fuer Partner-Logos.

## Out-of-Scope

- OP SEC-003 (Recording-Webhook Path-Traversal `/proc/self/environ`) → eigener Slice Sprint 2 weil M-Aufwand + per Middleware-Redirect aktuell extern unerreichbar (ISSUE-028). Pre-Aktivierungs-Pflicht-Fix, aber nicht Sprint 1.
- OP SEC-005..SEC-019 → Sprint 2-4 oder V8.1+.
- Spec-Reuse fuer SEC-001-Pattern (CI-Check via `pg_proc.proconfig`) → optional V21 Hygiene-Slice.

## Pre-Conditions

- V7.7 STABLE (RPT-347 Live-Smoke PASS 2026-05-28, Burn-In bis 2026-05-29 ~16:30 UTC abgeschlossen)
- V8 SLC-148 MT-0 done — der Worktree `c:/strategaize/strategaize-onboarding-plattform-v8` (Branch `v8-mandanten-report`) bleibt unangefasst. SLC-160 laeuft in eigenem Worktree
- Coolify-DB erreichbar fuer Vitest gegen Postgres-Container im OP-Coolify-Netzwerk per `.claude/rules/coolify-test-setup.md`
- Strategaize-Pattern-Reuse-Rule anwenden (`crypto.timingSafeEqual` aus service-key.ts; `SET search_path` aus V4+/V6+-Migrations)

## Acceptance Criteria

- **AC-1 (SEC-001)**: Idempotente Patch-Migration `sql/migrations/103_v801_search_path_hardening.sql` (oder naechste freie Nummer — siehe Pre-Check unten) `CREATE OR REPLACE FUNCTION` jede der 12 betroffenen SECURITY DEFINER Funktionen mit `SET search_path = public, pg_catalog` an der Funktions-Definition. Body bleibt 1:1 wie in den Quell-Migrations 047/054/062.
- **AC-2 (SEC-001 Verifikation)**: Vitest-Case `pg_proc.proconfig` enthaelt `search_path=public,pg_catalog` fuer alle 12 Funktionen (`rpc_orchestrator_finalize_run`, `rpc_create_evidence_chunks`, `rpc_confirm_evidence_mapping`, `rpc_reject_evidence_mapping`, `rpc_update_evidence_file_status`, `rpc_create_dialogue_session`, `rpc_attach_dialogue_recording`, + 5 weitere — exakte Liste in MT-1).
- **AC-3 (SEC-002)**: Neuer Helper `src/lib/auth/cron-secret.ts` mit Signatur `verifyCronSecret(receivedHeader: string | null, envSecret: string | undefined): boolean`. Logik: null-checks → false; length-mismatch → false (constant-time-safe per Buffer-Compare); sonst `crypto.timingSafeEqual(Buffer.from(receivedHeader), Buffer.from(envSecret))`.
- **AC-4 (SEC-002 Caller)**: 4 Endpoints `src/app/api/cron/capture-reminders/route.ts`, `src/app/api/cron/pending-signup-cleanup/route.ts`, `src/app/api/cron/walkthrough-cleanup/route.ts`, `src/app/api/dialogue/recording-ready/route.ts` nutzen den neuen Helper. Wire-Format-Change `=null`. ENV-Variable-Namen unveraendert.
- **AC-5 (SEC-004)**: Idempotente Patch-Migration `sql/migrations/104_v801_partner_branding_no_svg.sql`. `UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'] WHERE id = 'partner-branding-assets';` Plus Vitest-Case: alter Upload-Pfad mit `file.type='image/svg+xml'` → HTTP 415 oder Storage-Reject.
- **AC-6 (Vitest)**: 4 neue Cases:
  - search-path-pruefung (1 Test mit `SELECT proconfig FROM pg_proc WHERE proname = ANY($1)` → alle 12 Funktionen haben `search_path=public,pg_catalog`)
  - cron-secret timing-safe (1 positive + 1 negative)
  - partner-branding allowed_mime_types (1 Test `SELECT allowed_mime_types FROM storage.buckets WHERE id = 'partner-branding-assets'`)
- **AC-7 (Quality-Gates)**: `npx tsc --noEmit` EXIT=0. `npm run lint` 0/0 (OP-Baseline). `npm run build` PASS.
- **AC-8 (Live-Smoke)**: Post-Deploy 4 Probes:
  1. `psql` (oder DB-Tunnel) `SELECT proname, proconfig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'rpc_%' AND prosecdef = true;` → alle Rows haben proconfig mit `search_path` gesetzt
  2. `curl -X POST https://onboarding.strategaizetransition.com/api/cron/capture-reminders -H "X-Cron-Secret: <falsches>"` → 401
  3. Coolify-Cron `capture-reminders-daily` Run beobachten in App-Logs → muss weiter erfolgreich laufen
  4. Existierende Partner-Logos (PNG) im partner-branding-Bucket laden → unveraendert sichtbar in `/login` mit Partner-Subdomain
- **AC-9 (Records)**: KNOWN_ISSUES.md ISSUE-026/040 unveraendert (separate Build-Time-Issues). RELEASES.md REL-026 nach Deploy. MIGRATIONS.md MIG-051 + MIG-052 (oder naechste freie Nummern).

## Micro-Tasks

### MT-1: Pre-Check + Migration-Nummern + Funktions-Liste
- **Goal**: Naechste freie SQL-Migration-Nummer ermitteln, alle 12 betroffenen SECURITY DEFINER Funktionen exakt listen mit Quell-Migrations-Datei + Original-Body.
- **Files**: keine Edits — nur `ls sql/migrations/` + `grep -l "SECURITY DEFINER" sql/migrations/047 054 062` + `grep -A 30 "CREATE.*FUNCTION" <files>`.
- **Expected behavior**: Output: Liste der 12 Funktionen mit (Name, Quell-Migration, Body-Start-Line, Body-End-Line). Naechste Migration-Nummer fuer MT-2 (vermutlich 103) und MT-3 (vermutlich 104).
- **Verification**: Liste enthaelt exakt 12 Eintraege. Audit-Report `docs/SECURITY_AUDIT_2026-05-30.md` SEC-001 spricht von 12 — Cross-Check.
- **Dependencies**: none. Dauert ~10 Min.

### MT-2: SEC-001 search_path-Hardening Migration
- **Goal**: Idempotente Patch-Migration die alle 12 Funktionen re-creates mit `SET search_path = public, pg_catalog`.
- **Files**: `sql/migrations/103_v801_search_path_hardening.sql` (NEU — Nummer aus MT-1 bestaetigen), `__tests__/security/sec-160-search-path-hardening.test.ts` (NEU).
- **Expected behavior**: Eine Migration-Datei mit 12 `CREATE OR REPLACE FUNCTION ... LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$ <body> $$;` Bloecken. Bodies identisch zu den Quell-Migrations 047/054/062 (keine Logic-Aenderung!). Header-Kommentar verweist auf SEC-001 + Quell-Migrations + Strategaize-Pattern aus 032/035/036/037/038.
- **Verification**: Lokale `psql -f` gegen Test-DB → success. Vitest gegen Coolify-DB nach Apply: `SELECT proname, proconfig FROM pg_proc WHERE proname = ANY(ARRAY[...12...])` → alle 12 enthalten `search_path=public,pg_catalog`. **Migration Apply auf Production**: per `.claude/rules/sql-migration-hetzner.md` base64-Pattern als `postgres`-User.
- **Dependencies**: MT-1.

### MT-3: SEC-004 partner-branding SVG-Block Migration
- **Goal**: Idempotente Patch-Migration die `allowed_mime_types` auf `['image/png', 'image/jpeg', 'image/webp']` setzt.
- **Files**: `sql/migrations/104_v801_partner_branding_no_svg.sql` (NEU — Nummer aus MT-1 bestaetigen), `__tests__/security/sec-160-partner-branding-mime.test.ts` (NEU).
- **Expected behavior**: `UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']::text[] WHERE id = 'partner-branding-assets';` Idempotent (`UPDATE` ohne `WHERE allowed_mime_types != ...` ist idempotent weil neuer Wert immer gleich). Header-Kommentar verweist auf SEC-004 + ISSUE-Quote.
- **Verification**: Vitest gegen Coolify-DB nach Apply: `SELECT allowed_mime_types FROM storage.buckets WHERE id = 'partner-branding-assets'` → `{image/png,image/jpeg,image/webp}`. Optional Server-Action-Test: alter MIME-Header `image/svg+xml` → Reject.
- **Dependencies**: MT-1.

### MT-4: SEC-002 cron-secret-Helper + Caller-Refactor
- **Goal**: Neuer Helper `src/lib/auth/cron-secret.ts` + 4 Endpoints umgestellt.
- **Files**:
  - `src/lib/auth/cron-secret.ts` (NEU)
  - `src/app/api/cron/capture-reminders/route.ts` (MODIFY Z. ~188)
  - `src/app/api/cron/pending-signup-cleanup/route.ts` (MODIFY)
  - `src/app/api/cron/walkthrough-cleanup/route.ts` (MODIFY Z. ~51)
  - `src/app/api/dialogue/recording-ready/route.ts` (MODIFY Z. ~32)
  - `__tests__/security/sec-160-cron-secret-timing.test.ts` (NEU)
- **Expected behavior**: Helper `cron-secret.ts` exportiert `verifyCronSecret(receivedHeader: string | null, envSecret: string | undefined): boolean` + `verifyRecordingWebhookSecret(receivedHeader: string | null, envSecret: string | undefined): boolean` (gleicher Mechanismus, semantisch separater Helper fuer ENV-Klarheit). Pattern-Reuse aus `src/lib/auth/service-key.ts` (Header-Kommentar). 4 Caller refactored auf `if (!verifyCronSecret(req.headers.get("x-cron-secret"), process.env.CRON_SECRET)) return new Response(null, { status: 401 });`. ENV-Variable-Namen unveraendert.
- **Verification**: Vitest 2 Cases (positive + negative). Caller-Smoke: `npm run dev` (oder Local-Build) + `curl -H "X-Cron-Secret: <falsches>"` → 401. `curl -H "X-Cron-Secret: <korrektes-aus-.env.local>"` → 200.
- **Dependencies**: none (kann parallel zu MT-2/MT-3 laufen).

### MT-5: Quality-Gates + Apply-Live + Records
- **Goal**: TSC + Lint + Build + Migrations live auf Coolify-DB + Records-Update.
- **Files**: `docs/MIGRATIONS.md`, `docs/RELEASES.md` (REL-Nummer dynamisch zur Sprint-Start-Zeit vergeben, REL-026 ist V8.0 belegt), `docs/STATE.md` (Current Focus + Last Stable Version), `slices/INDEX.md` (SLC-160 → done), `planning/backlog.json` (BL-141 → done), `planning/roadmap.json` (V20 → released).
- **Expected behavior**: TSC EXIT=0. Lint 0/0. Build PASS. Migrations live appliziert per `.claude/rules/sql-migration-hetzner.md` base64-Pattern (User-SSH-Action oder Agent-SSH per OP-Server-Memory `reference_op_ssh_alias`). Records auf REL-X / V20 / SLC-160 done.
- **Verification**: Cockpit-Records-Format-Check + Counts.
- **Dependencies**: MT-2 + MT-3 + MT-4 done + /qa PASS.

## Notable Risks

- **R-1 (Low)**: `CREATE OR REPLACE FUNCTION` mit unveraendertem Body in MT-2 sollte transparent fuer alle Caller sein. **Mitigation**: AC-2 + AC-8 Probe 3 verifizieren Funktions-Calls aus Cron + Server-Actions weiter funktional. Plus: 3 V4+/V6+-Migrations 032/035/036 nutzen exakt dasselbe Pattern → kein neuer Effekt.
- **R-2 (Low)**: SVG-Block koennte existierende Partner-Logos (falls schon SVG hochgeladen) beim naechsten Re-Upload blocken. **Mitigation**: Coolify-DB-Pre-Check `SELECT COUNT(*) FROM storage.objects WHERE bucket_id = 'partner-branding-assets' AND name LIKE '%.svg'` (in MT-1). Wenn > 0: User informieren, manuelle Re-Upload-Empfehlung. Wenn 0: kein Risiko.
- **R-3 (Low)**: Cron-Helper-Refactor koennte Coolify-Cron-Authentifizierung bei Header-Case-Drift brechen (`X-Cron-Secret` vs `x-cron-secret`). **Mitigation**: `req.headers.get()` ist case-insensitive per Web-Standard. AC-8 Probe 3 verifiziert post-Deploy.

## Strategaize Pattern Reuse (Pflicht)

- `src/lib/auth/service-key.ts` — etabliertes timing-safe-Helper-Pattern. MT-4 Header-Kommentar: `// Pattern aus src/lib/auth/service-key.ts (V7 Self-Signup Service-Key-Pattern, IMP-XXX).`
- `sql/migrations/032_*.sql`, `035_*.sql`, `036_*.sql`, `037_*.sql`, `038_*.sql` — etabliertes `SET search_path`-Pattern. MT-2 Header-Kommentar: `-- Pattern aus Migrations 032+035+036+037+038. SEC-001-Hardening fuer 12 Drift-Funktionen aus 047+054+062.`
- `.claude/rules/coolify-test-setup.md` — node:20 + Network-Setup fuer alle Vitest-Cases.
- `.claude/rules/sql-migration-hetzner.md` — base64-Pattern fuer Migration-Apply per `postgres`-User.

## Verification Plan

1. `npx tsc --noEmit` EXIT=0
2. `npm run lint` 0/0
3. `npm run build` PASS
4. Migrations 103+104 lokal `psql -f` gegen Test-DB
5. Migrations 103+104 live auf Coolify-DB via base64-Pattern (`docker exec -i <db-container> psql -U postgres -d postgres < /tmp/103_*.sql && < /tmp/104_*.sql`)
6. Vitest-Suite gegen Coolify-DB im node:22-Container
7. Coolify-Redeploy via Coolify-UI (User-Action)
8. AC-8 Live-Smoke 4 Probes
9. 18-24h Burn-In, danach REL-026-Stable-Bestaetigung

## Next Step

`/backend SLC-160 MT-1` (Pre-Check) als naechster Step. MT-2..MT-4 koennen parallel laufen.
