# FEAT-070 — Bulk-Email-Upload + .mbox/.eml-Parser

- Status: planned
- Version: V9
- Created: 2026-06-01

## Purpose
GF kann eine `.mbox`-Datei oder mehrere `.eml`-Dateien aus seinem Mail-Client (Gmail-Takeout, Outlook-Export, Thunderbird, Apple Mail) hochladen. Die Plattform parsed die Emails, speichert Roh-Daten Tenant-isoliert und macht sie fuer die nachfolgenden Pipeline-Stufen verfuegbar (Pre-Filter → Thread-Aggregation → PII-Redaction → Pattern-Extraktion).

## Why it matters
Email-Korrespondenz enthaelt operatives Wissen, das nicht ueber Questionnaire/Evidence-Mode erfassbar ist (Kunden-Umgang, wiederkehrende Antwort-Muster, Vertriebs-Loesungen, Entscheidungsbegruendungen). Klassischer Inbox-Zugriff ist privacy-tief und vendor-abhaengig (IMAP, OAuth, PST). Bulk-Upload via Export-Format ist die einfachste DSGVO-konforme Foundation: GF entscheidet selbst, welcher Folder hochgeladen wird, Roh-Daten landen Tenant-isoliert in Storage, alle nachfolgenden Pipeline-Stufen arbeiten auf der Plattform.

## How it works

### Upload-Flow
1. **Upload-Page** unter `/dashboard/bulk-email-import` (Capture-Mode `email_bulk`, neue FEAT-025-Hook-Instanz).
2. **Drag-Drop** akzeptiert `.mbox` (Standalone) oder mehrere `.eml`-Dateien (Multi-Select). Max-File-Size 500 MB pro `.mbox` (V9.0-Default, /architecture entscheidet Limit).
3. **Pre-Parse** beim Upload: Format-Check (MIME-Type + Magic-Bytes), Email-Count-Schaetzung (Block-Reading), Roh-Datei-Persistierung in Storage-Bucket.
4. **Server-Side-Parser** (Worker oder Server-Action) iteriert mit `mailparser` durch die Datei und persistiert pro Email:
   - Pflicht-Felder: `message_id`, `in_reply_to`, `references` (Array), `from`, `to`, `cc`, `subject`, `date`, `body_text`, `body_html`, `has_attachments`
   - Optional: Attachment-Metadaten (Name, MIME, Size — Inhalt NICHT persistiert in V9.0)
5. **Bulk-Run-Header** in `email_bulk_run`-Tabelle (oder evidence_chunk-Erweiterung — Q-V9-B): tenant_id, uploader_user_id, source_file_name, email_count, status (`uploaded`/`pre_filtered`/`pattern_extracted`/`completed`/`failed`), timestamps, total_cost_eur.

### Status-View
- Mandanten-Dashboard-Card "Bulk-Email-Imports" mit Liste der Runs (Status + Email-Count + Datum).
- Klick auf Run -> Detail-View mit Pipeline-Stufen-Progress.

## In Scope (V9.0)

### Funktional
- `.mbox`-Upload (Gmail-Takeout-/Outlook-Export-/Thunderbird-/Apple-Mail-Format)
- `.eml`-Multi-Upload (einzelne Email-Files aus Outlook-Save-As)
- mailparser-basiertes Parsing
- Email-Persistierung mit allen Pflicht-Headern (insb. `message_id` + `in_reply_to` + `references` — Pflicht fuer FEAT-072 Thread-Aggregation)
- Roh-Datei-Speicherung in Storage-Bucket (Tenant-isoliert per RLS)
- Bulk-Run-Audit-Header
- Upload-Limits (Default V9.0: 500 MB pro Datei, 50.000 Emails pro Run, /architecture finalisiert)
- Status-View pro Run

### Nicht-Funktional
- Tenant-RLS auf allen neuen Tabellen / Storage-Buckets
- Audit-Log: wer hat wann was hochgeladen (compliant zu Capture-Mode-Hook-Pattern aus V4 FEAT-025)
- Idempotenz: Re-Upload derselben Datei (gleicher Hash) erzeugt warning, kein duplicate-Run

## Out of Scope (V9.0 — verschoben nach V9.1+/V10+)

- **Forward-Bucket-Email** (V9.1+): Inbound-SMTP-Vendor (Mailgun/SES/Postmark) — IONOS ist nur Outbound. Neue Vendor-Beziehung + DSGVO-Pruefung noetig.
- **IMAP-Live-Sync** (V10+): Connection-Pool, Inbox-Watch, Idempotenz-via-Server-UID, OAuth-Flow.
- **Outlook-PST-Format** (V10+): Outlook-only-Nische, `libpst` oder kommerzielle Lib noetig.
- **Attachment-Inhalts-Persistierung** (V9.1+): nur Metadaten in V9.0. Attachment-Inhalt kann via Evidence-Mode separat hochgeladen werden.
- **Live-Email-Sync mit Inbox-Subscription** (V10+).
- **Multi-Mitarbeiter-Upload** (V9.2+): FEAT-022 Employee-Rolle wiederverwenden.
- **Customer-Service-Helpdesk-CSV-Export-Parser** (V9.1+): anderes Format, eigene Parser-Spec.

## Foundation-Reuse

- **FEAT-013 Evidence-Mode (V2 deployed)**: Multi-File-Upload-Pattern, RLS-Bucket-Pattern, evidence_file/evidence_chunk-Tabellen-Pattern. /architecture entscheidet ob V9 evidence_chunk erweitert oder neue email_message+email_thread-Tabellen anlegt (Q-V9-B).
- **FEAT-025 Capture-Mode-Hook (V4 deployed)**: neuer Capture-Mode `email_bulk` als FEAT-025-Hook-Instanz.
- **Supabase Storage** (Stack vorhanden, RLS-Pattern aus V2).
- **`mailparser` npm-Lib** (neu, NICHT bereits im Stack): /architecture validiert.

## Success Criteria

- AC-1: GF kann `.mbox`-Datei (mind. Gmail-Takeout-Format) hochladen, Plattform persistiert Datei + parsed alle Emails.
- AC-2: GF kann mehrere `.eml`-Dateien gleichzeitig hochladen, Plattform persistiert alle Emails als Teil eines Bulk-Runs.
- AC-3: Pro Email werden `message_id`, `in_reply_to`, `references`, `from`, `subject`, `date`, `body_text` korrekt persistiert (Pflicht-Felder fuer FEAT-072).
- AC-4: Roh-Datei-Speicherung in Tenant-isoliertem Storage-Bucket — kein Cross-Tenant-Read moeglich (RLS-Test).
- AC-5: Audit-Header pro Bulk-Run: tenant_id, uploader_user_id, source_file_name, email_count, file_hash, status, created_at.
- AC-6: Status-View zeigt Run-Liste mit Pipeline-Progress (uploaded/pre_filtered/pattern_extracted/completed/failed).
- AC-7: Duplicate-Upload (gleicher file_hash) erzeugt Warning, kein zweiter Run.
- AC-8: Upload-Limit 500 MB pro Datei wird beim Pre-Upload-Check enforced; Datei >500 MB wird mit klarer Fehlermeldung abgelehnt.

## Dependencies

- **Backend**: `mailparser` npm-Lib, Supabase Storage Bucket, RLS-Pattern.
- **Frontend**: FEAT-013 Multi-File-Upload-Component (wiederverwendet), File-Drag-Drop-UI.
- **Data**: neue Tabelle `email_bulk_run` (oder Erweiterung evidence_chunk — Q-V9-B), neuer Storage-Bucket `bulk-email` (oder Reuse evidence-Bucket — Q-V9-H).
- **Pre-Conditions**: V8.1 STABLE bestaetigt (Burn-In-Ende ~2026-06-02 08:00 UTC).

## Related

- BL-147 (Backlog-Tracker fuer FEAT-070)
- FEAT-013 (Evidence-Mode V2 — Reuse-Anker)
- FEAT-025 (Capture-Mode-Hook V4 — Capture-Mode `email_bulk`)
- RPT-373 (Discovery V9 = Bulk-Import)
