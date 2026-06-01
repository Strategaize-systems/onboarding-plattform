# FEAT-074 — Handbuch-Integration + Audit/Cost-Tracking

- Status: planned
- Version: V9
- Created: 2026-06-01

## Purpose
Akzeptierte Patterns aus FEAT-073 werden als zusaetzliche `knowledge_unit`-Rows in den aktiven V4.1-Handbuch-Snapshot uebernommen. Pro Pattern wird die Quelle (Email-Thread + Pseudonym-Map) als Source-Attribution gespeichert. Audit-Trail dokumentiert kompletten Bulk-Run-Lifecycle und aggregierte LLM-Kosten.

## Why it matters
Ein extrahiertes Pattern ohne Handbuch-Anschluss waere Sackgasse — es muss im V4.1-Handbuch-Reader konsumierbar sein, damit GF (und spaeter Mitarbeiter, V9.2+) im Tages-Geschaeft drauf zugreifen koennen. Source-Attribution ist Pflicht: GF muss zurueck-verfolgen koennen, aus welcher Email-Konversation ein Pattern stammt (Vertrauen + Korrigierbarkeit). Audit-Trail erfuellt DSGVO + COMPLIANCE.md-Pflichten (welche LLM-Calls liefen wo, mit welchem Modell, in welcher Region).

## How it works

### Handbuch-Integration

1. **Trigger**: FEAT-073 Abschluss-Button "Curation abschliessen + in Handbuch uebernehmen".
2. **Idempotenz-Check**: pro Pattern wird `email_pattern.imported_to_handbook_at` gesetzt. Re-Run uebersetzt nur Pattern mit `imported_to_handbook_at IS NULL`.
3. **knowledge_unit-Erzeugung**: pro akzeptiertem Pattern wird eine knowledge_unit-Row erzeugt:
   - `tenant_id` (gleicher Tenant wie Bulk-Run)
   - `template_id` (aktives V4.1-Template des Tenants)
   - `section_path` (von FEAT-073 Curation gesetzt, z.B. `vertrieb/einwand-behandlung`)
   - `title` (von Pattern uebernommen)
   - `content` (Description + ggf. Evidence-Snippets-Auszug, /architecture entscheidet)
   - `metadata` JSONB mit Source-Attribution:
     ```json
     {
       "source_type": "email_bulk",
       "bulk_run_id": "...",
       "pattern_id": "...",
       "thread_id": "...",
       "participant_pseudonyms": { ... },
       "confidence": 0.9,
       "extracted_at": "2026-06-01T..."
     }
     ```
   - `created_by_user_id` (GF-Curator)
4. **Snapshot-Trigger**: nach Pattern-Import wird neuer Handbuch-Snapshot erzeugt (Reuse V4.1 FEAT-028 Snapshot-Mechanik). GF sieht das Pattern im V4.1-Handbuch-Reader unter der gewaehlten Section.
5. **Bulk-Run-Status** -> `completed` mit Final-Stats: total_emails, content_emails, threads, patterns_extracted, patterns_accepted, patterns_imported, total_cost_eur.

### Source-Attribution-View

Im V4.1-Handbuch-Reader pro knowledge_unit-Card neue "Quelle"-Sub-Sektion:
- "Aus Email-Bulk-Import vom YYYY-MM-DD"
- Klick -> Link zu Bulk-Run-Detail-View mit Thread-Details (Plattform-intern, nicht oeffentlich)
- Evidence-Snippets read-only mit Pseudonym-Hinweis "Klarnamen wurden pseudonymisiert"

### Audit-Trail

Pro Bulk-Run vollstaendiges Audit-Log:
- Upload: wer, wann, welche Datei, file_hash
- Pre-Filter: Bedrock-Calls (Modell + Region eu-central-1 + Token-Count + Cost), Klassifikations-Counts
- Thread-Aggregation: Thread-Count, Edge-Cases (Loops, Forward-Chains)
- PII-Redaction: angewendete Pattern, Pseudonym-Map-Size
- Pattern-Extraktion: Sonnet-Calls (Modell + Region + Token-Count + Cost), Pattern-Count
- Curation: pro Pattern: akzeptiert/abgelehnt/editiert + Curator-User-Id + Timestamp
- Handbuch-Integration: knowledge_unit-IDs, Snapshot-Id

Audit-Log ist Admin-only-View (strategaize_admin sieht Cross-Tenant, tenant_admin sieht eigenen).

### Cost-Tracking

Reuse `ai_cost_ledger` aus V5 (deployed):
- Pro Bedrock-Call ein Ledger-Entry mit Provider, Region, Modell, Input-Tokens, Output-Tokens, EUR-Cost.
- Aggregation pro Bulk-Run: `email_bulk_run.total_cost_eur` (Update am Run-Ende).
- Aggregation pro Tenant/Monat: View `vw_bulk_email_cost_monthly` fuer Tenant-Cap-Enforcement.

## In Scope (V9.0)

### Funktional
- Idempotente Pattern -> knowledge_unit-Uebersetzung
- Source-Attribution-Metadata pro knowledge_unit
- Handbuch-Snapshot-Trigger nach Import
- Source-Attribution-View im V4.1-Handbuch-Reader
- Audit-Log Aggregation pro Bulk-Run
- Cost-Tracking Aggregation pro Run + pro Tenant/Monat
- Final-Stats-Anzeige am Run-Ende

### Nicht-Funktional
- Tenant-RLS auf knowledge_unit mit `metadata.source_type='email_bulk'`-Filterbarkeit
- Audit-Log unloeschbar fuer 7 Jahre (DSGVO + COMPLIANCE.md, Reuse V4.1-Pattern)
- Performance: 100 Pattern-Import in <30 Sekunden
- Strategaize-Admin sieht Cross-Tenant-Audit (Reuse `feedback_admin_demo_mode`)

## Out of Scope (V9.0)

- **Pattern-Vorschau im Handbuch-Reader vor Akzeptanz** (V9.1+): in V9.0 sieht GF Pattern in Curation-UI, nicht im Reader-Format.
- **Pattern-Re-Open zur Edition nach Handbuch-Import** (V9.1+): in V9.0 ist Import einseitig. Edit muss in Handbuch-Editor (FEAT-028) erfolgen.
- **Auto-Section-Anlage** (V9.1+): in V9.0 muss `section_path` in V4.1-Template existieren oder /architecture klaert wie freie Sections behandelt werden.
- **Pattern-Versionierung** (V10+): bei zweitem Bulk-Run mit aehnlichem Pattern keine Versionierung, nur duplicate knowledge_unit.
- **Export der Bulk-Run-Statistiken als PDF/CSV** (V9.1+): nur Plattform-interne Anzeige.

## Foundation-Reuse

- **FEAT-028 V4.1 Handbuch-Reader (deployed)**: Snapshot-Mechanik, Section-Liste.
- **FEAT-026 V4 Unternehmerhandbuch-Foundation (deployed)**: handbook_snapshot-Tabelle + knowledge_unit-Tabelle.
- **ai_cost_ledger (V5 deployed)**: Cost-Tracking-Aggregation.
- **error_log + audit_log Pattern (V4.2+)**: Audit-Trail-Pattern.
- **Tenant-RLS-Pattern**.

## Success Criteria

- AC-1: Pattern -> knowledge_unit-Uebersetzung ist idempotent (Re-Run uebersetzt nur unprocessed Pattern).
- AC-2: Pro knowledge_unit existiert source_attribution-Metadata mit bulk_run_id + pattern_id + thread_id.
- AC-3: Nach Import wird neuer handbook_snapshot erzeugt; Pattern erscheint im V4.1-Handbuch-Reader unter gewaehlter Section.
- AC-4: Source-Attribution-View im Reader zeigt "Aus Email-Bulk-Import vom YYYY-MM-DD" + Link zur Run-Detail.
- AC-5: Evidence-Snippets im Reader sind pseudonymisiert (kein Klarname sichtbar).
- AC-6: Audit-Log enthaelt komplette Stufen-Spur: Upload + Pre-Filter + Thread-Aggregation + PII-Redact + Pattern-Extraktion + Curation + Handbuch-Integration.
- AC-7: Cost-Tracking pro Bulk-Run zeigt total_cost_eur korrekt aggregiert ueber alle LLM-Calls.
- AC-8: Cost-Cap-View pro Tenant/Monat zeigt Verbrauchs-Stand inkl. Tagessicht.
- AC-9: Final-Stats am Run-Ende: total_emails, content_emails, threads, patterns_extracted, patterns_accepted, patterns_imported, total_cost_eur.
- AC-10: strategaize_admin kann Audit-Log Cross-Tenant einsehen.
- AC-11: Tenant-RLS verhindert Cross-Tenant-Read auf knowledge_unit mit source_type='email_bulk' (Pen-Test-Erweiterung Pflicht in /qa).

## Dependencies

- **Backend**: knowledge_unit-Insert-Logik mit Source-Attribution, Snapshot-Trigger, Audit-Aggregation, Cost-Aggregation.
- **Frontend**: Source-Attribution-View in V4.1-Handbuch-Reader, Bulk-Run-Detail-Page mit Final-Stats, Admin-Audit-Cross-Tenant-View.
- **Data**: Erweiterung knowledge_unit.metadata um source_type='email_bulk', neue View vw_bulk_email_cost_monthly.
- **Pre-Conditions**: FEAT-073 implementiert, knowledge_unit + handbook_snapshot aus V4.1.

## Related

- BL-151 (Backlog-Tracker fuer FEAT-074)
- FEAT-073 (Pattern-Extraktion als Vorstufe)
- FEAT-028 (V4.1 Handbuch-Reader)
- FEAT-026 (V4 Handbuch-Foundation)
- COMPLIANCE.md (DSGVO-Audit-Pflichten)
- privacy-security.md
- RPT-373 (Discovery V9 = Bulk-Import)
