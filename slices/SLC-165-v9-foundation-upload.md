# SLC-165 — V9 Bulk-Email-Foundation + Upload + Parser (FEAT-070)

**Version:** V9
**Feature:** FEAT-070 (Bulk-Email-Upload + .mbox/.eml-Parser)
**Backlog:** BL-147
**Status:** planned
**Created:** 2026-06-01
**Priority:** High
**Estimate:** ~5-7 MTs, ~3-4 Tage Code-Side + Vitest gegen Coolify-DB
**Worktree Branch:** `v9-bulk-email-import` (NEU — Cumulative-Single-Branch fuer SLC-165 + SLC-166 + SLC-167 + SLC-168, analog V8.0/V8.1-Pattern, SaaS-Mode-Pflicht)

## Slice Goal

Liefert die **Foundation-Schicht** fuer den V9-Bulk-Email-Workflow:

1. **Schema-Foundation (MIG-051)**: 4 neue Tabellen (`email_bulk_run`, `email_message`, `email_thread`, `email_pattern`), capture_mode CHECK-Erweiterung um `email_bulk` (DEC-186), neuer Storage-Bucket `bulk-email` (DEC-183), Tenant-RLS auf allen Tabellen + Bucket.
2. **`mailparser ^3.7.0`-Wiring** (DEC-185): Lib installieren, Wrapper `src/lib/bulk-email/parser.ts` mit Pflicht-Headern (`message_id`, `in_reply_to`, `references_array`, `from_address`, `to_addresses`, `subject`, `date`, `body_text`).
3. **Upload-Page + Server-Action**: Drag-Drop UI fuer `.mbox`/`.eml`-Multi-Upload, Capture-Mode `email_bulk`-Hook (FEAT-025-Pattern), Duplicate-Check via UNIQUE-Constraint `(tenant_id, file_hash)`.
4. **`email_bulk_parse` Worker**: Async-Job-Type im handle-job.ts-Dispatcher, liest `.mbox` aus Storage, mailparser-Loop, email_message INSERTs.
5. **Status-View Dashboard-Card** mit Pipeline-Progress + Pflicht-RLS-Test-Matrix.
6. **Pre-Cost-Validation MT-1** (Pre-Cond per DEC-179): Test-Email-Corpus von Founder + echte Bedrock-Token-Counts gegen Discovery-Schaetzung pruefen.

Output: V9-Foundation-Layer komplett, fertig fuer SLC-166 Pre-Filter-Pipeline. Kein LLM-Call in diesem Slice (deterministisch).

## In Scope

- **Schema-Migration `sql/migrations/106_v9_bulk_email_schema.sql`** (MIG-051):
  - `CREATE TABLE email_bulk_run` mit UNIQUE(tenant_id, file_hash) + GENERATED total_cost_eur + status CHECK 13 Werte + Indexes
  - `CREATE TABLE email_message` mit Pflicht-Headers + pre_filter_label CHECK 6 Werte + Indexes auf bulk_run_id, thread_id, message_id
  - `CREATE TABLE email_thread` mit root_message_id + participant_pseudonyms JSONB + redacted_body + thread_status CHECK 4 Werte
  - `CREATE TABLE email_pattern` mit title + description + evidence_snippets JSONB + themes text[] + curation_status CHECK 4 Werte
  - Late-Binding FK `email_message.thread_id → email_thread`
  - `ALTER TABLE capture_session` CHECK-Constraint-Erweiterung um `'email_bulk'`
  - `INSERT INTO storage.buckets` fuer `bulk-email` + 5 RLS-Policies (SELECT/INSERT/DELETE)
  - 4x RLS-Policies pro email_*-Tabelle (SELECT + INSERT + UPDATE) mit Standard-Helper `auth_tenant_id() = tenant_id` + Rollen-Matrix (strategaize_admin Cross-Tenant + tenant_admin own + tenant_member/employee KEIN ACCESS)
  - GRANTs auf authenticated
- **`package.json`-Erweiterung**: `"mailparser": "^3.7.0"` + `@types/mailparser` als devDep (DEC-185)
- **`src/lib/bulk-email/parser.ts`** — Pure-Function `parseMboxStream(stream)` + `parseEmlBuffer(buffer)` mit Pflicht-Header-Extraktion + Idempotenz
- **`src/lib/bulk-email/file-hash.ts`** — `computeFileHash(buffer)` → SHA256-Hex (fuer Duplicate-Check)
- **`src/lib/bulk-email/types.ts`** — TypeScript-Interfaces fuer ParsedEmail + ParseResult + BulkRunStatus
- **`src/app/dashboard/bulk-email-import/page.tsx`** — Upload-Page mit Drag-Drop (Reuse FEAT-013 Multi-File-Upload-Component) + Status-Liste + Capture-Mode-Hook
- **`src/app/dashboard/bulk-email-import/actions.ts`** — Server-Action `uploadBulkEmailRun(formData)`: File-Hash, Duplicate-Check, Storage-PUT, email_bulk_run INSERT, enqueue Worker-Job
- **`src/app/dashboard/bulk-email-import/[run_id]/page.tsx`** — Bulk-Run-Detail-View mit Pipeline-Stufen-Progress + Final-Stats-Slot
- **`src/workers/bulk-email/handle-parse-job.ts`** — Worker-Implementation: lese Bucket-File, parser-Loop, email_message INSERTs, UPDATE email_bulk_run.status='parsed' + email_count
- **`src/workers/bulk-email/job-types.ts`** — Konstanten fuer `JOB_TYPE_EMAIL_BULK_PARSE` (+ Pre-Declaration fuer SLC-166/167-Job-Types)
- **`src/workers/handle-job.ts`** Erweiterung um `email_bulk_parse`-Dispatch (NICHT die anderen 3 Worker-Job-Types in V9 — die kommen in SLC-166/167)
- **`src/lib/bulk-email/__tests__/parser.test.ts`** — Vitest gegen 1 Test-.mbox + 1 Test-.eml-Fixture (offline, kein Bedrock)
- **`src/lib/bulk-email/__tests__/file-hash.test.ts`** — Vitest fuer Hash-Determinismus
- **`src/app/dashboard/bulk-email-import/__tests__/actions.test.ts`** — Vitest fuer Duplicate-Check + Storage-PUT-Pfad
- **`src/workers/bulk-email/__tests__/handle-parse-job.test.ts`** — Vitest gegen Coolify-DB mit Mock-Storage
- **RLS-Test-Matrix** in `__tests__/rls/v9-bulk-email.rls.test.ts` (4 Rollen x 4 Tabellen, mind. 16 Pen-Test-Cases)

## Out of Scope

- **Pre-Filter (Haiku-LLM-Call)** — SLC-166
- **Thread-Aggregation + PII-Redaction** — SLC-166
- **Pattern-Extraktion (Sonnet)** — SLC-167
- **Curation-UI** — SLC-167
- **Handbuch-Integration** — SLC-168
- **Cost-Cap-Logik** — SLC-167
- **Attachment-Inhalts-Persistierung** (V9.1+, nur Metadaten in V9.0)
- **Forward-Bucket-Email** (V9.1+)
- **IMAP-Live-Sync** (V10+)
- **Outlook-PST-Format** (V10+)
- **Multi-Mitarbeiter-Upload** (V9.2+)
- **Auto-Delete-Cron** (V9.1+ — V9.0 hat unbegrenzte Aufbewahrung)
- **Storage-Quota-Enforcement** (V9.1+ — V9.0 Soft-Limit 500 MB pro Datei nur im Pre-Upload-Check)

## Pre-Conditions

- ✓ V9 /architecture DONE (RPT-375)
- ✓ DEC-176..186 entschieden
- ✓ MIG-051 + MIG-052 PLANNED in MIGRATIONS.md
- ⏳ **V8.1 STABLE-Bestaetigung via /post-launch** nach Burn-In ~2026-06-02 08:00 UTC (PFLICHT vor MT-2 LIVE-Apply)
- ⏳ **Test-Email-Corpus** von Founder bereitgestellt (PFLICHT vor MT-1 Cost-Validation)
- ⏳ **Worktree-Setup `v9-bulk-email-import`** = MT-0 (Pre-Slice)
- ⏳ **mailparser ^3.7.0 lokal validieren** = MT-1b (npm install + Smoke-Parse-Test gegen Test-.mbox)

## Micro-Tasks

### MT-0: Worktree-Setup + Branch
- **Goal**: Cumulative-Single-Branch-Worktree `v9-bulk-email-import` aus main anlegen (analog V8.1 `v8-1-lead-conversion`-Pattern). Junction-Setup. `npm install`.
- **Files**: nichts im Repo, Setup-Commands.
- **Expected behavior**: `git worktree add -b v9-bulk-email-import c:/strategaize/strategaize-onboarding-plattform-v9 main` + `npm install` im neuen Worktree.
- **Verification**: `git worktree list` zeigt 2+ Worktrees, `git status` im neuen Worktree clean, `node_modules/` existiert, `npm run build` PASS auf Baseline.
- **Dependencies**: none

### MT-1: Test-Corpus + Cost-Validation (DEC-179 Pre-Cond)
- **Goal**: Founder-Test-Corpus pruefen, gegen Bedrock-Haiku (kein-LLM-Call-noetig in V9.0 — nur Token-Count-Schaetzung) Pre-Filter-Cost-Heuristik + gegen Bedrock-Sonnet Pattern-Extraktion-Cost-Heuristik validieren. Schaetzung war ~0.10 EUR Haiku + ~5 EUR Sonnet pro 1000 Emails (Discovery RPT-373).
- **Files**:
  - `docs/V9_COST_VALIDATION.md` (NEU, Datei mit echten Token-Counts + EUR-Cost pro Modell + Faktor-Abweichung-Tabelle)
- **Expected behavior**: Token-Counter-Aufruf (z.B. Bedrock SDK `countTokens` oder direkter `tokenize`) pro Test-Email + Heuristik fuer Sonnet-Pattern-Output. Dokumentation zeigt: Schaetzung vs Realitaet pro 1000-Email-Cluster, Faktor-Abweichung, ggf. Empfehlung Cost-Cap-Werte nachjustieren.
- **Verification**: Bei Faktor-2-Abweichung von Schaetzung: STOP — DEC-182 Cost-Cap-Werte muessen vor MT-2 neu validiert werden (User-Klaerung), ggf. ARCHITECTURE.md V9-Section Update + DEC-187 (Cost-Cap-Adjust). Bei <Faktor-2-Abweichung: continue MT-2.
- **Dependencies**: MT-0, Test-Email-Corpus-Bereitstellung von Founder

### MT-1b: mailparser-Lib lokal validieren (DEC-185)
- **Goal**: `npm install mailparser@^3.7.0 @types/mailparser` im Worktree + Smoke-Parse-Test gegen Test-.mbox aus MT-1.
- **Files**:
  - `package.json` + `package-lock.json` UPDATE
  - `scripts/smoke-mbox-parse.mjs` (NEU, einmaliges Smoke-Skript)
- **Expected behavior**: Smoke-Skript liest 1 Test-.mbox + iteriert mit mailparser durch + druckt `message_id + in_reply_to + references + subject` der ersten 10 Emails. KEINE Crash, alle Pflicht-Headers erkannt.
- **Verification**: `node scripts/smoke-mbox-parse.mjs <test.mbox>` Exit=0, alle 10 Email-IDs nicht-NULL.
- **Dependencies**: MT-1

### MT-2: MIG-051 Schema-Foundation LIVE-Apply
- **Goal**: `sql/migrations/106_v9_bulk_email_schema.sql` schreiben + lokal validieren + LIVE auf 159.69.207.29 Coolify-Postgres applien via [[sql-migration-hetzner]]-Pattern (ssh+base64+psql -U postgres).
- **Files**:
  - `sql/migrations/106_v9_bulk_email_schema.sql` (NEU, atomare Transaction)
  - `__tests__/migrations/106-v9-bulk-email-schema.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - Atomare Migration: 4 CREATE TABLE + 4x RLS-Policies + capture_mode CHECK-Constraint DROP+ADD + Storage-Bucket INSERT + Storage-RLS-Policies + GRANTs
  - Idempotenz via `IF NOT EXISTS` wo moeglich
  - capture_mode CHECK-Constraint enthaelt alle bisherigen Werte (kanonische Auflistung) + `'email_bulk'`
  - Vitest prueft: 4 Tabellen existieren mit korrekten Spalten + Pflicht-Indexes + RLS-Policies + UNIQUE-Constraints + GENERATED-Column total_cost_eur + Bucket existiert
- **Verification**:
  - Lokal: SQL syntactisch valid (`docker exec postgres psql --file ...` dry-run)
  - LIVE: `ssh root@159.69.207.29 + base64 + psql -U postgres -d postgres -c "BEGIN; \i 106_v9_bulk_email_schema.sql; COMMIT;"`
  - `\d email_bulk_run`, `\d email_message`, `\d email_thread`, `\d email_pattern` zeigen erwartete Struktur
  - `SELECT * FROM storage.buckets WHERE id = 'bulk-email'` returns 1 Row
  - 16/16 RLS-Pen-Test-Cases in `__tests__/rls/v9-bulk-email.rls.test.ts` GREEN
- **Dependencies**: MT-1b, V8.1 STABLE-Bestaetigung

### MT-3: mailparser-Wrapper + File-Hash + Types
- **Goal**: `src/lib/bulk-email/parser.ts` mit `parseMboxStream(stream)` + `parseEmlBuffer(buffer)` Pure-Functions, `src/lib/bulk-email/file-hash.ts` mit `computeFileHash(buffer)`, `src/lib/bulk-email/types.ts` mit TypeScript-Interfaces.
- **Files**:
  - `src/lib/bulk-email/parser.ts` (NEU)
  - `src/lib/bulk-email/file-hash.ts` (NEU)
  - `src/lib/bulk-email/types.ts` (NEU)
  - `src/lib/bulk-email/__tests__/parser.test.ts` (NEU, offline gegen 1 Test-.mbox + 1 Test-.eml Fixture in `__tests__/fixtures/`)
  - `src/lib/bulk-email/__tests__/file-hash.test.ts` (NEU)
- **Expected behavior**:
  - `parseMboxStream(stream): AsyncIterableIterator<ParsedEmail>` — Generator, iteriert Emails ohne Memory-Sprawl
  - `parseEmlBuffer(buffer): Promise<ParsedEmail>` — einzelne .eml-File
  - `ParsedEmail = { messageId, inReplyTo, referencesArray, fromAddress, toAddresses, ccAddresses, subject, date, bodyText, bodyHtml, hasAttachments, attachmentMetadata }`
  - Edge-Cases: fehlende message_id -> Generation aus from+date+hash, leere body_text -> empty-string nicht null, defekte Encoding -> Skip mit warning
  - `computeFileHash(buffer): string` — SHA256-Hex (32 chars), deterministisch
- **Verification**: Vitest GREEN gegen 1 Gmail-Takeout-.mbox-Fixture (mind. 10 Emails parsed mit allen Pflicht-Feldern), 1 Outlook-.eml-Fixture, 1 Defekt-Email-Fixture (Skip ohne Crash). File-Hash deterministisch (gleiche Buffer = gleicher Hash).
- **Dependencies**: MT-1b

### MT-4: Upload-Page + Server-Action + Duplicate-Check
- **Goal**: `src/app/dashboard/bulk-email-import/page.tsx` + `actions.ts` mit Drag-Drop UI + Server-Action `uploadBulkEmailRun(formData)`.
- **Files**:
  - `src/app/dashboard/bulk-email-import/page.tsx` (NEU)
  - `src/app/dashboard/bulk-email-import/actions.ts` (NEU)
  - `src/app/dashboard/bulk-email-import/__tests__/actions.test.ts` (NEU, Vitest gegen Coolify-DB)
- **Expected behavior**:
  - Upload-Page: Reuse FEAT-013 Multi-File-Upload-Component, akzeptiert `.mbox` + `.eml`, Max 500 MB pro Datei (Soft-Check JS-Side), Status-Liste der bisherigen Bulk-Runs
  - Server-Action: `formData → File-Read in Memory (Stream fuer >50 MB) → File-Hash → SELECT email_bulk_run WHERE tenant_id+file_hash → Duplicate-Warning ODER INSERT email_bulk_run + Storage-PUT + enqueue ai_jobs Worker-Job`
  - Capture-Mode-Hook: optional INSERT capture_session mit `capture_mode='email_bulk'` + FK auf email_bulk_run.capture_session_id (Pattern aus FEAT-025)
- **Verification**: Vitest gegen Coolify-DB:
  - Erstmaliger Upload erzeugt 1 email_bulk_run-Row + Bucket-Object + 1 ai_jobs-Row
  - Re-Upload-mit-gleichem-Hash erzeugt Warning, kein zweiter email_bulk_run
  - RLS: anderer Tenant kann email_bulk_run NICHT lesen (RLS-Cross-Test)
- **Dependencies**: MT-2, MT-3

### MT-5: Worker `email_bulk_parse` + Dispatcher-Erweiterung
- **Goal**: `src/workers/bulk-email/handle-parse-job.ts` mit Worker-Implementation + Erweiterung von `src/workers/handle-job.ts` um `email_bulk_parse`-Dispatch.
- **Files**:
  - `src/workers/bulk-email/handle-parse-job.ts` (NEU)
  - `src/workers/bulk-email/job-types.ts` (NEU, Konstanten fuer alle 4 V9-Job-Types — Pre-Declaration)
  - `src/workers/handle-job.ts` (UPDATE — Dispatch fuer `email_bulk_parse`)
  - `src/workers/bulk-email/__tests__/handle-parse-job.test.ts` (NEU, Vitest gegen Coolify-DB mit Mock-Storage)
- **Expected behavior**:
  - Worker: liest bulk_run_id aus Job-Payload → lese Storage-Object → parser-Loop → email_message INSERTs (Batch von 100) → UPDATE email_bulk_run SET status='parsed', email_count, updated_at
  - Bei Worker-Crash mid-loop: bulk_run.status bleibt 'parsing', Cleanup-Cron (V9.1+) oder manueller Re-Try via UI greift
  - Idempotenz: email_message INSERTs nutzen `(bulk_run_id, message_id)` als implizite Dedup-Key (kein UNIQUE-Constraint, aber Worker prueft `WHERE message_id NOT IN (SELECT ...)`); ALTERNATIVE: einfacher Status-Reset via `DELETE FROM email_message WHERE bulk_run_id=X` vor Re-Try
- **Verification**: Vitest gegen Coolify-DB:
  - Worker mit Test-.mbox erzeugt N email_message-Rows
  - Worker mit defekter Email skipped + warning, kein Crash
  - status-Transition `parsing → parsed` korrekt
  - Cross-Tenant-RLS: Worker mit Tenant-A bulk_run schreibt KEINE Tenant-B email_message-Rows
- **Dependencies**: MT-4

### MT-6: Bulk-Run-Detail-View + Status-Progress + RLS-Test-Matrix
- **Goal**: `src/app/dashboard/bulk-email-import/[run_id]/page.tsx` mit Pipeline-Stufen-Progress-Anzeige + komplette RLS-Test-Matrix.
- **Files**:
  - `src/app/dashboard/bulk-email-import/[run_id]/page.tsx` (NEU)
  - `__tests__/rls/v9-bulk-email.rls.test.ts` (NEU, Vitest gegen Coolify-DB, 16+ Pen-Test-Cases)
- **Expected behavior**:
  - Detail-View zeigt: source_file_name, email_count, content_emails, thread_count, patterns_*, total_cost_eur, Pipeline-Status-Steps (uploaded/parsed/pre_filtered/thread_redacted/pattern_extracted/curating/importing/completed/failed)
  - Live-Progress (Polling 3s) bei aktivem Worker-Job
  - Failure-Reason wird angezeigt wenn status='failed'
  - RLS-Test-Matrix: 4 Rollen (strategaize_admin/tenant_admin/tenant_member/employee) x 4 Tabellen (email_bulk_run/email_message/email_thread/email_pattern) — strategaize_admin SELECT Cross-Tenant, tenant_admin SELECT+INSERT+UPDATE own-Tenant, tenant_member+employee KEIN ACCESS
- **Verification**: Vitest 16+ RLS-Cases GREEN, Manuell-Smoke-Test in Browser zeigt Pipeline-Progress nach Test-Upload.
- **Dependencies**: MT-5

### MT-7: SLC-165 Records-Update + Commit
- **Goal**: slices/INDEX.md SLC-165 `planned → in_progress`. features/INDEX.md FEAT-070 `planned → in_progress`. planning/backlog.json BL-147 `in_progress` (bleibt). RPT-376 ggf. Slice-Done-Update wenn Slice komplett. Worktree-Commits atomar pro MT.
- **Files**:
  - `slices/INDEX.md` (UPDATE)
  - `features/INDEX.md` (UPDATE)
  - `planning/backlog.json` (UPDATE wenn nicht schon in_progress)
- **Expected behavior**: Status-Updates, MIG-051 Status `PLANNED → live` in MIGRATIONS.md, knowledge_unit.source CHECK-Constraint geprueft.
- **Verification**: `grep "in_progress" slices/INDEX.md | grep SLC-165` matched.
- **Dependencies**: MT-6

## Acceptance Criteria

- **AC-SLC-165-1**: MIG-051 (`106_v9_bulk_email_schema.sql`) LIVE auf Coolify-Postgres, 4 Tabellen + 4x RLS + Bucket + capture_mode CHECK + GRANTs alle aktiv.
- **AC-SLC-165-2**: GF kann `.mbox`-Datei (mind. Gmail-Takeout-Format) hochladen, Plattform persistiert Datei + parsed alle Emails mit Pflicht-Headern.
- **AC-SLC-165-3**: GF kann mehrere `.eml`-Dateien gleichzeitig hochladen, alle als Teil eines Bulk-Runs persistiert.
- **AC-SLC-165-4**: Re-Upload mit gleichem file_hash erzeugt Warning, kein zweiter Run.
- **AC-SLC-165-5**: Roh-Datei in Tenant-isoliertem `bulk-email`-Bucket, Cross-Tenant-Read RLS-blockiert.
- **AC-SLC-165-6**: Audit-Header pro Bulk-Run (tenant_id, uploader_user_id, source_file_name, file_hash, email_count, status, timestamps).
- **AC-SLC-165-7**: Pre-Filter-Label + PII-Redacted-Flag + Thread-FK existieren auf email_message als NULL-Defaults (Foundation fuer SLC-166).
- **AC-SLC-165-8**: Pipeline-Status-View zeigt korrekt aktuellen Status (uploaded/parsing/parsed bei V9.0-SLC-165-Scope) + Live-Progress per Polling.
- **AC-SLC-165-9**: Worker `email_bulk_parse` parsed 1000 Emails in <5 Minuten Worker-Zeit.
- **AC-SLC-165-10**: 16+ RLS-Pen-Test-Cases (4 Rollen x 4 Tabellen) GREEN.
- **AC-SLC-165-11**: TypeScript-Compile EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN (offline-parser + Coolify-DB-Suite).
- **AC-SLC-165-12** (Pre-Cond-AC): Test-Email-Corpus-Cost-Validation (MT-1) zeigt <Faktor-2-Abweichung von Discovery-Schaetzung, sonst DEC-182-Adjust-Iteration.

## Notable Risks / Dependencies

- **R1 (DEC-179)**: Test-Email-Corpus nicht parat zum Slice-Start. MT-1 BLOCKED bis Founder liefert. /backend kann erst nach MT-1 PASS starten.
- **R2 (DEC-185)**: `mailparser ^3.7.0` Edge-Cases bei defekten Encoding (Gmail-Takeout-Quirks, Outlook-CRLF-Drift). MT-3 Test-Fixtures pruefen.
- **R3 (DEC-177)**: `capture_session.capture_mode` CHECK-Constraint DROP+ADD ist atomic, aber bei laufenden Worker-Jobs koennte INSERT mit altem Mode-Wert sekundenweise scheitern. Deploy-Reihenfolge: Code-Deploy FIRST, dann Migration.
- **R4 (DEC-178)**: Worker-Crash-Recovery in V9.0 noch nicht implementiert (Stale-Cleanup-Cron ist V9.1+). Bei Worker-Crash mid-loop bleibt status='parsing' haengen. Manueller Re-Try via DELETE + Re-Enqueue als Pattern.
- **R5**: knowledge_unit.source CHECK-Constraint kann existieren und `email_bulk` als Source-Wert nicht zulassen. MT-2 muss vor LIVE-Apply pruefen, ggf. CHECK-Erweiterung in MIG-051 ergaenzen.
- **D1**: Hard-Dependency auf V8.1 STABLE-Bestaetigung (sonst kein safer Migrations-Apply auf Production).
- **D2**: Hard-Dependency auf Test-Email-Corpus (sonst MT-1 Cost-Validation nicht moeglich).
- **D3**: Coolify-DB-Test-Setup per [[coolify-test-setup]] Pflicht.
- **D4**: Storage-Bucket-Rights muessen via Supabase-Service-Role-Key durchgesetzt werden (Worker laeuft nicht als authenticated User).

## Worktree

- **Branch**: `v9-bulk-email-import`
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v9`
- **Cumulative**: SLC-165 + SLC-166 + SLC-167 + SLC-168 alle im selben Worktree, Master-Merge am Schluss (analog V8.0/V8.1)

## Next After SLC-165

**SLC-166 — V9 Pre-Filter (Haiku) + Thread-Aggregation + PII-Redaction** (FEAT-071 + FEAT-072). Konsumiert email_message-Rows aus SLC-165, fuegt pre_filter_label + pii_redacted-Updates + email_thread-Erzeugung hinzu. Reihenfolge fix per ARCHITECTURE.md V9 Pipeline-Stufen 2-4.
