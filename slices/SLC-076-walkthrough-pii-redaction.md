# SLC-076 — Walkthrough Stufe 1 PII-Redaction

## Goal

Erste produktive Stufe der V5 Option 2 Methodik-Pipeline. Migration 087 deployen (Status-Maschine erweitert um `redacting`/`extracting`/`mapping` + `knowledge_unit.source` um `walkthrough_transcript_redacted`). Neuer Worker-Job-Handler `walkthrough_redact_pii` im bestehenden Worker-Container nimmt Original-Transkript-KU (source='walkthrough_transcript') als Input, ruft Bedrock-Sonnet (eu-central-1) mit System-Prompt aus PII-Pattern-Library, persistiert redacted-Text als neuen knowledge_unit-Eintrag (source='walkthrough_transcript_redacted', evidence_refs={original_kuId, walkthrough_session_id}). Pipeline-Trigger faedelt Job nach erfolgreichem Whisper-Run (SLC-072) automatisch ein. PII-Pattern-Library lebt unter `src/lib/ai/pii-patterns/index.ts` als system-wide constant (DEC-082) mit synthetischer Test-Suite ≥90% Recall (SC-V5-6).

## Feature

FEAT-037 (Walkthrough AI-Pipeline) — Stufe 1. Erste der drei sequentiellen Bedrock-Stufen. Pattern-Reuse: bestehender `bedrock-client.ts`, `ai_jobs`-Queueing, `ai_cost_ledger`.

## In Scope

### A — Migration 087 (Status + Source-Erweiterung)

Pfad: `sql/migrations/087_v5opt2_status_and_source_extension.sql` (neu), per `sql-migration-hetzner.md`-Pattern auf Hetzner appliziert.

- `walkthrough_session.status` CHECK erweitert um `'redacting'`, `'extracting'`, `'mapping'`. Bestehende Werte (`recording`, `uploading`, `uploaded`, `transcribing`, `pending_review`, `approved`, `rejected`, `failed`) bleiben.
- `knowledge_unit.source` CHECK erweitert um `'walkthrough_transcript_redacted'`. Alle bestehenden Werte bleiben.
- Beides additiv, idempotent (DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT).
- Pre-Apply-Backup pro `sql-migration-hetzner.md` (csv-Snapshot der beiden CHECK-Definitionen via pg_get_constraintdef).

### B — PII-Pattern-Library

Pfad: `src/lib/ai/pii-patterns/index.ts` (neu).

```typescript
export const PII_PATTERNS = {
  KUNDENNAME:    { placeholder: '[KUNDE]',  description: 'Vor-/Nachnamen von Kunden, Firmenkontakten' },
  EMAIL:         { placeholder: '[EMAIL]',  description: 'E-Mail-Adressen' },
  IBAN:          { placeholder: '[IBAN]',   description: 'IBAN/Kontonummern' },
  TELEFON:       { placeholder: '[TEL]',    description: 'Telefon-/Mobilnummern' },
  PREIS_BETRAG:  { placeholder: '[BETRAG]', description: 'Konkrete Preise/Betraege in EUR' },
  INTERNE_ID:    { placeholder: '[ID]',     description: 'Auftrags-/Kunden-/Vertragsnummern' },
  INTERN_KOMM:   { placeholder: '[INTERN]', description: 'Interne Kommunikations-Marker (z.B. Slack-Handles, Confluence-Links)' },
} as const;

export type PiiCategory = keyof typeof PII_PATTERNS;
```

### C — Synthetische Test-Suite (SC-V5-6 Pflicht)

Pfad: `src/lib/ai/pii-patterns/__tests__/redaction-recall.test.ts` (neu).

- Mind. 50 synthetische Saetze mit klaren PII-Markern pro Kategorie (insgesamt 350+ PII-Items ueber 7 Kategorien).
- Test ruft real Bedrock (eu-central-1, Sonnet) mit System-Prompt + jedem Test-Satz, vergleicht Output gegen Erwartungs-Pattern.
- **Recall-Soll: ≥90%** (SC-V5-6, DEC-082).
- Test-Run kostet ~$0.01 — vertretbar in CI als Pre-Release-Gate.

### D — Bedrock-Prompt `pii_redact.ts`

Pfad: `src/lib/ai/prompts/walkthrough/pii_redact.ts` (neu).

- System-Prompt: "Du bist ein PII-Redactor fuer deutsche Geschaefts-Walkthroughs."
- Pattern-Liste eingebettet (PII-Kategorien + Platzhalter + Beispiele).
- Konservative Guidance: "Im Zweifel maskieren — lieber zu viel als zu wenig."
- Output-Format: nur der redacted-Text, keine Erklaerung.

### E — Worker `walkthrough-redact-pii-worker.ts`

Pfad: `src/workers/ai/walkthrough-redact-pii-worker.ts` (neu).

Pattern-Reuse aus existing AI-Worker (z.B. `condense-worker.ts`):
- Polling-Loop: claim AI-Job mit `job_type='walkthrough_redact_pii'`.
- Lade walkthrough_session per `walkthroughSessionId` aus `payload`.
- Lade Original-Transkript-KU (source='walkthrough_transcript', evidence_refs.walkthrough_session_id=ws.id).
- Bedrock-Call ueber `bedrockClient.complete()` mit pii_redact-Prompt + Original-Text.
- INSERT knowledge_unit (source='walkthrough_transcript_redacted', evidence_refs={ original_kuId: original.id, walkthrough_session_id: ws.id }, body=redacted-Text, confidence='medium').
- ai_cost_ledger-Eintrag (existing function).
- Status-Maschine via `confirm-walkthrough-pipeline-step.ts` (NEU in MT-5): `redacting` → `extracting` (auto-enqueue Stufe 2 `walkthrough_extract_steps`-Job) — diese Auto-Enqueue ist MT-Vorbereitung fuer SLC-077.
- Failure-Handling: try/catch → setStatus `failed` + error_log mit category='walkthrough_pipeline_failure', stage='redact_pii'.

### F — Pipeline-Trigger nach Whisper

Pfad: `src/lib/walkthrough/pipeline-trigger.ts` (neu, oder als Teil von confirm-walkthrough-pipeline-step.ts).

Funktion `advanceWalkthroughPipeline(walkthroughSessionId)` mit Status-Maschinen-Switch (siehe ARCHITECTURE.md V5 Option 2 Pseudocode). Wird aus SLC-072 Whisper-Worker am Ende des Runs aufgerufen statt direkt `pending_review` zu setzen.

**Pflicht:** SLC-072-Whisper-Worker in dieser Slice **modifizieren**: Status-Update von `transcribing → pending_review` auf `transcribing → redacting` + ai_jobs-Enqueue fuer `walkthrough_redact_pii`.

## Micro-Tasks

### MT-1: Migration 087 Apply
- Goal: Status-Maschine + KU-Source-Werte additiv erweitert.
- Files: `sql/migrations/087_v5opt2_status_and_source_extension.sql` (neu).
- Expected behavior: Bestehende Werte gueltig, drei neue Status- + ein neuer Source-Wert akzeptiert.
- Verification: Hetzner-Apply via base64-Pattern, `pg_get_constraintdef('walkthrough_session_status_check'::regclass)` zeigt 11 Werte; `pg_get_constraintdef('knowledge_unit_source_check'::regclass)` zeigt 10 Werte. Pre-Apply-Backup-CSV erzeugt.
- Dependencies: none

### MT-2: PII-Pattern-Library (system-wide constant)
- Goal: Library als TypeScript-Konstante exportiert.
- Files: `src/lib/ai/pii-patterns/index.ts` (neu).
- Expected behavior: Import in Worker-Code liefert `PII_PATTERNS`-Objekt.
- Verification: `npm run build` PASS, Import-Test in MT-3 funktioniert.
- Dependencies: none (parallel zu MT-1)

### MT-3: Synthetische PII-Recall-Test-Suite (SC-V5-6)
- Goal: ≥90% Recall auf synthetischer Suite gegen real Bedrock.
- Files: `src/lib/ai/pii-patterns/__tests__/redaction-recall.test.ts` (neu), `src/lib/ai/pii-patterns/__tests__/fixtures/de-walkthroughs.ts` (neu, 50+ Saetze pro Kategorie).
- Expected behavior: Test-Run misst Recall ueber 350+ PII-Items, Assertion `recall >= 0.9`.
- Verification: `npm run test -- --run pii-patterns` mit `BEDROCK_REGION=eu-central-1` + `BEDROCK_MODEL_ID=anthropic.claude-sonnet-4-20250514-v1:0` ENV. Erwartete Kosten ~$0.01.
- Dependencies: MT-2

### MT-4: Bedrock-Prompt + Worker `walkthrough-redact-pii-worker.ts`
- Goal: Worker laeuft, schreibt redacted-KU, advanced Status auf `extracting`.
- Files: `src/lib/ai/prompts/walkthrough/pii_redact.ts` (neu), `src/workers/ai/walkthrough-redact-pii-worker.ts` (neu), `src/workers/index.ts` (modify — Job-Type-Registrierung).
- Expected behavior: Job laeuft, KU mit source='walkthrough_transcript_redacted' entsteht, walkthrough_session.status='extracting', Cost-Ledger-Eintrag.
- Verification: Vitest-Mock-Test (Bedrock-Mock) + Live-Smoke gegen Coolify-Worker (eine echte walkthrough_session pushen, Status-Verlauf beobachten).
- Dependencies: MT-1, MT-2

### MT-5: Pipeline-Trigger + SLC-072-Worker-Patch
- Goal: SLC-072-Whisper-Worker advanced auf `redacting` statt direkt `pending_review`.
- Files: `src/lib/walkthrough/pipeline-trigger.ts` (neu), `src/workers/ai/walkthrough-transcribe-worker.ts` (modify — assumes SLC-072 done).
- Expected behavior: Whisper-Output triggert PII-Worker via ai_jobs-Insert.
- Verification: End-to-End-Smoke nach SLC-072 + SLC-076 done — Live-Walkthrough von richard@bellaerts.de durchlaeuft Whisper → PII-Redact → status='extracting'.
- Dependencies: MT-4, sequenziell **nach** SLC-072

## Out of Scope

- Schritt-Extraktion (Stufe 2) → SLC-077.
- Auto-Mapping (Stufe 3) → SLC-078.
- Methodik-Review-UI → SLC-079.
- Per-Tenant-PII-Pattern-Override → V5.x (DEC-082 explizit deferred).

## Risks / Mitigations

- **R1 — Bedrock-Recall <90% auf synthetischer Suite**: Pattern-Library nachschaerfen (mehr Beispiele pro Kategorie), Prompt-Guidance verstaerken ("im Zweifel maskieren"). Slice-Block falls auch nach Iteration <85%.
- **R2 — Bedrock-Outage in Pipeline**: try/catch im Worker → status='failed' + error_log. Recovery via Cleanup-Cron in SLC-074 (Stale-Detection >1h in `redacting/extracting/mapping`).
- **R3 — Originale + Redacted KU-Pair-Drift**: evidence_refs.original_kuId Pflichtfeld verifizieren. Vitest-Test in MT-4 erzwingt Pair-Erzeugung.

## Verification

- Migration 087 live appliziert mit Pre-Apply-Backup.
- `npm run lint` 0/0.
- `npm run build` ohne Fehler.
- `npm run test -- --run pii-patterns` PASS (Recall ≥0.9).
- Live-Smoke: 1 echter Walkthrough durchlaeuft transcribing → redacting → extracting (status-Verlauf in DB belegbar).

## Pflicht-Gates

- **SC-V5-6 PII-Recall ≥90%** auf synthetischer Test-Suite (MT-3 muss gruen sein vor Slice-Closing).
- Migration 087 via `sql-migration-hetzner.md`-Pattern (kein lokaler Docker-Test).
- Bedrock-Region `eu-central-1` (DSGVO-Pflicht, data-residency-Regel).
- 0 PII-Pattern-Library-Drift zu Pattern-Library im Prompt (single source of truth = `index.ts`).

## Status

planned

## Created

2026-05-06
