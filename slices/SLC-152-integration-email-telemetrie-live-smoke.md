# SLC-152 — Integration + Email-Versand-Branch + Telemetrie + Live-Smoke Founder-Test

**Version:** V8
**Feature:** FEAT-066 (Email-Integration) + FEAT-058-Reuse (Telemetrie) + FEAT-060-Reuse (Email-Versand-Branch)
**Backlog:** BL-131 (Schluss-Slice) + BL-133 (zweistufiger Versand Mandant + Steuerberater)
**Status:** planned
**Created:** 2026-05-29
**Priority:** High
**Estimate:** ~4-6h Code-Side + ~1-2h Founder Live-Smoke + ~30min Master-Merge + Cleanup
**Worktree Branch:** `v8-mandanten-report` (Cumulative-Single-Branch — letzte Slice der V8-Sequenz, Master-Merge am Schluss)

## Slice Goal

Liefert die **End-to-End-Integration** des V8 Mandanten-Reports:

1. **Email-Versand-Branch** in FEAT-060 Server-Action `sendDiagnoseReportByEmail` — Template-Variant-Switch auf `template.metadata.usage_kind === 'mandanten_report_teaser_v1'` ruft den V8-Renderer (SLC-150/151) statt V7.2-Renderer
2. **Email-Template-Anpassung** fuer V8: Subject + Body mit Mandant-Adressat, Pflicht-Erklaerung "Sie sind Eigentuemer des Berichts, koennen ihn an Ihren Steuerberater weiterleiten" (BL-133, Founder-Direktive 2026-05-29)
3. **Telemetrie-Events** `v8_report_generated` + `v8_email_sent` + `v8_pdf_size_bytes` via FEAT-058-Reuse (`diagnose_event`-Tabelle)
4. **Bericht-Pending-Page Frontend** in V8-Run-Flow — V8-Snapshot-Reader (liest `capture_session.metadata.v8_report_snapshot`) + PDF-Download-Button + Email-Send-Button
5. **Live-Smoke Founder-Test** End-to-End: Test-Mandant durchlaeuft komplette V8-Diagnose (47 Fragen) → SUI-Snapshot generiert → PDF gerendert → Email versendet → Founder oeffnet Email + PDF auf Mobile + Desktop
6. **Master-Merge** `v8-mandanten-report` → `main` (Fast-Forward erwartet) + Worktree-Cleanup + Records-Update + Coolify-Redeploy + Post-Live-Smoke

Plus **Gesamt-V8-/qa** als Pflicht-Gate vor Master-Merge (Slice-Schluss-/qa + Cross-Slice-Integration-Verification).

## In Scope

- **Email-Versand-Branch** in `src/lib/email/send-diagnose-report.ts` (V7.2 FEAT-060) — Switch auf `template.metadata.usage_kind`-Detection
- **Email-Template V8** `src/lib/email/templates/mandanten-report-v8.ts` mit:
  - Subject: "Ihre Strategaize-Diagnose — Wo Ihre Firma heute steht"
  - Body: Mandant-direkt-Adressat ("Sie haben den Fragebogen durchlaufen..."), PDF-Anhang-Verweis, Pflicht-Hinweis "Sie koennen diesen Bericht an Ihren Steuerberater weiterleiten — er kennt Ihre steuerlichen Strukturen und kann Modul 0 + Modul 10 mit Ihnen besprechen" (BL-133)
  - Strategaize-Footer (Datenschutz + Impressum Pflicht, [[feedback-pflicht-footer-server-side]])
- **PDF-Anhang-Generation** ruft `renderMandantenReportV2Pdf(input)` aus SLC-150/151 + appendsThe-Buffer als Email-Attachment (Filename: `Strategaize-Diagnose-{datum-iso}.pdf`)
- **Bericht-Pending-Page Frontend** `src/app/dashboard/diagnose/[id]/bericht/page.tsx` (V8-Variant via Run-Page-Switch wie SLC-149 etabliert):
  - V8-Snapshot-Reader (`capture_session.metadata.v8_report_snapshot`)
  - SUI-Hero-Card mit Score + Klassifizierung (Live-Web-Variante des PDF-Hero)
  - PDF-Download-Button (ruft Server-Action `downloadMandantenReportV2Pdf(captureSessionId)` → triggert PDF-Render → returns Buffer als Blob-Download)
  - Email-Send-Button (oeffnet existierendes `SendReportByEmailModal` aus V7.2, mit V8-Template-Variant-Flag)
  - V8-Snapshot-Lesepfad isoliert: weder Bericht-Snapshot V6.3 noch V7.2-Bericht-Page betroffen
- **Telemetrie-Events V8-spezifisch**:
  - `v8_report_generated` beim Auslösen von `finalizeMandantenReport` (SLC-148 MT-6 Server-Action)
  - `v8_email_sent` nach erfolgreichem `sendDiagnoseReportByEmail` mit V8-Branch
  - `v8_pdf_size_bytes` als Property auf `v8_email_sent` (Buffer-Length)
  - `v8_pdf_render_failed` bei Render-Errors mit Error-Class
- **Live-Smoke Founder-Test** End-to-End mit Founder-Test-Tenant + Test-Mandant
- **Gesamt-V8-/qa** vor Master-Merge: SC-V8-1..N aus FEAT-063/064/065/066 (kombiniert) End-to-End validiert
- **Master-Merge** `v8-mandanten-report` → `main` (Fast-Forward) + Worktree-Cleanup per [[feedback-worktree-cleanup-sequence-pflicht]]
- **Coolify-Redeploy** auf main HEAD + Post-Live-Smoke (Production-Inspect)
- **Records-Update** alle V8-Slices/Features/Backlog/Roadmap auf `done` / `deployed` / `released`

## Out of Scope

- **StB-Weiterleitungs-Workflow im Frontend** (Click-Button "An StB weiterleiten" mit Token-Generation) — V8.1+ BL-134 Lead-Conversion-CTA-Erweiterung
- **Strategaize-Admin-Freigabe-Pfad** (`released_for_strategaize_review = true` setzen) — V8.1+ BL-134 (Privacy-Flow Phase 2)
- **Storage-Cache fuer PDF** (Re-Render on demand statt cached) — V8.1+ Optimierung
- **EditableText fuer PDF-Texte** im Admin-UI — V8.1+
- **Mehrsprachige Email-Templates** (NL/EN) — V8.1+
- **Conversion-Tracking** CTA-Page-StB-Click-through — V8.1+
- **Voll-LLM-Augmentation** der Stufen-Texte — V8.1+ (DEC-159 deterministisch in V8.0)
- **Cross-System-Lead-Push** (Business-System-Adapter) — V8.2+ (kein Co-Locator zu V6 BL-106 Pattern)
- **V8 SLC-150/151 Re-Polish nach Live-Smoke** — innerhalb Slice nur Hotfix-Class-Items, neue Visual-Polish-Wuensche werden in BL-Items abgelegt

## Pre-Conditions

- ✓ SLC-148 done (Snapshot-Format + Server-Action `finalizeMandantenReport` LIVE, Migration 102 LIVE)
- ✓ SLC-149 done (Frontend-Components LIVE, V8-Run-Flow code-side komplett, Run-Page-Switch etabliert)
- ✓ SLC-150 done (Renderer-Foundation + Wheel + 3 Phase-A-Pages LIVE code-side)
- ✓ SLC-151 done (9 Modul-Pages + Hausaufgaben + Hebel + Reflexion + CTA LIVE code-side, Tonalitaets-Audit PASS)
- ✓ V7.2 FEAT-060 `sendDiagnoseReportByEmail` LIVE (Email-Versand-Pattern etabliert, REL-021)
- ✓ FEAT-058 Telemetrie `diagnose_event`-Tabelle LIVE (V7.2 SLC-139)
- ✓ Worktree `v8-mandanten-report` HEAD nach SLC-151 Records-Commit
- ✓ BL-132 Privacy-Flow Option A bereits implementiert in SLC-148 MT-2 (capture_session-Flag + RLS-Gate) — V8.0 nutzt Flag NICHT (Default false), Founder-Direktive 2026-05-29 erweitert via SLC-152 Email-Body um Mandant-Erklaerung

## Micro-Tasks

### MT-1: Email-Versand-Branch + V8-Email-Template
- **Goal**: V7.2 Server-Action `sendDiagnoseReportByEmail` um Template-Variant-Switch erweitern. V8-Email-Template als neue Datei.
- **Files**:
  - `src/lib/email/send-diagnose-report.ts` (additiv) — Branch auf `template.metadata.usage_kind === 'mandanten_report_teaser_v1'`
  - `src/lib/email/templates/mandanten-report-v8.ts` (NEU) — Subject + Body mit Mandant-Adressat
  - `src/lib/email/templates/__tests__/mandanten-report-v8.test.ts` (NEU) — Vitest fuer Pure-Logic-Helpers
- **Expected Behavior**:
  - Server-Action liest `template.metadata.usage_kind` aus DB
  - Bei `mandanten_report_teaser_v1`: ruft `renderMandantenReportV2Pdf(input)` aus SLC-150 + V8-Email-Template
  - Bei `partner_diagnostic_v1` ODER anderen: V7.2-Pfad unveraendert (Reuse `renderDiagnoseReportPdf` aus `src/lib/pdf/diagnose-report.tsx`)
  - V8-Subject: "Ihre Strategaize-Diagnose — Wo Ihre Firma heute steht"
  - V8-Body (Markdown → HTML via `remark` + `remark-html` aus V7.2):
    - Mandant-Adressat: "Sie haben den Strategaize-Uebergabe-Fragebogen durchlaufen. Im Anhang finden Sie Ihren persoenlichen Bericht — Sie sind Eigentuemer dieses Berichts."
    - PDF-Anhang-Verweis: "Der vollstaendige Bericht ist als PDF im Anhang dieser E-Mail."
    - **Pflicht-Hinweis BL-133**: "Sie koennen diesen Bericht an Ihren Steuerberater weiterleiten — er kennt Ihre steuerlichen Strukturen und kann Modul 0 + Modul 10 mit Ihnen besprechen. Diese Diagnose ist Ihre Entscheidung, wer sie sieht."
    - CTA: "Bei Fragen oder fuer ein Folgegespraech: [Strategaize-Kontakt]"
  - Filename: `Strategaize-Diagnose-{YYYY-MM-DD}.pdf`
- **Verification**:
  - Vitest: Branch-Logic Mock `template.metadata.usage_kind` → ruft korrekten Renderer + Template
  - Vitest: V8-Subject + V8-Body-Markdown-Render → enthaelt Mandant-Adressat + BL-133-Hinweis + Strategaize-Footer
  - Vitest: V6.3 partner_diagnostic_v1 → V7.2-Pfad unveraendert (Co-Existenz)
- **Dependencies**: SLC-150 + SLC-151 (Renderer LIVE), V7.2 FEAT-060

### MT-2: Telemetrie-Events V8-spezifisch
- **Goal**: 4 neue Event-Types in `diagnose_event` fuer V8-Lifecycle (Generated + Email-Sent + PDF-Size + Render-Failed).
- **Files**:
  - `src/lib/diagnose/telemetry.ts` (additiv aus FEAT-058) — neue Track-Functions `trackV8ReportGenerated(sessionId)` + `trackV8EmailSent(sessionId, pdfSize)` + `trackV8PdfRenderFailed(sessionId, error)`
  - `src/app/dashboard/diagnose/actions.ts` (additiv) — `finalizeMandantenReport` ruft `trackV8ReportGenerated` nach erfolgreichem Snapshot-Write
  - `src/lib/email/send-diagnose-report.ts` (additiv aus MT-1) — `trackV8EmailSent` nach SMTP-Success, `trackV8PdfRenderFailed` im catch-Block
  - `src/lib/diagnose/__tests__/telemetry-v8.test.ts` (NEU) — Vitest fuer V8-Tracker
- **Expected Behavior**:
  - `trackV8ReportGenerated(sessionId)` → INSERT `diagnose_event` `{event_type: 'v8_report_generated', session_id, properties: {timestamp}}`
  - `trackV8EmailSent(sessionId, pdfSize)` → INSERT `{event_type: 'v8_email_sent', session_id, properties: {pdf_size_bytes: pdfSize, timestamp}}`
  - `trackV8PdfRenderFailed(sessionId, error)` → INSERT `{event_type: 'v8_pdf_render_failed', session_id, properties: {error_class, error_message_snippet, timestamp}}`
  - Reuse Pure-Logic-Pattern aus FEAT-058 (`recordDiagnoseEvent`-Helper)
- **Verification**:
  - Vitest: Pure-Logic `formatV8TelemetryProperties` returns korrekte JSONB-Struktur
  - Live-Smoke MT-5 prueft `diagnose_event`-Rows nach Founder-Test
- **Dependencies**: SLC-148 MT-6 (`finalizeMandantenReport`), MT-1 (Email-Versand-Branch)

### MT-3: Bericht-Pending-Page Frontend V8-Variant + Snapshot-Reader
- **Goal**: V8-Bericht-Pending-Page mit Snapshot-Reader + PDF-Download + Email-Send-Button. Run-Page-Switch wie SLC-149 etabliert.
- **Files**:
  - `src/app/dashboard/diagnose/[id]/bericht/page.tsx` (additiv) — Switch auf `template.metadata.usage_kind === 'mandanten_report_teaser_v1'` rendert V8-Variant, sonst V6.3-Bestand (strict unveraendert)
  - `src/app/dashboard/diagnose/[id]/bericht/v8-bericht-renderer.tsx` (NEU) — V8-Web-Variant (Server-Component)
  - `src/app/dashboard/diagnose/actions.ts` (additiv) — neue Server-Action `downloadMandantenReportV2Pdf(captureSessionId): Promise<{buffer: ArrayBuffer, filename: string}>` (oder Response-Streaming)
  - `src/components/diagnose/v8-bericht-actions.tsx` (NEU, Client-Component) — Download-Button + Email-Send-Button-Trigger
- **Expected Behavior**:
  - Server-Component liest `capture_session.metadata.v8_report_snapshot` via Server-Side-Supabase-Client
  - Render-Logic:
    - SUI-Hero-Card mit `{snapshot.sui}` + `{snapshot.classification.label}` + `{snapshot.classification.meaning}`
    - Modul-Score-Liste (kompakte Web-Variante von Page 3 Modul-Profil)
    - Hebel-Liste (kompakte Web-Variante von Page 14)
    - Hausaufgaben-Liste falls non-empty
    - Reflexion-Liste falls non-empty
  - Action-Buttons (Client-Component):
    - "Als PDF herunterladen" → ruft `downloadMandantenReportV2Pdf` Server-Action → Browser-Download
    - "Per E-Mail senden" → oeffnet existierendes `SendReportByEmailModal` aus V7.2 mit V8-Template-Variant-Flag
  - V8-Web-Variant ist Web-Companion zum PDF, NICHT Replace — PDF bleibt Pflicht-Output
  - V6.3-Bestand `BerichtRenderer` strict unveraendert (Co-Existenz analog SLC-149 Run-Page-Switch)
- **Verification**:
  - Live-Smoke MT-5 oeffnet Bericht-Page auf Mobile + Desktop
  - Vitest fuer Pure-Logic-Render-Helpers
  - Git-Diff bestehender BerichtRenderer-Files = 0
- **Dependencies**: MT-1 (Email-Modal Reuse mit V8-Flag), SLC-148 MT-6 (Snapshot-Persistenz)

### MT-4: Code-Side /qa SLC-152 + Gesamt-V8-/qa
- **Goal**: Slice-Schluss /qa code-side + Gesamt-V8-/qa als Pflicht-Gate vor Master-Merge.
- **Files**:
  - `reports/RPT-XXX.md` (NEU) — Code-Side /qa Slice-Schluss-Report
  - `reports/RPT-XXX.md` (NEU) — Gesamt-V8-/qa Report (kombiniert SC-V8-1..N aus FEAT-063/064/065/066)
- **Expected Behavior** (code-side /qa SLC-152):
  - tsc EXIT=0 Repo-weit
  - ESLint SLC-152-Scope EXIT=0
  - Vitest SLC-152-Scope alle PASS (mandanten-report-v8-template + telemetry-v8 + bericht-actions-logic)
  - Wiring-Verification: V8-Email-Branch ruft V8-Renderer, V6.3-Branch unveraendert
  - Stub-Detection: 0 Stubs in SLC-152-Files
- **Expected Behavior** (Gesamt-V8-/qa):
  - **SC-V8-Template-Daten (FEAT-063)**: Migration 102 idempotent, 47 Fragen LIVE, Stufen-Lookup 45 Eintraege, V6.3-Co-Existenz garantiert
  - **SC-V8-Fragebogen-UI (FEAT-064)**: 3 Antwort-Schemata rendern, Switch-Logik korrekt, Mobile-Layout >=44px Touch-Target
  - **SC-V8-SUI-Engine (FEAT-065)**: 7 Pure-Functions deterministisch, AC-1..7 PASS via Vitest, Server-Action `finalizeMandantenReport` LIVE
  - **SC-V8-Renderer (FEAT-066)**: 17-Seiten-PDF rendert, Tonalitaets-Audit PASS, Visual-Akzeptanz Founder-Verdict
  - **SC-V8-Integration (SLC-152)**: Email-Branch funktioniert, Telemetrie-Events trackt, Bericht-Page rendert V8-Snapshot
  - **SC-V8-V6.3-Co-Existenz**: partner_diagnostic_v1-Pfad weiter funktional, V7.2-Renderer unveraendert, V6.3-Email-Versand weiter funktional
  - **SC-V8-Quality-Gates**: tsc + ESLint EXIT=0, Vitest Repo-weit PASS, `npm audit --omit=dev` 0 neue Vulns
- **Verification**:
  - /qa-Reports PASS
  - 0 Blocker / 0 High / 0 Medium fuer Gesamt-V8 — alle SC PASS oder dokumentiert mit Begruendung
- **Dependencies**: MT-3

### MT-5: Live-Smoke Founder-Test End-to-End + Master-Merge + Coolify-Redeploy
- **Goal**: Founder durchlaeuft komplette V8-Diagnose End-to-End auf production (oder Staging) → Email + PDF empfangen → visuell + inhaltlich validieren → bei PASS: Master-Merge.
- **Files**:
  - `reports/RPT-XXX.md` (NEU) — Live-Smoke-Report mit Founder-Verdict
  - `docs/RELEASES.md` — REL-XXX V8.0 Mandanten-Report-Port (Datum + Scope + Summary + Risks + Rollback-Notes)
  - `docs/STATE.md` — Current-Focus auf V8 RELEASED
  - `slices/INDEX.md` — SLC-152 status `done`, alle V8-Slices `deployed`
  - `planning/backlog.json` — BL-128/129/130/131/133 alle `done`
  - `planning/roadmap.json` — V8 status `released`
  - `features/INDEX.md` — FEAT-063/064/065/066 alle `deployed`
- **Expected Behavior** (Live-Smoke):
  - Pre-Test-Setup: Founder-Tenant + Test-Mandant-User mit V8-Template (`exit-readiness-teaser-v1`) zugewiesen
  - Live-Test-Flow:
    1. Login als Test-Mandant
    2. /dashboard/diagnose/start → V8-Welcome-Page sehen
    3. /dashboard/diagnose/run/[id] → 47 Fragen durchklicken (5 Hygiene + 37 Skala + 5 Reflexion)
    4. Submit → `finalizeMandantenReport` triggert
    5. /dashboard/diagnose/[id]/bericht → V8-Web-Variant rendert mit SUI + Klassifizierung
    6. "Per E-Mail senden" → Email an founder-test@bellaerts.de empfangen
    7. Email oeffnen + PDF-Anhang oeffnen → 17-Seiten-PDF visuell validieren
    8. Mobile-Test: Email-Inbox + PDF-Anhang auf Smartphone oeffnen
  - Telemetrie-Check (post-Test): `diagnose_event` SQL-Query → `v8_report_generated` + `v8_email_sent` Rows existieren
  - error_log-Check (post-Test): keine `v8_pdf_render_failed` oder `smtp_send_failed`
  - Cleanup: Test-Daten DELETE (Test-Capture-Session + Test-User + Test-Mandant) — optional
- **Expected Behavior** (Master-Merge + Cleanup):
  - Bei Live-Smoke PASS:
    - `git checkout main`
    - `git merge --ff-only v8-mandanten-report`
    - `git push origin main`
    - User-Coolify-Redeploy auf main HEAD
    - Post-Redeploy-Health-Check (Container-Status, error_log scan)
    - Worktree-Cleanup per [[feedback-worktree-cleanup-sequence-pflicht]]:
      ```powershell
      cmd /c rmdir c:\strategaize\strategaize-onboarding-plattform-v8\node_modules
      git worktree remove c:\strategaize\strategaize-onboarding-plattform-v8
      ```
  - Bei Live-Smoke FAIL:
    - Hotfix-Class-Issues: in SLC-152 fixen, Re-Test
    - Strukturelle Issues (Renderer-Drift, Snapshot-Format-Drift, Email-Routing-Bug): Rollback-Decision via /doctor oder /rollback
- **Verification**:
  - Live-Smoke-Verdict dokumentiert mit Screenshots (PDF + Email + Mobile-View)
  - Master-Merge HEAD-SHA in REL-XXX
  - 18-24h-Beobachtungs-Window-Start dokumentiert (analog V7.4/V7.7-Pattern)
- **Dependencies**: MT-4 (Gesamt-V8-/qa PASS)

### MT-6: Post-Launch-Window + STABLE-Bestaetigung
- **Goal**: 18-24h-Beobachtungs-Window-Pattern wie V7.7 (RPT-350 Fruehentscheid-Memory-Pattern moeglich falls Polish-Only).
- **Files**:
  - `reports/RPT-XXX.md` (NEU) — /post-launch V8 STABLE-Report
  - `docs/RELEASES.md` (additiv) — REL-XXX Post-Launch-Entry
  - `docs/STATE.md` — Last-Stable-Version auf V8 setzen
- **Expected Behavior**:
  - 18-24h-Window-Start (oder Frueh-Entscheid pruefen per [[feedback-post-launch-fruehentscheid-polish-only]] falls applicable — V8 ist KEIN Polish-Only-Release, sondern substanzielle Feature-Iteration → 18-24h voll)
  - Monitoring waehrend Window:
    - error_log scan auf `v8_pdf_render_failed`, `smtp_send_failed`, `finalize_mandanten_report_failed`
    - Container-Health (app + db) jede 4h
    - `diagnose_event`-Volume-Check (sind V8-Events erwartungsgemaess?)
  - Post-Window-Verdict:
    - **STABLE** (0 Production-Issues): V8 als Last-Stable-Version markieren, /post-launch Done-Note
    - **DEGRADED**: Issue-Triage + Hotfix-Slice V8.0.1 oder Rollback per /rollback
- **Verification**:
  - /post-launch-Report mit STABLE-Verdict
  - Records-Update (Last-Stable-Version)
- **Dependencies**: MT-5 (Master-Merge + Coolify-Redeploy gepusht)

## Acceptance Criteria (Integration + Live-Smoke + Release — aus FEAT-066 AC-13/14 + SLC-152-spezifisch + Gesamt-V8)

- **AC-13 Email-Versand integriert** (FEAT-066 AC-13): FEAT-060-Server-Action erkennt V8-Template-Sessions und nutzt V2-Renderer.
- **AC-14 Live-Smoke End-to-End** (FEAT-066 AC-14): Founder-Test-Mandant durchlaeuft komplette Diagnose, erhaelt PDF per Email, oeffnet PDF auf Mobile + Desktop, validiert visuell + inhaltlich. Smoke-Report dokumentiert.
- **AC-SLC-152-1 V8-Email-Template korrekt**: Subject + Body korrekt, BL-133-Pflicht-Hinweis "Sie koennen den Bericht an Ihren Steuerberater weiterleiten" enthalten.
- **AC-SLC-152-2 V8-Bericht-Page LIVE**: Web-Variant rendert Snapshot, Download-Button + Email-Send-Button funktional.
- **AC-SLC-152-3 Telemetrie-Events V8 funktional**: `v8_report_generated` + `v8_email_sent` + `v8_pdf_size_bytes` Rows in `diagnose_event` nach Live-Smoke.
- **AC-SLC-152-4 V6.3-Co-Existenz**: V6.3 partner_diagnostic_v1-Email + Bericht-Page weiter funktional (Vitest + Live-Smoke 2. Test mit V6.3-Template).
- **AC-SLC-152-5 Master-Merge PASS**: `v8-mandanten-report` → `main` Fast-Forward, kein Conflict, push erfolgreich.
- **AC-SLC-152-6 Coolify-Redeploy PASS**: Production-App-Container healthy, V8-Welcome-Page accessible, error_log clean.
- **AC-SLC-152-7 Quality-Gates**: tsc EXIT=0, ESLint EXIT=0, Vitest Repo-weit PASS, `npm audit --omit=dev` 0 neue Vulns.
- **AC-Gesamt-V8-1 Founder-Verdict-PDF-Output**: 17-Seiten-PDF "wuerde ich einem StB schicken" → Ja. [[feedback-design-premium-look-pflicht]] erfuellt.
- **AC-Gesamt-V8-2 Tonalitaets-Audit PASS**: 0 Trefferliste in `audit-v8-tonality.mjs` Run (SLC-151 MT-7 Reuse).
- **AC-Gesamt-V8-3 V8-Release-Records LIVE**: REL-XXX in RELEASES.md, roadmap V8 → released, FEAT-063/064/065/066 → deployed, alle V8-Slices → deployed in slices/INDEX.md.
- **AC-Gesamt-V8-4 V6.3 + V7.2-Bestand unveraendert**: partner_diagnostic_v1 + V7.2-Renderer + V7.2-Email-Versand funktionieren weiter (Live-Smoke 2. Test).

## Wiring-Verification-Liste

- ✓ `template.metadata.usage_kind` → V7.2 Email-Action Branch → V8-Renderer ODER V7.2-Renderer
- ✓ V8-Email-Template + V8-PDF-Buffer → SMTP-Versand → Mandant-Inbox
- ✓ `capture_session.metadata.v8_report_snapshot` → V8-Bericht-Page Server-Component
- ✓ V8-Bericht-Page Download-Button → `downloadMandantenReportV2Pdf` Server-Action → PDF-Buffer-Response
- ✓ V8-Bericht-Page Email-Button → `SendReportByEmailModal` (V7.2 Reuse) → V7.2-Email-Action → V8-Branch
- ✓ `trackV8ReportGenerated` (MT-2) ← `finalizeMandantenReport` (SLC-148 MT-6) erfolgreich
- ✓ `trackV8EmailSent` (MT-2) ← V7.2-Email-Action V8-Branch SMTP-Success
- ✓ V6.3 partner_diagnostic_v1 → V7.2-Renderer + V7.2-Email-Template (UNVERAENDERT, Co-Existenz)
- ✓ V6.3 BerichtRenderer (`src/app/dashboard/diagnose/[id]/bericht/page.tsx` Non-V8-Branch) → V6.3-Bestand UNVERAENDERT

## Risks / Notable Concerns

- **R-1 PDF-Anhang-Size-Spike**: 17-Seiten-PDF mit Custom-Fonts + Wheel-SVG koennte >5MB werden → SMTP-Provider-Limit-Risiko.
  - **Mitigation**: MT-2 Telemetry `v8_pdf_size_bytes` trackt — wenn >3MB pro Live-Smoke: SLC-152.1-Hotfix mit Font-Subsetting / Image-Compression. SMTP-Coolify-Postfix-Setup hat standardmaessig 10MB Limit (OK).
- **R-2 V8-Email-Template-Drift gegen V7.2**: Beide Templates haben Mandant-Anrede + PDF-Anhang-Verweis — wenn V8 nicht 1:1 aus V7.2-Pattern abgeleitet → Verhaltens-Drift im Email-Inbox.
  - **Mitigation**: MT-1 startet mit Read von V7.2-Template + 1:1-Anpassung der Texte (NICHT Copy-Edit-Mix). Vitest deckt beide Pfade ab.
- **R-3 Run-Page-Switch Bericht-Page Drift**: V6.3-BerichtRenderer und V8-V8BerichtRenderer muessen koexistieren. Switch-Logic ueber `template.metadata.usage_kind` analog SLC-149 Pattern.
  - **Mitigation**: Reuse Pattern aus SLC-149 (Run-Page-Switch etabliert per [[feedback-v6-v8-coexistence-via-run-page-switch]]). Higher-Order-Switch in Page-Component, NICHT Component-Internal-Switch.
- **R-4 Live-Smoke Mandant-Setup-Aufwand**: Test-Mandant + Test-Tenant + V8-Template-Assignment erfordern Admin-Setup-Schritte vor Live-Smoke.
  - **Mitigation**: MT-5 Pre-Test-Setup-Liste als Checkliste. Founder-Pflicht: Test-Mandant in Strategaize-Demo-Partner-Tenant vor Live-Smoke anlegen.
- **R-5 BL-133 zweistufiger Versand-Pfad**: Founder-Direktive 2026-05-29 verlangt explizite Erklaerung "Sie koennen den Bericht an Ihren Steuerberater weiterleiten". Wenn der Pflicht-Hinweis im Email-Body fehlt → Privacy-Direktive-Verletzung.
  - **Mitigation**: AC-SLC-152-1 enforced den Pflicht-Hinweis via Vitest-Snapshot-Test. Founder-Verdict in MT-5 Live-Smoke prueft Email-Body manuell.
- **R-6 Master-Merge-Conflict bei main-Drift**: Wenn waehrend SLC-148..152-Implementation ein anderer Branch auf main gemerged wurde → Fast-Forward koennte fehlschlagen.
  - **Mitigation**: MT-5 Pre-Merge `git fetch && git merge --ff-only --dry-run` simuliert. Bei Conflict: Rebase v8-mandanten-report auf main HEAD, dann Master-Merge.
- **R-7 Coolify-Redeploy-Latency**: Production-Deploy nach Master-Merge dauert 3-10min, in der Zeit ist Production noch auf altem HEAD.
  - **Mitigation**: Standard-Pattern aus V7.2/V7.4/V7.7-Releases. Live-Smoke startet erst NACH Coolify-Redeploy-Bestaetigung.
- **R-8 Founder-Verdict-Fail in Live-Smoke**: 17 Seiten + komplette Diagnose-Flow eroeffnet viele Visual/UX-Polish-Wuensche.
  - **Mitigation**: Hotfix-Class-Items innerhalb SLC-152, alle anderen → V8.1-BL-Items. AC-Gesamt-V8-1 ist binaer (Wuerde-ich-schicken Ja/Nein), nicht Polish-Detail-Level.

## Verification Strategy

- **Vitest** fuer Pure-Logic-Helpers (Email-Template-Render, Telemetry-Property-Format, Bericht-Page-Render-Helpers)
- **Wiring-Verification**: Branch-Logic via Mock + V6.3-Co-Existenz-Test
- **Live-Smoke End-to-End** mit Founder-Test-Mandant — finales Pflicht-Gate vor Master-Merge
- **Gesamt-V8-/qa** vor Master-Merge: SC-V8-* alle PASS oder dokumentiert
- **Post-Launch-Window** 18-24h mit Monitoring (error_log + Container-Health + Telemetrie-Volume)
- **V6.3-Co-Existenz** via Git-Diff von V7.2-Renderer + V7.2-Email-Files = 0 plus Live-Smoke 2. Test mit V6.3-Template

## Dependencies / Pre-Conditions Tabelle

| Pre-Condition | Status | Aktion |
|---|---|---|
| SLC-148 done (Snapshot + Migration LIVE) | ✓ done | RPT-358 |
| SLC-149 done (Frontend Run-Page-Switch) | ✓ done | RPT-358 |
| SLC-150 done (Phase-A Renderer LIVE code-side) | pending | /frontend SLC-150 |
| SLC-151 done (Phase-B Renderer LIVE code-side) | pending | /frontend SLC-151 |
| V7.2 FEAT-060 Email-Versand LIVE | ✓ done | REL-021 |
| FEAT-058 Telemetrie diagnose_event LIVE | ✓ done | V7.2 SLC-139 |
| BL-132 Privacy-Flow Option A bereits in SLC-148 implementiert | ✓ done | DEC-163-Erweiterung |
| Founder-Test-Mandant + V8-Template-Assignment auf production | pending | MT-5 Pre-Test-Setup |
| Worktree `v8-mandanten-report` HEAD nach SLC-151 | pending | SLC-151 done |

## Cross-References

- **Architektur**: `docs/ARCHITECTURE.md` V8-Addendum (Implementation Direction SLC-152)
- **Features**: FEAT-066 AC-13/14, FEAT-058-Reuse (Telemetrie), FEAT-060-Reuse (Email-Versand)
- **Decisions**: DEC-163 (Snapshot-Persistenz + Admin-View-Gate), DEC-157 (PDF-Engine), DEC-158 (Template-Variant-Switch via partner_organization.metadata)
- **Backlog**:
  - BL-133 (zweistufiger Versand Mandant + Steuerberater) — Email-Body-Pflicht-Hinweis ist V8.0-Antwort, vollstaendiger Click-Workflow ist V8.1
  - BL-134 (V8.1 Lead-Conversion-CTA) — out of scope hier, setzt `released_for_strategaize_review = true` per User-Klick
  - BL-135 (V8.1+ Mandanten-Login-Pfad) — out of scope hier
- **Reuse-Patterns**:
  - V7.2 `src/lib/email/send-diagnose-report.ts` (Email-Versand-Pattern, Template-Variant-Switch additiv)
  - V7.2 `src/lib/email/templates/diagnose-report.ts` (Template-Pattern fuer V8-Template-Erweiterung)
  - V7.2 FEAT-058 `recordDiagnoseEvent` (Telemetrie-Pattern fuer V8-Events)
  - V7.2 `SendReportByEmailModal` (Modal-Komponente fuer V8-Bericht-Page Email-Button)
  - SLC-149 Run-Page-Switch-Pattern ([[feedback-v6-v8-coexistence-via-run-page-switch]]) fuer Bericht-Page-Switch
  - V7.7 SLC-147 Release-Sequenz (Master-Merge + Coolify-Redeploy + Live-Smoke + /post-launch)
- **Memory**:
  - [[feedback-cumulative-single-branch-pattern]] — Branch-Strategie + Master-Merge am Schluss
  - [[feedback-v6-v8-coexistence-via-run-page-switch]] — Run-Page-Switch fuer Bericht-Page V6.3/V8
  - [[feedback-worktree-cleanup-sequence-pflicht]] — Cleanup-Sequence post Master-Merge
  - [[feedback-design-premium-look-pflicht]] — Premium-Look auch fuer Email + Bericht-Page
  - [[feedback-mandanten-empfehlung-unsere-nicht-stb]] — Tonalitaet auch im Email-Body
  - [[feedback-post-launch-fruehentscheid-polish-only]] — NICHT applicable (V8 ist substanzielle Feature-Iteration, 18-24h voll)
  - [[feedback-pflicht-footer-server-side]] — Strategaize-Footer + Datenschutz im Email-Body
- **Cross-System**: keine (V8.0 ist Onboarding-Plattform-internes Release, kein Business-System-Lead-Push — das ist V8.2+ analog V6 BL-106-Pattern)
