# SLC-141 — FEAT-060 Bericht-Email mit PDF-Attachment

**Feature:** FEAT-060
**Version:** V7.2 (Smart-Split aus V7.1 2026-05-21)
**Status:** planned
**Created:** 2026-05-20
**Estimated effort:** ~4-6h Code-Side
**Pre-Conditions:** SLC-140 done (Bericht-Page Layout final, QuickActionRing-Slot fuer Email-Versand integriert)
**Worktree:** `slc-141-bericht-email-pdf` (Pflicht)

## Zweck

@react-pdf/renderer-Setup + PDF-Generator + Server-Action `sendDiagnoseReportByEmail` mit 3-Empfaenger-Auswahl (self/partner/additional) + SendReportByEmailModal-UI. IONOS-SMTP-Reuse aus V4.2.

## In Scope

Siehe FEAT-060. Konkret:
- @react-pdf/renderer als neue Dependency.
- PDF-Generator src/lib/pdf/diagnose-report.tsx (React-Pattern).
- Server-Action sendDiagnoseReportByEmail mit Rate-Limit 5/h/Session.
- Email-Template diagnose-report (Subject + Body editierbar via FEAT-055).
- SendReportByEmailModal-Komponente in Bericht-Page (QuickActionRing-Integration).
- Print-CSS bleibt unveraendert als Browser-Fallback.

## Out of Scope

- PDF-Branding pro Partner (Logo, Brief-Vorlage) — V7.2+.
- Mehrsprachige PDFs DE+NL — V8+.
- PDF-Versioning + Storage-Archivierung — V8+.
- Auto-Versand bei Bericht-Generierung — V7.1 nur Manual-Trigger.
- Reminder-Mail "Bericht wartet" — V8+.
- Geteilter Bericht-Link Share — V8+.

## Micro-Tasks

### MT-1: @react-pdf/renderer Dependency-Install + Setup
- Goal: Dependency installiert (`npm install @react-pdf/renderer`), Type-Check passt, smoke-Render-Test (simple `<Document>` -> Buffer).
- Files: `package.json`, `package-lock.json`, `src/lib/pdf/__tests__/setup-smoke.test.ts`.
- Expected behavior: Lib im Build verfuegbar, tsc + ESLint clean. Smoke-Test rendert minimales PDF (10 chars Title).
- Verification: `npm run build` PASS. Vitest smoke PASS.
- Dependencies: Keine.

### MT-2: PDF-Generator src/lib/pdf/diagnose-report.tsx
- Goal: React-Komponenten-Tree fuer Diagnose-Bericht-PDF: Header (Strategaize-Logo + Partner-Logo + Title) + ScoreVisualPdf (6 Bars) + 6 Block-Sections (Title + KI-Verdichtung) + Footer (Pflicht-Output-Aussage). `renderDiagnoseReportPdf(sessionData, overrides)` -> Buffer.
- Files: `src/lib/pdf/diagnose-report.tsx`, `src/lib/pdf/components/ScoreVisualPdf.tsx`, `src/lib/pdf/components/BlockSectionPdf.tsx`, `src/lib/pdf/styles.ts`, `src/lib/pdf/__tests__/diagnose-report.test.ts`.
- Expected behavior: Eigener Stil-Pfad (StyleSheet.create), KEINE Tailwind-Klassen. A4 + 20mm Margins. Closing-Statement via resolveText. Output ist valides PDF (PDF-Magic + EOF).
- Verification: Vitest 4+ Cases (PDF-Magic-Header `%PDF-`, EOF-Marker, Block-Count = 6, Closing-Statement-Text enthalten via String-Search im Buffer).
- Dependencies: MT-1, SLC-136 MT-2 (Resolver fuer Closing-Statement-Override).

### MT-3: Email-Template diagnose-report (Server-Side resolveText)
- Goal: Subject + Body via FEAT-055-Override editierbar. Default-Subject "Ihr StrategAIze Diagnose-Bericht — {partner_display_name}". Default-Body mit Begruessung + Kontext-Saetze + Hinweis-PDF-Attachment + optional customMessage-Block.
- Files: `src/lib/email/templates/diagnose-report.ts`, `src/lib/email/templates/__tests__/diagnose-report.test.ts`.
- Expected behavior: `buildDiagnoseReportEmail(overrides, partnerDisplayName, customMessage?)` returnt `{ subject, htmlBody, textBody }`. Subject/Body laden via resolveText mit Keys `email.diagnose_report.subject` + `.body_md`. Markdown -> remark@15 -> HTML.
- Verification: Vitest 3 Cases (Default-Render, Override-Render, customMessage-Render).
- Dependencies: MT-2, SLC-137 MT-6 (Email-Template-Migration auf resolveText-Pattern etabliert).

### MT-4: Server-Action sendDiagnoseReportByEmail + Rate-Limit
- Goal: Action in `src/app/dashboard/diagnose/bericht/actions.ts`. Validation, RLS (own-tenant), Empfaenger-Resolution (self / partner / additional), PDF-Render, SMTP-Send via IONOS, Audit-Log.
- Files: `src/app/dashboard/diagnose/bericht/actions.ts` (Erweiterung), `src/lib/rate-limit.ts` (Erweiterung: `diagnoseReportEmailLimiter` 5/h/Session), `src/app/dashboard/diagnose/bericht/__tests__/actions.test.ts`.
- Expected behavior: Input `{ captureSessionId, recipientToSelf, recipientToPartner, additionalEmail?, customMessage? }`. RLS-Check via supabase. Recipients-Resolution. PDF-Render via MT-2. SMTP via existierender IONOS-Adapter. Audit-Log `captureInfo(event='diagnose_report_emailed', recipients_count)`.
- Verification: Vitest 7+ Cases (validRequest -> SMTP-Mock-Call mit korrektem To+Cc+Subject+Attachment, RLS-Reject bei foreign-session, Rate-Limit 6. Versuch -> Error, customMessage in Body, additionalEmail invalid-Format -> Error).
- Dependencies: MT-2, MT-3, SLC-136 MT-3.

### MT-5: SendReportByEmailModal UI in Bericht-Page (QuickActionRing-Integration)
- Goal: Modal-Komponente mit 3 Checkboxes (an mich / an Partner-Steuerberater / an weitere Adresse) + Email-Input fuer Additional + Textarea fuer Custom-Message (max 500 chars) + Send-Button.
- Files: `src/app/dashboard/diagnose/bericht/components/SendReportByEmailModal.tsx`, Erweiterung `src/app/dashboard/diagnose/bericht/components/QuickActionRing.tsx` (Email-Button als eine der 4 Aktionen, Modal-Open-Handler).
- Expected behavior: Modal-Open via QuickActionRing-Klick. Send-Button triggert Server-Action. Loading-Spinner waehrend Send. Success-Toast "Bericht versendet an N Empfaenger". Error-Toast bei Fehler.
- Verification: Vitest auf Modal-Render + Form-Validation. Manueller Smoke-Send mit Test-Mandant zu Test-Inbox.
- Dependencies: MT-4, SLC-140 MT-4 (QuickActionRing existiert).

### MT-6: Records-Update + Live-Smoke-Email-Send
- Goal: Records auf done + Live-Smoke gegen Hetzner mit echtem Email-Versand.
- Files: `slices/INDEX.md`, `planning/backlog.json` (BL-116 -> done), `features/INDEX.md` (FEAT-060 -> done), `docs/STATE.md`, RPT-XXX.md mit Email-Versand-Audit.
- Expected behavior: Live-Smoke: Test-Mandant-Diagnose-Run -> Bericht-Page -> Email-Send-Modal -> Send -> Test-Inbox empfangt Email + PDF-Attachment + PDF ist valid (ffprobe-/pdftk-Test).
- Verification: Test-Inbox-Empfang in <30s. PDF-Validation PASS.
- Dependencies: MT-1..5.

## Acceptance Criteria

Siehe FEAT-060 AC-1..10. Plus:
- AC-SLC-141-1: Dependency-Install + Build PASS.
- AC-SLC-141-2: Live-Smoke-Email-Send mit gueltigem PDF-Attachment.
- AC-SLC-141-3: Rate-Limit 5/h/Session verifiziert via 6. Klick.

## Risiken

- @react-pdf/renderer-Bundle-Size: ggf. Code-Split via Dynamic-Import wenn Build-Size signifikant waechst.
- PDF-Layout-Limitation: deutscher Umlaut-Support pruefen (Font-Embedding via @react-pdf/font noetig?).
- IONOS-SMTP-Attachment-Limit: max 10MB ueblich, PDF erwartet < 1MB.
- Rate-Limit-Identifier: pro Session statt pro User -> Mandant kann mehrere Sessions parallel, das ist OK.
- PDF-Render-Time im Server-Action-Block: bei langer Render-Zeit Timeout-Risiko. Erwartung: < 2s pro PDF.
