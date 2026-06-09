# SLC-V9.1-A — Inbound-Foundation + Validation-Layer + Skeleton-Validation (FEAT-075 + FEAT-076)

**Version:** V9.1
**Feature:** FEAT-075 (Inbound-SMTP-Vendor + Catchall-Routing + Tenant-Lookup) + FEAT-076 (Forward-Validation-Layer + Spam-Defense)
**Backlog:** BL-154 + BL-155
**Status:** planned
**Created:** 2026-06-09
**Priority:** High
**Estimate:** ~6-7 MTs, ~5-7 Tage Code-Side + AWS-Founder-Setup (~2-4h einmalig)
**Worktree Branch:** `v9-1-forward-bucket-email` (NEU — Cumulative-Single-Branch fuer SLC-V9.1-A + B + C + D, analog V8.0/V8.1/V9.0-Pattern, SaaS-Mode-Pflicht per [[feedback-worktree-npm-install-not-symlink]] BLOCKING — echtes `npm install`, kein Symlink)

## Slice Goal

Liefert die **Inbound-Foundation-Schicht** fuer den V9.1-Continuous-Stream-Workflow:

1. **AWS-Setup-Validierung (Founder-Steps 1-6, ARCHITECTURE.md V9.1 Section "Pflicht-Founder-Step-Liste")**: SES Inbound Ireland eu-west-1 + S3 + SNS + Lambda + IAM + Secrets Manager + DNS-MX/TXT/CNAME-Records LIVE bereit, Coolify-ENVs synchron.
2. **Schema-Foundation (MIG-057 + MIG-058)**: 3 neue Tabellen (`email_inbound_endpoint`, `email_forward_allowlist`, `email_validation_reject_log`), 2 ALTER auf bestehenden V9-Tabellen (`email_bulk_run` + `email_message`), Tenant-RLS auf allen 3 neuen Tabellen, CHECK-Constraint-Erweiterungen auf `ai_jobs.job_type` + `email_bulk_run.status`.
3. **InboundEmailVendor-Adapter** (DEC-194 Adapter-Pattern): Interface + SES-Implementation + Factory + HMAC-SHA256-Verify mit Shared Secret.
4. **Webhook-Endpoint `/api/inbound/email`**: HMAC-Verify, 3-Schicht-Validation-Layer (Schicht 2 Setup-Token + Schicht 3 Optional Sender-Allowlist), Tenant-Lookup via Catchall-Local-Part, Storage-Persist im `bulk-email`-Bucket, email_message INSERT, email_bulk_run Daily-Roll-Over, audit_log Entry.
5. **Synthetic-Corpus Skeleton-Validation (DEC-195, Architecture MT-0)**: `tests/integration/v91-pre-filter/synthetic-corpus-validation.test.ts` laeuft Bedrock-Haiku-Pre-Filter gegen `test-fixtures/v91-mbox-corpus/synthetic.yaml` (45 Emails, 22 valuable + 23 skip), berechnet Precision/Recall/F1 + Per-Email-Cost als Telemetry-Output (kein Gate-Test, kein CI-Auto-Run, gated via `RUN_V91_SKELETON_VALIDATION=true`).
6. **RLS-Test-Matrix**: 4 Rollen x 3 neue Tabellen, mind. 12 Pen-Test-Cases.

Output: V9.1-Inbound-Foundation komplett, fertig fuer SLC-V9.1-B Cost-Cap-Service. Keine Pipeline-Logik in diesem Slice (Webhook-Endpoint persistiert nur, Pipeline-Trigger ist SLC-V9.1-B Scope).

## In Scope

- **Schema-Migration `sql/migrations/112_v91_inbound_foundation.sql`** (MIG-057): 3 CREATE TABLE + 4 Indexes + 10 RLS-Policies + GRANTs + ai_jobs.job_type CHECK-Extension um 2 V9.1-Werte (`email_bulk_pipeline_trigger`, `email_bulk_retention_sweep`).
- **Schema-Migration `sql/migrations/113_v91_email_bulk_run_message_inbound_retention.sql`** (MIG-058): ALTER email_bulk_run + email_message um 7 neue Spalten + CHECK-Erweiterung um `'continuous'`-Status + 3 neue Indexes + Backfill-UPDATE.
- **`src/lib/inbound-email/types.ts`** — TypeScript-Interfaces (InboundEmailEvent, ValidationResult, TenantLookupResult, RejectReason).
- **`src/lib/inbound-email/vendors/aws-ses.ts`** — SES-Adapter mit `parseEvent` + `verifyHmac` Methods.
- **`src/lib/inbound-email/vendors/index.ts`** — Factory: `getInboundEmailVendor(): InboundEmailVendor` liest ENV `INBOUND_VENDOR`.
- **`src/lib/inbound-email/validation/setup-token.ts`** — Schicht-2-Check: constant-time-compare `X-Strategaize-Forward-Token`-Header vs `email_inbound_endpoint.setup_token`.
- **`src/lib/inbound-email/validation/sender-allowlist.ts`** — Schicht-3-Check (optional): wenn min. 1 enabled Row in `email_forward_allowlist` fuer Endpoint -> pruefe `From:`-Header gegen alle enabled patterns (Domain-Match `*.example.com` oder Email-exact).
- **`src/lib/inbound-email/tenant-lookup.ts`** — Local-Part-Pattern-Resolver: `bulk-<slug>@bulk.strategaizetransition.com` -> Tenant-ID + email_inbound_endpoint-Row.
- **`src/app/api/inbound/email/route.ts`** — Webhook-Endpoint: HMAC-Verify -> Vendor-Adapter-Parse -> Tenant-Lookup -> Setup-Token-Validation -> Sender-Allowlist-Check (optional) -> Storage-PUT in `bulk-email/<tenant_id>/forward-bucket/<endpoint_id>/<YYYY-MM-DD>/<message_id>.eml` -> INSERT email_message + email_bulk_run Daily-Roll-Over (`status='continuous'`) -> audit_log Entry.
- **`tests/integration/v91-pre-filter/corpus-to-eml.ts`** — YAML-to-EML-Conversion-Helper.
- **`tests/integration/v91-pre-filter/synthetic-corpus-validation.test.ts`** — Skeleton-Validation gegen 45-Email-Synthetic-Corpus (kein Gate, Telemetry-Output).
- **`tests/integration/v91-pre-filter/README.md`** — Run-Instruction + Telemetry-Interpretation.
- **`src/lib/inbound-email/__tests__/setup-token.test.ts`** — Vitest fuer constant-time-compare + Edge-Cases (missing/empty/mismatch).
- **`src/lib/inbound-email/__tests__/sender-allowlist.test.ts`** — Vitest fuer Domain-Match + Email-exact + Disabled-Allowlist-Skip.
- **`src/lib/inbound-email/__tests__/tenant-lookup.test.ts`** — Vitest fuer Local-Part-Parsing + Tenant-Resolution + Edge-Cases.
- **`src/app/api/inbound/email/__tests__/route.test.ts`** — Vitest gegen Coolify-DB: HMAC-Fail -> 401, HMAC-Pass + Validation-Fail -> 200 silent-drop + reject_log INSERT, Full-Pass -> email_message INSERT.
- **`__tests__/rls/v91-inbound.rls.test.ts`** — RLS-Pen-Test-Matrix (4 Rollen x 3 Tabellen, mind. 12 Cases).
- **`__tests__/migrations/112-v91-inbound-foundation.test.ts`** + **`__tests__/migrations/113-v91-email-bulk-run-message-inbound-retention.test.ts`** — Schema-Verifikation Vitest.
- **`.env.deploy.example`** Erweiterung um 8 V9.1-ENVs: `INBOUND_VENDOR=ses-ireland`, `INBOUND_WEBHOOK_HMAC_SECRET=<32-byte-hex>`, `INBOUND_CATCHALL_DOMAIN=bulk.strategaizetransition.com`, `V91_BULK_EMAIL_DAILY_CAP_EUR=5`, `V91_BULK_EMAIL_MONTHLY_CAP_EUR=100`, `V91_BULK_EMAIL_PER_EMAIL_APPROVAL_THRESHOLD_EUR=0.5`, `V91_RETENTION_SOFT_DELETE_DAYS=60`, `V91_RETENTION_HARD_DELETE_DAYS=90`, `V91_BULK_EMAIL_TRIGGER_MIN_COUNT=25`.
- **`infra/lambda/forward-ses-to-op-webhook/`** — Lambda-Source-Code (Node 20.x, arm64, 256 MB, 30s, ~50 LOC + npm deps fuer SDK + HMAC). ZIP-Deploy-Skript `scripts/deploy-lambda.sh` mit `aws lambda update-function-code`-Call.

## Out of Scope

- **Continuous-Cost-Cap-Service** (Daily + Monthly + Per-Email-Approval) — SLC-V9.1-B
- **Periodischer Pipeline-Trigger-Cron** — SLC-V9.1-B
- **Storage-Retention-Cron** (Soft-Delete + Hard-Delete + Idempotency vs knowledge_unit) — SLC-V9.1-C
- **Setup-UI** mit Conversational-First + 4-Mail-Client-Anleitungen + Setup-Token-Display + DSGVO-Disclaimer + Test-Send-Button — SLC-V9.1-D
- **Admin-Audit-Erweiterung Forward-Source-Statistik** — SLC-V9.1-D
- **DKIM-Re-Sign-Verifikation** (DEC-199) — V9.2+
- **Eigene Spam-Heuristik** (Subject-Pattern-Block, Bayesian-Score) — V9.2+
- **Multi-Mitarbeiter-Upload** — V9.2+
- **Real-Time-UI** (WebSocket-Status-Stream) — V9.3+
- **IMAP-Live-Sync** — V10+
- **Outlook-PST-Format** — V10+
- **Plan-B Mailgun-EU-Adapter-Implementation** (nur Adapter-Interface-vorbereitet) — Bei AWS-Vendor-Switch via DEC mit Migration-Plan ~2-3 Wochen
- **Anwalts-Sign-off + DSGVO-Pre-Live-Check** — Per [[module-lifecycle-discipline]] deferred bis Modul 1+2+3 komplett
- **Per-Tenant-Cost-Cap-Override via Tenant-Settings JSONB** — V9.1.x

## Pre-Conditions

- ✓ V9 RELEASED + STABLE (REL-030, 2026-06-07)
- ✓ V9.1 /architecture DONE (RPT-429, 2026-06-09)
- ✓ DEC-194..201 entschieden
- ✓ MIG-057 + MIG-058 PLANNED in MIGRATIONS.md
- ✓ Synthetic-Corpus vorhanden (`test-fixtures/v91-mbox-corpus/synthetic.yaml`, 45 Emails per DEC-195)
- ⏳ **AWS-Founder-Setup (Steps 1-6)** PFLICHT VOR MT-4 LIVE-Smoke (~2-4h einmalig, Agent assistiert)
- ⏳ **Worktree-Setup `v9-1-forward-bucket-email`** = MT-0 (Pre-Slice)
- ⏳ **Coolify-ENVs synchron mit AWS Secrets Manager** PFLICHT VOR MT-4 LIVE-Smoke

## Micro-Tasks

### MT-0: Worktree-Setup + Branch + Echte npm install
- **Goal**: Cumulative-Single-Branch-Worktree `v9-1-forward-bucket-email` aus main anlegen (analog V8.1 `v8-1-lead-conversion` / V9.0 `v9-bulk-email-import` Pattern). Echtes `npm install --prefer-offline` im Worktree-Root statt Junction/Symlink (BLOCKING per [[feedback-worktree-npm-install-not-symlink]] — sonst silent fails bei Vitest / Vite / Turbopack).
- **Files**: nichts im Repo, Setup-Commands.
- **Expected behavior**: `git worktree add -b v9-1-forward-bucket-email c:/strategaize/strategaize-onboarding-plattform-v91 main` + im neuen Worktree `npm install --prefer-offline`. `node_modules/` als echtes Directory (nicht Symlink).
- **Verification**: `git worktree list` zeigt 2+ Worktrees, `git status` im neuen Worktree clean, `node_modules/` existiert als directory (`ls -la node_modules | head -1` zeigt `d` nicht `l`), `npm run build` PASS auf Baseline, `npx vitest --version` antwortet.
- **Dependencies**: none

### MT-1: Synthetic-Corpus Skeleton-Validation (Architecture MT-0 + DEC-195)
- **Goal**: Vitest gegen 45-Email-Synthetic-Corpus mit Bedrock-Haiku-Pre-Filter, Telemetry-Output Precision/Recall/F1/Per-Email-Cost. KEIN Gate-Test, KEIN CI-Auto-Run, gated via ENV `RUN_V91_SKELETON_VALIDATION=true`. Parallel zu Founder-AWS-Setup ausfuehrbar (kein AWS-Inbound noetig).
- **Files**:
  - `tests/integration/v91-pre-filter/corpus-to-eml.ts` (NEU, Reuse-Quelle per ARCHITECTURE.md V9.1 Section MT-0)
  - `tests/integration/v91-pre-filter/synthetic-corpus-validation.test.ts` (NEU)
  - `tests/integration/v91-pre-filter/README.md` (NEU, Re-Run-Instruction)
- **Expected behavior**:
  - Liest `test-fixtures/v91-mbox-corpus/synthetic.yaml` (45 Corpus-Entries via `yaml`-Lib)
  - `entryToEml(entry)` baut RFC-5322-MIME-String pro Entry
  - Pro Entry: Bedrock-Haiku-Pre-Filter-Call (V9-Pattern Reuse aus `src/lib/ai/bedrock-haiku/email-pre-filter.ts`)
  - Aggregat Precision/Recall/F1 vs Ground-Truth (TP/FP/FN/TN-Count)
  - Total-Cost + Per-Email-Cost-Telemetry
  - Soft-Warn bei `f1 < 0.7` (kein test fail — IMP-Carry-Over zu V9.1.x falls noetig)
  - Test-Body `expect(results.length).toBe(45)` (Always-Pass — Skeleton-Validation, not Gate)
  - 10min-Timeout fuer 45 sequentielle Bedrock-Calls
- **Verification**: `RUN_V91_SKELETON_VALIDATION=true npx vitest run tests/integration/v91-pre-filter/synthetic-corpus-validation.test.ts` Exit=0, Console-Output zeigt Precision/Recall/F1-Telemetry. Total-Cost <= 0.05 EUR (45 Haiku-Calls bei ~0.0002 EUR/Call laut DEC-179-V9-Schaetzung).
- **Dependencies**: MT-0

### MT-2: MIG-057 + MIG-058 Schema-Foundation LIVE-Apply
- **Goal**: `sql/migrations/112_v91_inbound_foundation.sql` + `sql/migrations/113_v91_email_bulk_run_message_inbound_retention.sql` schreiben + lokal validieren + LIVE auf 159.69.207.29 Coolify-Postgres applien via [[sql-migration-hetzner]]-Pattern (ssh+base64+psql -U postgres).
- **Files**:
  - `sql/migrations/112_v91_inbound_foundation.sql` (NEU, MIG-057)
  - `sql/migrations/113_v91_email_bulk_run_message_inbound_retention.sql` (NEU, MIG-058)
  - `__tests__/migrations/112-v91-inbound-foundation.test.ts` (NEU, Vitest gegen Coolify-DB)
  - `__tests__/migrations/113-v91-email-bulk-run-message-inbound-retention.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - MIG-057: 3 CREATE TABLE IF NOT EXISTS + 4 CREATE INDEX IF NOT EXISTS + 10 RLS-Policies + GRANTs + ai_jobs.job_type CHECK-Extension um 2 Werte
  - MIG-058: ALTER email_bulk_run + email_message um 7 Spalten + CHECK-Erweiterung um `'continuous'` + 3 CREATE INDEX + Backfill-UPDATE (`SET retention_until = created_at + 90d WHERE retention_until IS NULL`)
  - Beide Migrations atomic via BEGIN/COMMIT
  - Vitest prueft: 3 Tabellen existieren mit korrekten Spalten + Pflicht-Indexes + RLS-Policies + UNIQUE-Constraints + 2 ALTER-Tabellen haben neue Spalten + CHECK-Constraint enthaelt `'continuous'`
- **Verification**:
  - Lokal: SQL syntactisch valid
  - LIVE: `ssh root@159.69.207.29` + base64 + `docker exec -i $(docker ps --format '{{.Names}}' | grep ^supabase-db) psql -U postgres -d postgres -c "BEGIN; \i 112_v91_inbound_foundation.sql; COMMIT;"` und entsprechend fuer 113
  - `\dt email_inbound_endpoint email_forward_allowlist email_validation_reject_log` zeigt 3 Tabellen
  - `\d email_bulk_run` zeigt neue Spalten + erweiterte CHECK-Constraint
  - `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ai_jobs_job_type_check'` enthaelt 19 Werte
  - 12/12 RLS-Pen-Test-Cases in `__tests__/rls/v91-inbound.rls.test.ts` GREEN (MT-7)
  - Post-Apply NOTIFY pgrst 'reload schema' fuer PostgREST-Reload
- **Dependencies**: MT-0

### MT-3: InboundEmailVendor Adapter + HMAC-Verify
- **Goal**: SES-Adapter mit Vendor-Event-Parsing + HMAC-SHA256-Verify mit Shared Secret + Factory-Pattern fuer Plan-B-Vendor-Wechsel ohne Business-Logic-Refactor.
- **Files**:
  - `src/lib/inbound-email/types.ts` (NEU)
  - `src/lib/inbound-email/vendors/aws-ses.ts` (NEU)
  - `src/lib/inbound-email/vendors/index.ts` (NEU, Factory)
  - `src/lib/inbound-email/hmac.ts` (NEU, constant-time-Compare per `crypto.timingSafeEqual`)
  - `src/lib/inbound-email/__tests__/aws-ses.test.ts` (NEU, Vitest)
  - `src/lib/inbound-email/__tests__/hmac.test.ts` (NEU, Vitest)
- **Expected behavior**:
  - `InboundEmailVendor` interface: `parseEvent(rawBody: string): ParsedInboundEvent`, `verifyHmac(rawBody: string, signature: string, secret: string): boolean`
  - SES-Implementation parsed JSON-Payload aus Lambda-POST: `{raw_eml_base64, s3_key, message_id, recipient}`
  - HMAC-Verify: SHA256-HMAC ueber rawBody mit Secret + constant-time-Compare vs `X-Strategaize-Signature: sha256=...`-Header
  - Factory liest `INBOUND_VENDOR=ses-ireland` ENV
- **Verification**: Vitest GREEN: Valid-HMAC -> pass, Mismatch -> fail, Empty-Signature -> fail, Wrong-Secret -> fail. SES-Event-Parse mit Test-Payload aus AWS-Doku liefert korrekte Felder.
- **Dependencies**: MT-0

### MT-4: Webhook-Endpoint + 3-Schicht-Validation-Layer
- **Goal**: `src/app/api/inbound/email/route.ts` mit HMAC-Verify + Validation-Layer (Setup-Token + Optional Sender-Allowlist) + Tenant-Lookup + Storage-Persist + email_message INSERT + email_bulk_run Daily-Roll-Over + audit_log Entry.
- **Files**:
  - `src/lib/inbound-email/validation/setup-token.ts` (NEU)
  - `src/lib/inbound-email/validation/sender-allowlist.ts` (NEU)
  - `src/lib/inbound-email/tenant-lookup.ts` (NEU)
  - `src/lib/inbound-email/storage-persist.ts` (NEU, Service-Role-Client schreibt in bulk-email-Bucket)
  - `src/lib/inbound-email/reject-log.ts` (NEU, INSERT email_validation_reject_log Helper)
  - `src/app/api/inbound/email/route.ts` (NEU, POST-Handler)
  - `src/lib/inbound-email/__tests__/setup-token.test.ts` (NEU)
  - `src/lib/inbound-email/__tests__/sender-allowlist.test.ts` (NEU)
  - `src/lib/inbound-email/__tests__/tenant-lookup.test.ts` (NEU)
  - `src/app/api/inbound/email/__tests__/route.test.ts` (NEU, Integration-Vitest gegen Coolify-DB)
- **Expected behavior**:
  - Schritt-Reihenfolge per ARCHITECTURE.md Flow A:
    1. HMAC-Verify -> Fail: INSERT reject_log (reject_layer='hmac_invalid') + 401-Response
    2. Vendor-Adapter parsed Raw-Email (mailparser-Reuse aus V9)
    3. Tenant-Lookup via `To:`-Local-Part -> Fail: INSERT reject_log (reject_layer='tenant_not_found') + 200-OK silent-drop
    4. Endpoint-Status-Check -> 'paused'/'revoked': INSERT reject_log (reject_layer='endpoint_inactive') + 200-OK
    5. Setup-Token-Validation -> Fail: INSERT reject_log (reject_layer='setup_token_missing'/'setup_token_invalid') + 200-OK
    6. Optional Sender-Allowlist (wenn >=1 enabled Row) -> Fail: INSERT reject_log (reject_layer='allowlist_mismatch') + 200-OK
    7. Pass: Storage-PUT in `bulk-email/<tenant_id>/forward-bucket/<endpoint_id>/<YYYY-MM-DD>/<message_id>.eml`
    8. INSERT email_message (mit `raw_storage_path`, `bulk_run_id`, Pflicht-Headers via mailparser-Reuse)
    9. UPSERT email_bulk_run Daily-Roll-Over: SELECT bulk_run WHERE tenant_id+endpoint_id+DATE(created_at)=today+status='continuous'; wenn keine: INSERT mit `inbound_source='forward_bucket'`+`status='continuous'`; wenn ja: UPDATE email_count += 1
    10. INSERT audit_log (event_type='email_inbound_received', payload={message_id, sender_domain, endpoint_id, vendor})
    11. 200-OK an Lambda
  - All Fail-Pfade returnen 200-OK silent-drop ausser HMAC-Fail (401) — vermeidet AWS-Lambda-Retry-Loop
- **Verification**: Vitest gegen Coolify-DB:
  - HMAC-Fail -> 401 + reject_log (reject_layer='hmac_invalid')
  - Tenant-Lookup-Miss -> 200-OK + reject_log (reject_layer='tenant_not_found')
  - Setup-Token-Miss/Mismatch -> 200-OK + reject_log
  - Allowlist-Miss bei enabled Allowlist -> 200-OK + reject_log
  - Allowlist-Skip bei keine enabled Rows -> Pass
  - Full-Pass -> 200-OK + 1 email_message INSERT + 1 email_bulk_run Daily-Roll-Over + 1 audit_log Entry + Storage-Object existiert
  - 2x Full-Pass am gleichen Tag -> 1 email_bulk_run (Daily-Roll-Over) + 2 email_message + email_count=2
  - Cross-Tenant-RLS: anderer Tenant kann email_message NICHT lesen
- **Dependencies**: MT-2, MT-3

### MT-5: Lambda-Source + ZIP-Deploy-Skript
- **Goal**: `infra/lambda/forward-ses-to-op-webhook/` Lambda-Source mit S3-Read + HMAC-Sign + POST an OP-Webhook. ZIP-Deploy-Skript fuer Founder-Operations.
- **Files**:
  - `infra/lambda/forward-ses-to-op-webhook/index.mjs` (NEU, Node 20.x, ~50 LOC)
  - `infra/lambda/forward-ses-to-op-webhook/package.json` (NEU)
  - `infra/lambda/forward-ses-to-op-webhook/README.md` (NEU, Deploy-Anleitung + IAM-Role-Setup-Hinweis)
  - `scripts/deploy-lambda.sh` (NEU, `cd infra/lambda/forward-ses-to-op-webhook && zip ... && aws lambda update-function-code ...`)
- **Expected behavior**:
  - Lambda-Handler liest SNS-Event-Payload -> S3-Object-Read via AWS-SDK -> HMAC-SHA256-Sign mit Secret aus Secrets Manager (Cold-Start-Cache) -> POST `https://onboarding.strategaizetransition.com/api/inbound/email` mit Headers `X-Strategaize-Signature: sha256=...` + `X-Strategaize-Vendor: ses-ireland`
  - Bei OP-Webhook-Error: Lambda-Throw -> AWS-Lambda-Retry-Policy (Standard 2 Retries, dann DLQ falls konfiguriert — DLQ-Setup V9.1.x)
  - Memory 256 MB, Timeout 30s, arm64 (Cost-Optimierung)
- **Verification**: Lokal: `node infra/lambda/forward-ses-to-op-webhook/index.mjs` Smoke-Test mit Mock-Event. AWS-Deploy via `bash scripts/deploy-lambda.sh` -> AWS Console zeigt Lambda mit Code aktualisiert.
- **Dependencies**: MT-3, AWS-Founder-Setup-Steps 1-5

### MT-6: Live-Smoke End-to-End + RLS-Test-Matrix + Records-Update
- **Goal**: Live-Smoke-Pfad SES -> S3 -> SNS -> Lambda -> OP-Webhook -> email_message + email_bulk_run + audit_log + RLS-Test-Matrix 12+ Pen-Test-Cases + slices/INDEX, planning/backlog, features/INDEX, STATE Updates.
- **Files**:
  - `__tests__/rls/v91-inbound.rls.test.ts` (NEU, 12+ Pen-Test-Cases)
  - `slices/INDEX.md` (UPDATE — SLC-V9.1-A `planned -> in_progress -> done`)
  - `features/INDEX.md` (UPDATE — FEAT-075 + FEAT-076 `planned -> in_progress -> done` wenn AC alle gruen)
  - `planning/backlog.json` (UPDATE — BL-154 + BL-155 `in_progress -> done`)
  - `docs/MIGRATIONS.md` (UPDATE — MIG-057 + MIG-058 `PLANNED -> live` mit Apply-Timestamp + Container-Name)
  - `docs/STATE.md` (UPDATE — Current Focus + Last Stable Version bleibt V9)
- **Expected behavior**:
  - Live-Smoke: Founder sendet 1 Test-Forward-Mail an `bulk-<tenant-slug>@bulk.strategaizetransition.com` mit Setup-Token im Header -> binnen <60s erscheint 1 email_message-Row in Production-DB + 1 audit_log Entry + Storage-Object im bulk-email-Bucket
  - RLS-Test-Matrix:
    - **strategaize_admin**: SELECT alle 3 Tabellen Cross-Tenant -> PASS; INSERT email_inbound_endpoint Cross-Tenant -> PASS
    - **tenant_admin** (Tenant-A): SELECT email_inbound_endpoint OWN -> PASS; SELECT Tenant-B -> 0 rows; INSERT email_inbound_endpoint OWN -> PASS; INSERT Tenant-B -> RLS-blocked
    - **tenant_admin** (Tenant-A): SELECT email_forward_allowlist OWN -> PASS; DELETE OWN -> PASS; DELETE Tenant-B -> 0 rows affected
    - **tenant_admin** (Tenant-A): SELECT email_validation_reject_log OWN -> PASS (read-only); INSERT -> RLS-blocked (nur service_role)
    - **tenant_member** + **employee**: SELECT alle 3 Tabellen -> 0 rows (KEIN ACCESS V9.1)
- **Verification**: 12+ RLS-Pen-Test-Cases GREEN in `__tests__/rls/v91-inbound.rls.test.ts`. Live-Smoke: 1 Test-Forward-Mail aus Founder-Gmail erscheint binnen <60s in DB. slices/INDEX, planning/backlog, features/INDEX, STATE.md alle synchron mit Slice-Status.
- **Dependencies**: MT-4, MT-5, AWS-Founder-Setup-Steps 1-6, Coolify-ENV-Sync

## Acceptance Criteria

- **AC-V9.1-A-1**: MIG-057 (`112_v91_inbound_foundation.sql`) LIVE auf Coolify-Postgres, 3 neue Tabellen + 4 Indexes + 10 RLS-Policies + ai_jobs.job_type CHECK-Extension um 2 V9.1-Werte alle aktiv.
- **AC-V9.1-A-2**: MIG-058 (`113_v91_email_bulk_run_message_inbound_retention.sql`) LIVE, email_bulk_run + email_message haben 7 neue Spalten, CHECK-Constraint enthaelt `'continuous'`-Status, Backfill-UPDATE auf bestehende V9-Rows lief idempotent.
- **AC-V9.1-A-3**: Synthetic-Corpus Skeleton-Validation laeuft `RUN_V91_SKELETON_VALIDATION=true npx vitest run tests/integration/v91-pre-filter/synthetic-corpus-validation.test.ts` Exit=0, Console-Output zeigt Precision/Recall/F1-Telemetry, Total-Cost <= 0.05 EUR.
- **AC-V9.1-A-4**: InboundEmailVendor-Adapter mit SES-Implementation + Factory + HMAC-Verify funktional, Vitest GREEN.
- **AC-V9.1-A-5**: Webhook-Endpoint `/api/inbound/email` Reject-Pfad 1 (HMAC-Fail) -> 401 + reject_log (reject_layer='hmac_invalid').
- **AC-V9.1-A-6**: Reject-Pfad 2-5 (Tenant-Lookup / Endpoint-Inactive / Setup-Token / Allowlist) -> 200-OK silent-drop + reject_log mit korrektem reject_layer.
- **AC-V9.1-A-7**: Full-Pass-Pfad: 1 email_message INSERT + 1 email_bulk_run Daily-Roll-Over (mit `inbound_source='forward_bucket'` + `status='continuous'`) + 1 audit_log Entry + Storage-Object in `bulk-email/<tenant_id>/forward-bucket/<endpoint_id>/<YYYY-MM-DD>/<message_id>.eml`.
- **AC-V9.1-A-8**: 2x Full-Pass am gleichen Tag erzeugt 1 email_bulk_run (Daily-Roll-Over) + 2 email_message + email_count=2.
- **AC-V9.1-A-9**: Lambda-Function `forward-ses-to-op-webhook` deployed via `bash scripts/deploy-lambda.sh`, AWS Console zeigt aktualisierten Code, Lambda-Invocation per Test-Event funktioniert.
- **AC-V9.1-A-10**: Live-Smoke Founder-Test-Forward-Mail an `bulk-<tenant-slug>@bulk.strategaizetransition.com` erscheint binnen <60s als email_message-Row + audit_log + Storage-Object in Production-DB.
- **AC-V9.1-A-11**: 12+ RLS-Pen-Test-Cases (4 Rollen x 3 Tabellen) GREEN.
- **AC-V9.1-A-12**: TypeScript-Compile EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN (Adapter-Suite offline + Webhook-Suite gegen Coolify-DB + RLS-Matrix + Skeleton-Validation optional via ENV).
- **AC-V9.1-A-13**: Pre-Cond-AC: AWS-Founder-Setup Steps 1-6 LIVE bestaetigt (DNS-MX + TXT + 3 DKIM-CNAMEs + SPF, SES Receipt-Rule-Set active, S3 Bucket + Lifecycle, Secrets Manager Entry, Lambda + IAM-Role + SNS-Subscription, Coolify-ENVs synchron).

## Notable Risks / Dependencies

- **R1 (AWS-Setup-Dependency)**: Founder-Setup-Steps 1-6 brauchen ~2-4h einmalig + ggf. AWS-SES-Sandbox-Production-Approval (~24h). MT-4-Live-Smoke BLOCKED bis Steps PASS. Mitigation: MT-1 (Skeleton-Validation) + MT-2 (Migrations) + MT-3 (Adapter) + MT-5 (Lambda-Code) sind parallel-AWS-Setup-frei lauffaehig.
- **R2 (DEC-194 Vendor-Lock-In-Risiko)**: AWS-SES-Sandbox-Mode bei neuen Accounts blockiert Production-Receiving bis Approval. Mitigation: Adapter-Pattern erlaubt Plan-B-Mailgun-Wechsel ohne Business-Logic-Refactor (~2-3 Wochen Aufwand falls noetig).
- **R3 (DEC-201 Spam-Defense-Gap)**: 3-Schicht-Defense (SES Built-In + Setup-Token + Optional Allowlist) hat keine eigene Bayesian-Heuristik. Bei real-Traffic-Spam mit valider Setup-Token-Kopie (z.B. Mailbox-Leak) wuerde Schicht 2 nicht greifen. Mitigation: Audit-Log `email_validation_reject_log` macht Probing sichtbar, V9.2+ koennte Bayesian-Heuristik nachruesten.
- **R4 (DEC-200 Random-Tenant-Slug-Probing)**: Catchall-Routing erlaubt theoretisch Spam-Probing aller Tenant-Slugs. Mitigation: Tenant-Slug ist 32-byte URL-safe Random bei Provisioning + Setup-Token-Validation in Schicht 2 + reject_log macht Probing sichtbar.
- **R5 (DEC-196 Cross-Region-TIA)**: Bedrock Frankfurt eu-central-1 + SES Inbound Ireland eu-west-1 = Cross-Region-Drift. Mitigation: Beide EU, AWS-Standard-DPA via AWS-Europe-SARL, dokumentiert in COMPLIANCE.md (Erweiterung in SLC-V9.1-D) + CI-Region-Lock-Check erweitert um eu-west-1-Whitelist.
- **R6 (HMAC-Secret-Drift)**: AWS Secrets Manager Entry + Coolify-ENV `INBOUND_WEBHOOK_HMAC_SECRET` muessen synchron sein. Bei Mismatch: alle Inbound-Mails returnen 401, kein Email-Empfang. Mitigation: Quartalsweise Rotation per Founder-Maintenance-Window, KEINE Sliding-Window in V9.1.
- **R7 (Lambda-Cold-Start-Latency)**: AWS Lambda Cold-Start (~500ms-2s) addiert zu Inbound-Latency. Mitigation: Akzeptabel fuer Continuous-Stream-Use-Case (kein User-Wait), Provisioned-Concurrency in V9.1.x optional.
- **D1**: Hard-Dependency auf V9 STABLE + V9.1 /architecture DONE (beide erfuellt).
- **D2**: Hard-Dependency auf AWS-Founder-Setup-Steps 1-6 vor MT-6 Live-Smoke.
- **D3**: Coolify-DB-Test-Setup per [[coolify-test-setup]] Pflicht (node:20 (glibc), SAVEPOINT-Pattern fuer expected RLS-Rejections).
- **D4**: Storage-Bucket-Rights muessen via Supabase-Service-Role-Key durchgesetzt werden (Webhook laeuft nicht als authenticated User).

## Worktree

- **Branch**: `v9-1-forward-bucket-email`
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v91`
- **Cumulative**: SLC-V9.1-A + SLC-V9.1-B + SLC-V9.1-C + SLC-V9.1-D alle im selben Worktree, Master-Merge in SLC-V9.1-D MT-letzter nach Gesamt-V9.1-/qa PASS

## Next After SLC-V9.1-A

**SLC-V9.1-B — Continuous-Cost-Cap-Service (FEAT-077)**. Konsumiert email_bulk_run-Rows mit `inbound_source='forward_bucket'` + `status='continuous'` aus SLC-V9.1-A, fuegt periodischen Pipeline-Trigger + Daily/Monthly-Cap + Per-Email-Approval + GF-Notification + Pipeline-Pause-Logik hinzu. Reihenfolge fix per ARCHITECTURE.md V9.1 Slice-Empfehlung.
