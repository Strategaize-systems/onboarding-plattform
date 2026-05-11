# SLC-105 — Diagnose-Werkzeug Template + Light-Condensation-Pipeline + Bericht-Renderer (FEAT-045)

## STOP-GATE — BL-095 Inhalts-Workshop

**SLC-105 darf nicht starten** bevor BL-095 (Inhalts-Workshop Diagnose-Werkzeug, User-Verantwortung) liefert:
- 15-25 konkrete Mandanten-Fragen entlang der 6 MULTIPLIER_MODEL-Bausteine (Strukturelle KI-Reife, Entscheidungs-Qualitaet, Schriftlich festgehaltene Entscheidungen, SOPs, Unternehmerhandbuch, Workaround-Dunkelziffer).
- **Deterministische Score-Logik pro Frage** (Antwort-Wert → 0-100 Score-Mapping).
- Pflicht-Output-Aussage als Markdown-Footer-Snippet.

Ohne diese Inputs ist Auto-Finalize DGN-A (DEC-100) nicht tragbar — Fallback waere DGN-C (Hybrid mit Strategaize-Quick-Review), Architektur-Revisions-DEC waere noetig.

SLC-101..104 + SLC-106 koennen unabhaengig vor Workshop-Abschluss starten.

## Goal

Neues Template `partner_diagnostic` (15-25 Fragen + deterministische Score-Logik + Pflicht-Output-Aussage) + **Light-Condensation-Pipeline als Worker-Branch** in `src/workers/condensation/run.ts` ueber `template.metadata.usage_kind='self_service_partner_diagnostic'` (DEC-105). Auto-Finalize DGN-A schreibt KU direkt als `status='accepted'` mit `validation_layer.reviewer_role='system_auto'` + `block_checkpoint.checkpoint_type='auto_final'`. Diagnose-Bericht-Renderer als neue Server-Component-Familie `/dashboard/diagnose/[capture_session_id]` mit deterministischem Score-Visual + KI-Verdichtungs-Kommentar pro Block + Pflicht-Output-Aussage. Mandanten-Run-Flow `/dashboard/diagnose/start`. **Keine neuen Migrations** (CHECK-Erweiterungen kommen mit Migration 091 aus SLC-104). **Keine `lead_push_*`-Tabellen — Eingang "Ich will mehr" als Stub in SLC-105, Implementation in SLC-106.**

## Feature

FEAT-045 (Diagnose-Werkzeug Template + Light-Condensation-Pipeline + Bericht-Renderer). Pattern-Reuse: bestehende Condensation-Worker-Architektur (`src/workers/condensation/`), Bedrock-Client (`src/lib/llm.ts`), Cost-Ledger, FEAT-003 Questionnaire-Workspace-Pattern (sequenzieller Frage-Flow), FEAT-028 Handbuch-Reader Render-Pattern.

## In Scope

### A — Template-Eintrag `partner_diagnostic`

Pfad: `sql/migrations/091_v6_*` aus SLC-104 ist bereits durch — `template`-DML kommt als **separater idempotenter Seed-SQL-Block** in SLC-105 entweder als zusaetzliche Migration 091a (`091a_v6_partner_diagnostic_template_seed.sql`) oder als Server-Action-Bootstrapping. **Empfehlung**: separate Migration `091a` mit `INSERT INTO template (...) ON CONFLICT (slug, version) DO UPDATE SET ...` damit Re-Run sicher ist.

Template-Inhalt (aus BL-095 Workshop):

```json
{
  "slug": "partner_diagnostic",
  "version": "v1",
  "name": "Strategaize-Diagnose-Werkzeug",
  "language": "de",
  "blocks": [
    {
      "key": "ki_reife",
      "title": "Strukturelle KI-Reife",
      "order": 1,
      "questions": [...],     // Inhalts-Workshop liefert
      "score_rule": {...}      // Inhalts-Workshop liefert: deterministische Mapping-Regel
    },
    // ... 5 weitere Blocks
  ],
  "metadata": {
    "usage_kind": "self_service_partner_diagnostic",
    "required_closing_statement": "..."  // Markdown-Snippet aus Workshop
  }
}
```

**Wichtig**: Score-Logik (`score_rule`) ist deterministisch — keine KI involviert. Beispiel-Pattern (Workshop-detail-abhaengig):
- Likert-Antwort 1-5 → linear Score 0-100.
- Multi-Choice mit gewichteten Optionen → Score-Summe.
- Boolean (ja/nein) → 0 oder 100.

### B — Light-Condensation-Pipeline Worker-Branch

Pfad: `src/workers/condensation/run.ts` (modifiziert) + `src/workers/condensation/light-pipeline.ts` (NEU).

**Top-Level-Branch im bestehenden `run.ts`** nach Job-Pickup (DEC-105):

```typescript
// existing
const { capture_session_id } = job.metadata;
const session = await loadCaptureSession(capture_session_id);
const template = await loadTemplate(session.template_id);

// NEU SLC-105: Branch ueber usage_kind
if (template.metadata?.usage_kind === 'self_service_partner_diagnostic') {
  await runLightPipeline({ session, template, adminClient, bedrockClient, costLedger });
  return;
}

// existing Standard-Pipeline (proposed → review-loop)
await runStandardPipeline({ session, template, ... });
```

**`runLightPipeline`** in neuer Datei `light-pipeline.ts`:

```typescript
export async function runLightPipeline(input: {
  session: CaptureSession;
  template: Template;
  adminClient: SupabaseClient;
  bedrockClient: BedrockClient;
  costLedger: CostLedger;
}): Promise<void> {
  // 1. Lade alle Antworten der Session (knowledge_unit-Vorlaeufer oder direct from capture_session.answers JSONB)
  const answers = await loadAnswers(input.adminClient, input.session.id);

  // 2. Score-Compute deterministisch pro Block (KEIN Bedrock-Call)
  const scores = computeBlockScores(input.template.blocks, answers);

  // 3. Bedrock-Call: kommentierende Verdichtung pro Block (NICHT score-generierend)
  // Prompt-Template: "Hier sind die Antworten zu Block {block.title}. Score wurde berechnet: {score}.
  //                   Was faellt auf? Was sind die groessten Strukturluecken? Was waere realistische naechste Verbesserung?
  //                   Antworte in 2-3 Saetzen pro Block, deutsch, prosaisch (kein Bullet-Listen)."
  // LLMLocale='de'.
  const comments = await Promise.all(input.template.blocks.map(async (block) => {
    const prompt = buildLightPipelinePrompt({ block, answers, score: scores[block.key] });
    const response = await input.bedrockClient.complete({ prompt, ... });
    await input.costLedger.record({ tenantId: input.session.tenant_id, tokensIn: response.usage.input, tokensOut: response.usage.output, usd: response.usage.usd });
    return { blockKey: block.key, comment: response.text };
  }));

  // 4. BEGIN TX:
  //    INSERT knowledge_unit (status='accepted', source='questionnaire', metadata={ score, comment, score_rule_version }) pro Block
  //    INSERT validation_layer (reviewer_role='system_auto', action='accept', note='Auto-Finalize per DGN-A')
  //    INSERT block_checkpoint (checkpoint_type='auto_final')
  //    UPDATE capture_session SET status='finalized'
  // COMMIT.

  // 5. error_log INSERT: category='partner_diagnostic_finalized', metadata={ session_id, block_count, total_score_avg }
}

export function computeBlockScores(blocks: TemplateBlock[], answers: Record<string, unknown>): Record<string, number> {
  // Deterministische Score-Berechnung. Pro Block.score_rule applizieren.
  // Vitest-tauglich (Pure Function).
  // ...
}
```

**Hinweis zu CHECK-Constraint-Erweiterung**: `validation_layer.reviewer_role` muss `'system_auto'` zulassen und `block_checkpoint.checkpoint_type` muss `'auto_final'` zulassen — beides kommt mit Migration 091 aus SLC-104. **SLC-105 ist hart abhaengig von SLC-104 Migration 091 LIVE.**

### C — Mandanten-Run-Flow

Pfade: `src/app/dashboard/diagnose/start/page.tsx` (NEU) + `src/app/dashboard/diagnose/run/[capture_session_id]/page.tsx` (NEU) + `src/app/dashboard/diagnose/actions.ts` (NEU) + `src/components/diagnose/QuestionFlow.tsx` (NEU).

**`/dashboard/diagnose/start`**:
- Auth-Gate: `tenant_admin` UND `tenant_kind='partner_client'` (kein Lead-Push fuer Direkt-Kunden in V6, DEC-eingebracht). Direct-Clients sehen klare Hinweis-Page "Diagnose-Werkzeug nur fuer Mandanten ueber Partner verfuegbar — fuer Direkt-Kunden bald".
- Begruessungs-Block mit Partner-Branding (Reuse Branding-Resolver aus SLC-104).
- Hinweis-Text: "Etwa 15-20 Fragen, dauert ca. 8-12 Minuten. Sie koennen jederzeit unterbrechen und spaeter weitermachen."
- "Diagnose starten"-Button → Server Action `startDiagnoseRun` (existing FEAT-003 Pattern reuse, neue Capture-Session mit `template_id=<partner_diagnostic_v1>`, `capture_mode='questionnaire'`).
- Falls bereits laufende Diagnose (status='in_progress' oder 'finalized'): Re-Direct zur Run-Page oder Bericht-Page.

**`/dashboard/diagnose/run/[capture_session_id]`**:
- Sequenzieller Frage-Flow (analog Questionnaire-Mode FEAT-003, aber **linearer ohne Block-Submit-Granularitaet** — Run-Submit am Ende ueber alle Antworten).
- Optional Save-Draft-Funktion (Server-Action `saveDiagnoseDraft` updated `capture_session.answers` JSONB).
- Bei Submit: Server-Action `submitDiagnoseRun`:
  1. UPDATE `capture_session` SET `status='submitted'`, `answers=<full JSON>`.
  2. INSERT `ai_jobs` mit `job_type='knowledge_unit_condensation'`, `metadata={ session_id, usage_kind: 'self_service_partner_diagnostic' }` — der Worker-Branch (B) erkennt das Flag.
  3. Return `{ ok: true, redirectTo: '/dashboard/diagnose/[capture_session_id]/bericht-pending' }`.
- Mandant sieht Lade-Screen mit Progress ("Verdichtung laeuft, dauert ~30 Sekunden") + Polling auf `capture_session.status='finalized'`.

**`/dashboard/diagnose/[capture_session_id]/bericht-pending`**:
- Auto-Refresh / Server-Polling auf Session-Status alle 3s.
- Bei `status='finalized'`: Redirect zu Bericht-Page.
- Bei Fehler (status='failed'): Fehler-Banner + "Bitte erneut versuchen oder Strategaize kontaktieren".

### D — Diagnose-Bericht-Renderer

Pfade: `src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx` (NEU) + `src/components/diagnose/BerichtRenderer.tsx` (NEU) + `src/components/diagnose/ScoreVisual.tsx` (NEU) + `src/components/diagnose/BlockSection.tsx` (NEU).

**Bericht-Page** (`/bericht`):
- Server-Component Auth-Gate: aufrufender User muss capture_session.tenant_id == user.tenant_id ODER partner_admin (parent_partner_tenant_id) ODER strategaize_admin.
- Server-side: lade KUs + validation_layer (`reviewer_role='system_auto'` Filter) + block_checkpoint + Branding (Reuse SLC-104).
- Layout:
  - **Header**: Score-Visual (6 Balken oder Radar-Chart — V6 einfach gehalten, kein neues npm-Paket, ggf. Tailwind-only ASCII-Bar oder vorhandene shadcn-Charts wenn schon installed). Mandant-Tenant-Name + Datum + Partner-Display-Name.
  - **Pro Block**: `BlockSection` zeigt Block-Title + deterministischen Score (mit Visual-Bar) + KI-Verdichtungs-Kommentar (2-3 Saetze prosaisch).
  - **Pflicht-Output-Aussage**: Markdown-Footer aus `template.metadata.required_closing_statement` (per `react-markdown`, existing Setup aus FEAT-028).
  - **Sub-Karte "Ich will mehr von Strategaize"**: Stub in SLC-105 (Button mit "Coming Soon" oder disabled mit Hint "Verfuegbar nach SLC-106-Deploy"). Echter Lead-Push-Flow in SLC-106.
  - **"Bericht herunterladen"-Button**: V6 simple HTML-Print-Variant (`window.print()` mit print-friendly CSS). PDF-Export ist V6.1+ (kein npm-Paket-Add in V6).

### E — Score-Berechnung Vitest

Pfad: `src/workers/condensation/__tests__/light-pipeline-score.test.ts` (NEU).

Pure-Function-Tests fuer `computeBlockScores`:
- 6 Test-Faelle pro Block-Score-Logic-Typ (Likert, Multi-Choice, Boolean) — Inhalts-Workshop-spezifisch.
- Edge-Cases: leere Antworten, partial Antworten, ungueltige Werte → klare Errors.
- Mindestens 12 Vitest.

### F — Worker-Tests

Pfad: `src/workers/condensation/__tests__/light-pipeline.test.ts` (NEU) + `__tests__/run-branch.test.ts` (NEU).

- `runLightPipeline` mit Mock-Bedrock + Mock-DB: 4 Faelle (Happy / Bedrock-Error / DB-Tx-Fail / leere Antworten).
- Top-Level-Branch in `run.ts`: 2 Faelle (usage_kind matched → light pipeline, NULL → standard pipeline).
- Mindestens 6 Vitest.

### G — UI-Component-Tests + Browser-Smoke

- Vitest fuer Form-Flow (Frage-Flow, Save-Draft, Submit) — mindestens 6 Tests.
- Browser-Smoke (MT-N User-Pflicht): End-to-End-Run als Mandant: Login → /dashboard → "Diagnose starten" → Frage-Flow → Submit → Bericht erscheint mit deterministischem Score + KI-Kommentar.

## Acceptance Criteria

1. Mandant kann via `/dashboard/diagnose/start` die Diagnose end-to-end ohne menschlichen Eingriff durchlaufen (SC-V6-5).
2. Submit triggert Light-Condensation-Pipeline. Bericht wird in **< 60 Sekunden** generiert (typischer Bedrock-Latency, 6 Block × ~5-10s = ~30-60s).
3. Bericht enthaelt **deterministisch berechneten Score** aus Template-Score-Logic (Vitest-tauglich, kein KI-Output) (SC-V6-6).
4. Bericht enthaelt KI-Verdichtungs-Kommentar pro Block (Bedrock-LLM-Output, kommentierend, 2-3 Saetze).
5. Bericht enthaelt Pflicht-Output-Aussage am Ende (aus `template.metadata.required_closing_statement`).
6. `knowledge_unit`-Eintraege haben `status='accepted'` direkt nach Worker-Lauf (KEIN `proposed`-Zwischenstand, DEC-100).
7. `validation_layer`-Eintrag mit `reviewer_role='system_auto'`, `action='accept'`, `note='Auto-Finalize per DGN-A'` pro KU.
8. `block_checkpoint`-Eintrag mit `checkpoint_type='auto_final'` pro Block.
9. `capture_session.status='finalized'` nach Pipeline-Complete.
10. Bericht-Renderer respektiert Partner-Branding (SLC-104 Branding-Resolver wird im Layout durchlaufen).
11. **Tenant-Isolation**: Mandant von Partner A sieht NICHT Bericht von Mandant von Partner B (RLS aus SLC-101, kein neuer Pen-Test-Fall noetig — Knowledge-Unit-Matrix deckt das bereits ab).
12. Partner-Admin sieht Diagnose-Bericht seiner eigenen Mandanten read-only (Cross-Tenant via `partner_client_mapping`).
13. Strategaize-Admin sieht alle Diagnose-Berichte (Cross-Tenant).
14. **Bedrock-Kosten pro Run** werden in `ai_cost_ledger` protokolliert (V6-Erfolgsmessung — Cost pro Diagnose < $0.10 erwartet bei 6 Block × Sonnet-Verdichtungs-Prompt).
15. `template`-Eintrag `partner_diagnostic_v1` existiert nach Migration 091a Apply.
16. Worker-Branch funktioniert ueber `template.metadata.usage_kind`-Flag — Direkt-Kunden-Sessions ohne diesen Flag laufen weiter durch Standard-Pipeline (`proposed → review-loop`) — Regression-frei.
17. ESLint 0/0. `npm run build` PASS. Vitest neue Tests gruen (mind. 24 neue). `npm audit --omit=dev` 0 neue Vulns.

## Micro-Tasks

| # | Task | Files | Verify |
|---|------|-------|--------|
| MT-1 | Template-Seed Migration 091a anlegen | `sql/migrations/091a_v6_partner_diagnostic_template_seed.sql` (NEU) | `psql --syntax-check`; Workshop-Output (BL-095) als JSON eingearbeitet |
| MT-2 | Migration 091a Live-Apply auf Hetzner | Coolify-Container | Pre-Apply-Backup; Apply via base64+psql; `SELECT slug, version, metadata FROM template WHERE slug='partner_diagnostic'` zeigt korrekten Eintrag |
| MT-3 | Score-Compute deterministisch + Pure-Function Vitest | `src/workers/condensation/light-pipeline.ts` (NEU, computeBlockScores) + `__tests__/light-pipeline-score.test.ts` | 12+ Vitest PASS, alle Score-Logic-Typen deterministisch |
| MT-4 | `runLightPipeline` Worker-Funktion + Bedrock-Prompt + Tx-Logic + Vitest | `light-pipeline.ts` (NEU, runLightPipeline) + `__tests__/light-pipeline.test.ts` | 4 Vitest mit Mocks, Tx-Rollback verifiziert, Cost-Ledger-Schreibung verifiziert |
| MT-5 | Worker-Branch in `run.ts` + Branch-Vitest | `src/workers/condensation/run.ts` (modifiziert) + `__tests__/run-branch.test.ts` | 2 Vitest (usage_kind matched / NULL), Standard-Pipeline-Regression |
| MT-6 | Mandanten-Run-Flow Server Actions + UI `/dashboard/diagnose/start` + `/run/[id]` + Vitest | `src/app/dashboard/diagnose/start/page.tsx` + `run/[capture_session_id]/page.tsx` + `actions.ts` + `QuestionFlow.tsx` (alle NEU) | 6 Vitest fuer Actions, Build PASS |
| MT-7 | Lade-Screen `/bericht-pending` mit Polling | `src/app/dashboard/diagnose/[capture_session_id]/bericht-pending/page.tsx` (NEU) | Build PASS, Polling-Logic Vitest |
| MT-8 | Bericht-Renderer `/bericht` + ScoreVisual + BlockSection + Components | `src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx` (NEU) + `BerichtRenderer.tsx` + `ScoreVisual.tsx` + `BlockSection.tsx` (alle NEU) | Build PASS, Branding-Resolver durchlaeuft, Pflicht-Output-Aussage rendert |
| MT-9 | Direkt-Kunden-Sicht: `/dashboard/diagnose/start` zeigt Hinweis-Page wenn tenant_kind='direct_client' | (Auth-Gate in MT-6) | Vitest fuer Auth-Gate-Branch |
| MT-10 | Cross-Tenant-Sicht: partner_admin + strategaize_admin sehen Mandanten-Berichte | Routing/Auth-Erweiterung | RLS-Test verifiziert (kein neuer Pen-Test-Fall, bestehende Knowledge-Unit-Matrix deckt) |
| MT-11 | Quality-Gates: Lint + Build + Test + Audit + Cost-Audit fuer realen Bedrock-Run | (gesamt) | 0/0 Lint, Build PASS, alle Vitest gruen, 1 Live-Bedrock-Smoke-Run zeigt Cost < $0.10 in ai_cost_ledger |
| MT-12 | User-Pflicht-Browser-Smoke nach Coolify-Deploy | Live-URL | E2E als Mandant: Diagnose starten → 15-20 Fragen beantworten → Submit → in < 60s Bericht erscheint mit deterministischem Score + KI-Kommentar + Pflicht-Output-Aussage + Partner-Branding sichtbar; "Ich will mehr"-Button als Coming-Soon (SLC-106) |

## Out of Scope (deferred)

- Mehrere Diagnose-Template-Varianten parallel — V6 nur `partner_diagnostic_v1`
- **NL-Variante des Diagnose-Werkzeugs** → V6.1 (DEC-102): Inhalts-Workshop NL liefert nl-Template + nl-Bedrock-Prompt
- Berater-Override des Auto-Finalize-Berichts → V7+, falls je
- Re-Diagnose-Trigger (Mandant macht Diagnose 6 Monate spaeter erneut) → V7+
- Vergleichs-View "Score vor 6 Monaten vs. heute" → V7+
- Aggregierte Markt-Intelligence-View ueber alle Diagnosen → V7+
- PDF-Export des Berichts → V6.1+ (V6 nur HTML-Print)
- "Ich will mehr"-Lead-Push-Flow → SLC-106
- Inhalts-Workshop selbst (Score-Logik + Fragen) — BL-095 (parallel zum V6-Code-Bau)
- DGN-B (Strategaize-Quick-Review-Pool) oder DGN-C (Hybrid) → verworfen per DEC-100

## Tests / Verifikation

- **Vitest-Mindestumfang**: 24+ neue Tests (Score-Compute 12 + Worker-Pipeline 6 + Server-Actions 6 + Component-Tests einige).
- **Live-Migration-Apply**: MT-2 via sql-migration-hetzner.md Pattern.
- **Live-Bedrock-Smoke** (MT-11): 1 echter Diagnose-Run gegen Bedrock eu-central-1 zur Kosten-Verifikation + Latency-Messung.
- **Browser-Smoke** (MT-12): End-to-End als Mandant auf Live-URL.

## Risks

- **R-105-1** Inhalts-Workshop-Quality (BL-095): wenn Score-Logik nicht tragbar oder zu offene Fragen, ist DGN-A nicht stabil. **Mitigation**: Stop-Gate erzwingt Workshop-Abschluss vor SLC-105-Start. Falls Workshop schwach: Fallback auf DGN-C (Hybrid) per Architektur-Revisions-DEC + zusaetzlicher Slice — kein SLC-105-Code-Aufwand verloren, nur Pipeline-Logic muss um Review-Step erweitert werden.
- **R-105-2** Bedrock-Cost-Spike: bei 5-10 Diagnosen/Woche × 6 Bloecke × Sonnet-Verdichtung = ~30-60 Calls/Woche. Bei $0.003/1k input-tokens und ~500 input-tokens/Block = ~$0.045/Woche. **Vernachlaessigbar fuer V6-Pilot-Phase.** Cost-Ledger-Audit in MT-11 gibt klares Bild.
- **R-105-3** Bedrock-Latency: 6 sequenzielle Calls = 30-60s Wait. **Mitigation**: `Promise.all` fuer parallele Block-Comments. Falls Bedrock-Rate-Limit hit: Serial-Fallback mit kleinem Backoff (existing Pattern aus Standard-Pipeline).
- **R-105-4** `template.metadata.usage_kind`-Flag-Branch im Worker koennte Standard-Pipeline brechen wenn Branch-Logic falsch. **Mitigation**: in MT-5 Pflicht-Vitest fuer beide Branches; Regression-Smoke gegen Demo-Tenant Standard-Pipeline.
- **R-105-5** CHECK-Constraint-Erweiterung aus SLC-104 muss live sein bevor SLC-105 deployed wird. **Mitigation**: Pre-Condition explizit dokumentiert (SLC-105 abhaengig von SLC-104 Migration 091 LIVE).
- **R-105-6** Sub-Karte "Ich will mehr" als Stub in SLC-105 koennte UX-verwirrend sein (Mandant klickt, nichts passiert). **Mitigation**: Button-Label "Verfuegbar in Kuerze" + disabled-State, klare Hinweis-Tooltip.
- **R-105-7** Auto-Finalize ohne Berater-Loop ist V6-Premiere. Reputations-Risk wenn Bericht-Qualitaet schwach. **Mitigation**: deterministische Score-Logik (kein KI-Hallucinations-Risiko auf Kern-Aussage), KI nur kommentierend; Pflicht-Output-Aussage stellt Erwartung ehrlich.

## Cross-Refs

- DEC-100 (Auto-Finalize DGN-A)
- DEC-104 (Diagnose=Template-Variante, kein neuer Capture-Mode)
- DEC-105 (Light-Pipeline als Worker-Branch ueber template.metadata.usage_kind)
- BL-095 (Inhalts-Workshop, Stop-Gate)
- FEAT-045 (Spec)
- ARCHITECTURE.md V6-Sektion (Data Flow D — Diagnose-Werkzeug Light-Condensation-Pipeline)
- V4.1 FEAT-028 (Handbuch-Reader Render-Pattern Reuse)
- V1 FEAT-003 (Questionnaire-Workspace-Pattern Reuse)
- V2 FEAT-016 (Diagnosis Layer als Vorlage)
- AWS Bedrock Claude Sonnet eu-central-1 (Data-Residency)

## Dependencies

- **STOP-GATE**: BL-095 Inhalts-Workshop muss 15-25 Fragen + Score-Logik + Pflicht-Output-Aussage liefern. **SLC-105 darf nicht starten ohne diese Inputs.**
- **Pre-Conditions**: SLC-101 done (Schema), SLC-103 done (Mandanten-Tenant existiert + Mandanten-Dashboard-Stub), SLC-104 done (Migration 091 mit CHECK-Constraint-Erweiterungen `system_auto` + `auto_final` LIVE + Branding-Resolver). SLC-102 done (Partner-Dashboard, fuer Cross-Tenant-Sicht der Berichte).
- **Blockt**: SLC-106 (Lead-Push lebt im Bericht-Renderer als "Ich will mehr"-Klick).
- **Soft-Pre-Condition**: SLC-106 koennte technisch vor SLC-105 starten, aber ohne Diagnose-Bericht gibt es keinen User-Flow fuer Lead-Push. SLC-105 vor SLC-106 ist die natuerliche Reihenfolge.
