# FEAT-060 — Bericht-Email mit PDF-Attachment

**Version:** V7.2 (Smart-Split aus V7.1 2026-05-21)
**Status:** planned
**Created:** 2026-05-20

## Zweck

Mandant kann nach Bericht-Generierung den Diagnose-Bericht per Email an sich selbst, optional an Partner-Steuerberater (cc) und/oder eine zusaetzliche Email-Adresse versenden — PDF-Attachment. Adressiert BL-116 + User-Feedback aus SLC-700-Live-Test "Mandant kann Bericht aktuell nur ueber Browser-Print-Dialog speichern".

## Hintergrund

Conversion-Verbesserung + Partner-Bindung: Steuerberater bekommt direkt Sichtbarkeit auf Diagnose-Ergebnis (ohne Mandant muss manuell weiterleiten). Mandant hat saubere Archiv-Datei (PDF) statt Browser-Print-Hack. Geschaeftspartner-Adresse als optionaler dritter Empfaenger fuer geteilte Strategie-Gespraeche.

PDF-Engine-Auswahl: `@react-pdf/renderer` statt `puppeteer` — keine Headless-Chrome-Dependency, kleinerer Footprint, React-API-konsistent. Akzeptierter Tradeoff: PDF nutzt eigenen Stil-Pfad, NICHT 1:1-Browser-Render.

## In Scope

- **Server-Action `sendDiagnoseReportByEmail`** in `src/app/dashboard/diagnose/bericht/actions.ts`:
  - Input: `captureSessionId, recipientToSelf: boolean, recipientToPartner: boolean, additionalEmail?: string, customMessage?: string`.
  - Validierung: `captureSessionId` gehoert dem aktuellen Tenant (RLS), `additionalEmail` ist gueltiges Email-Format, `customMessage` max 500 Zeichen.
  - Empfaenger-Resolution: own `auth.users.email` (recipientToSelf), `partner_organization.contact_email` (recipientToPartner), `additionalEmail`.
  - PDF-Render via `renderDiagnoseReportPdf(captureSessionId)` (siehe unten).
  - SMTP-Send via IONOS-SMTP-Adapter aus V4.2.
  - Audit-Log via `captureInfo` mit `event='diagnose_report_emailed'`, `recipients_count`.
  - Rate-Limit: 5 Emails/h/Session (vermeidet Spam-Loop).
- **PDF-Generator** `src/lib/pdf/diagnose-report.tsx`:
  - `@react-pdf/renderer` mit React-Pattern: `<Document><Page>...<Section>...<Text>` etc.
  - PDF-Layout:
    - **Header**: Strategaize-Logo + Partner-Logo (falls vorhanden) + Bericht-Titel.
    - **Score-Visual**: 6 Bars (gleicher Daten-Schnitt wie Bericht-Page).
    - **6 Block-Sektionen**: pro Block: Title + KI-Verdichtungs-Kommentar.
    - **Pflicht-Output-Aussage** als Footer.
    - **Datum + Mandant + Partner** im Footer.
  - PDF-Sprache: Deutsch (V7.1).
  - PDF-A4-Format, Margins 20mm.
  - Buffer-Output `Promise<Buffer>` fuer SMTP-Attachment.
- **Email-Template** `src/lib/email/templates/diagnose-report.ts`:
  - Subject (editierbar via FEAT-055/056): "Ihr StrategAIze Diagnose-Bericht — {partner_display_name}".
  - Body (editierbar): Begruessung + 2-3 Saetze Kontext + Hinweis auf PDF-Attachment + Optional `customMessage`-Block + Footer.
  - Plain-Text-Variant + HTML-Variant (multipart).
- **UI-Komponente `<SendReportByEmailButton>`** in Bericht-Page:
  - Button "Bericht per Email senden" oeffnet Modal.
  - Modal mit 3 Checkboxes (an mich / an Partner / an weitere Adresse), Email-Input fuer Additional, Textarea fuer Custom-Message.
  - Send-Button triggert Server-Action.
  - Loading-State + Success-Toast + Error-Handling.
- **Print-CSS bleibt als Browser-Fallback**:
  - Existierender Print-Button (`window.print()`) bleibt funktional fuer User die kein Email wollen.
  - Print-CSS-Anpassungen NUR falls Polish (FEAT-059) das benoetigt.
- **Vitest + Integration-Coverage**:
  - PDF-Render produziert valide PDF-Bytes (PDF-Magic-Header `%PDF-` + EOF-Marker).
  - SMTP-Mock verifiziert From, To, Cc, Subject, Body, Attachment-Filename.
  - Server-Action RLS (Tenant darf nur eigene Session emailen).
  - Rate-Limit 5/h greift bei 6. Aufruf.
  - PDF-Content enthaelt Pflicht-Output-Aussage + alle 6 Block-Titel + Score-Werte.

## Out of Scope

- **PDF-Branding pro Partner** (Logo-Position, Schriftart, Farben) — V7.1 nur Strategaize-Standard. V7.2+ Polish-Slice.
- **Mehrsprachige PDFs** (DE + NL) — V7.1 nur Deutsch. V8+ NL-Markt.
- **PDF-Versioning + Archivierung** in Supabase Storage — V7.1 nur On-Demand-Generierung. V8+ Archiv.
- **Auto-Versand bei Bericht-Generierung** (ohne Mandant-Trigger) — V7.1 nur Manual-Trigger.
- **Erinnerungs-Email "Bericht wartet"** — V7.1 nur Manual-Send. V8+ Reminder-Cron.
- **PDF-Editierbarkeit nach Versand** — sofort nach Versand archiv. Edit waere Re-Send-Cycle.
- **Geteilter Bericht-Link** (passwort-geschuetzt) — V7.1 nur Email-Attachment. V8+ Share-Link.
- **DOCX-Export oder andere Formate** — V7.1 nur PDF.

## Akzeptanzkriterien

- AC-1: `@react-pdf/renderer` als neue Dependency hinzugefuegt (package.json + lock).
- AC-2: PDF-Generator produziert valide PDF-Bytes mit Pflicht-Output-Aussage + 6 Block-Titeln + Score-Visual.
- AC-3: Server-Action `sendDiagnoseReportByEmail` ruft IONOS-SMTP korrekt mit PDF-Attachment.
- AC-4: RLS verbietet Mandant A das Emailen einer Session von Mandant B (Pen-Test).
- AC-5: Rate-Limit 5 Emails/h/Session: 6. Versuch in derselben Stunde returnt 429.
- AC-6: Modal in Bericht-Page rendert 3 Checkboxes + Email-Input + Custom-Message-Textarea.
- AC-7: Email-Versand an alle 3 Empfaenger-Typen (self + partner + additional) funktional in End-to-End-Test.
- AC-8: Audit-Log `diagnose_report_emailed`-Event enthaelt recipients_count.
- AC-9: Print-Button bleibt funktional als Browser-Fallback.
- AC-10: PDF rendert auf A4 mit korrekten Margins.

## Abhaengigkeiten

- **Hard-Dep**: FEAT-055 (Email-Subject + Body editierbar via Resolver).
- **Hard-Dep**: FEAT-059 QuickActionRing-Integration in Bericht-Page (Email-Button als eine der Aktionen).
- **Pattern-Reuse**: IONOS-SMTP-Adapter aus V4.2.
- **Pattern-Reuse**: rate-limit.ts aus V4.2.
- **Pattern-Reuse**: Server-Action-Pattern aus V6.3 Diagnose-Werkzeug.
- **Pattern-Reuse**: Modal-Komponente aus existierenden Dialog-Komponenten.
- **New-Dependency**: `@react-pdf/renderer` (akzeptiert wegen Engine-Auswahl in /architecture Q-V7.1-F).
- **Downstream-Dep**: Keine V7.1-Downstream.
