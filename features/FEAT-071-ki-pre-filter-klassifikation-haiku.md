# FEAT-071 — KI-Pre-Filter-Klassifikation (Haiku) + Filter-Review-UI

- Status: planned
- Version: V9
- Created: 2026-06-01

## Purpose
Nach Upload klassifiziert ein KI-Pre-Filter (Bedrock Claude Haiku eu-central-1) jede Email in eine von 6 Kategorien. Volumen-Reduktion ~90% — nur `content`- und `unclear`-Emails laufen in FEAT-072/073 weiter. GF kann Klassifikationen vor dem teuren Pattern-Extraktion-Pass korrigieren.

## Why it matters
Eine vollstaendige `.mbox` enthaelt ~70-90% Rauschen (Newsletter, Notifications, kurze Replies, privat). Pattern-Extraktion mit Sonnet auf das gesamte Korpus waere kosten- und qualitaetsmaessig falsch (~50 EUR pro 1000 Emails statt ~5 EUR). Haiku-Pre-Filter ist ~50x billiger als Sonnet (~0.10 EUR Pre-Filter vs ~5 EUR Pattern-Extraktion pro 1000 Emails) und hat genug Qualitaet fuer 6-Klassen-Klassifikation. GF-Korrektur-UI faengt Fehlklassifikationen ab bevor das teure Pattern-Pass laeuft.

## How it works

### Klassifikations-Schema (6 Labels)
| Label | Bedeutung | Beispiele |
|---|---|---|
| `content` | enthaelt operatives Wissen, Antwort-Muster, Entscheidungen | Kunden-Antworten, Loesungs-Erklaerungen, Vertriebs-Argumente |
| `short_reply` | kurze Antwort ohne neuen Inhalt | "Danke", "Ok", "Passt", "Bis Montag" |
| `notification` | automatisierte System-Mails | Calendar-Invites, Out-of-Office, System-Alerts |
| `newsletter` | Marketing/Subscription | Branchen-Newsletter, Werbung |
| `private` | privates, nicht-geschaeftlich | Familien-Mails, persoenliche Termine |
| `unclear` | nicht eindeutig zuordenbar | Manuell-Review-Kandidaten |

### Workflow

1. **Trigger**: Nach FEAT-070-Upload-Completion automatisch (Worker-Job `email_bulk_pre_filter`) oder per GF-Button "Pre-Filter starten".
2. **Batch-Processing**: Worker iteriert in Batches (z.B. 50 Emails pro Bedrock-Call) durch alle Emails des Bulk-Runs. /architecture entscheidet Batch-Groesse + Single-Email-vs-Multi-Email-Prompt.
3. **Haiku-Prompt** (eu-central-1, DSGVO): pro Email/Batch Klassifikations-Pflicht-Output (Strict-JSON-Schema, 1 Label aus 6).
4. **Persistierung**: `email_message.pre_filter_label` + `email_message.pre_filter_confidence` (0..1).
5. **Cost-Tracking**: Pro Bulk-Run wird `pre_filter_cost_eur` summiert (Reuse `ai_cost_ledger` aus V5).
6. **Review-UI** unter `/dashboard/bulk-email-import/[run_id]/filter-review`:
   - Klassifikations-Counts ("342 Emails: 87 content, 200 short_reply, 35 notification, 18 newsletter, 0 private, 2 unclear")
   - Filter pro Label
   - Pro-Email-Detail mit Klassifikation + Confidence + Korrektur-Dropdown
   - Bulk-Reclassify-Selektion (z.B. "alle 'unclear' als 'content' markieren")
   - "Pre-Filter approved -> weiter zu FEAT-072 Thread-Aggregation"-Button

### Bedrock-Adapter-Erweiterung
- Reuse bestehender Bedrock-Client mit Region `eu-central-1` (data-residency.md Pflicht).
- Neuer Adapter-Sub-Path fuer Haiku (bisher nur Sonnet im Repo). /architecture entscheidet neuer Adapter vs Modell-Parameter im bestehenden Adapter.

## In Scope (V9.0)

### Funktional
- 6-Label-Klassifikations-Schema mit klarer Definition pro Label
- Haiku-basiertes Klassifikations-Pass (eu-central-1)
- Batch-Processing-Pipeline (Worker)
- Klassifikations-Persistierung auf email_message
- Filter-Review-UI mit Klassifikations-Counts
- Pro-Email-Korrektur
- Bulk-Reclassify
- Approval-Button "weiter zu Thread-Aggregation"

### Nicht-Funktional
- Tenant-RLS auf email_message
- Cost-Tracking pro Run (Reuse ai_cost_ledger V5-Pattern)
- Audit-Log pro Bedrock-Call (Provider, Region, Modell, Token-Count, Cost) — Reuse aus V5-Walkthrough-Pipeline
- Confidence-Schwelle: Emails mit confidence < 0.6 standardmaessig als `unclear` markiert (Schwelle in /architecture)

## Out of Scope (V9.0)

- **Custom-Klassifikations-Schema pro Tenant** (V9.2+): Default-6-Labels reichen V9.0.
- **Lerning-Loop** (V10+): kein Feedback von GF-Korrektur zurueck ins Modell.
- **Multi-Lingual-Klassifikation** (V9.1+): V9.0 default deutsch + englisch, andere Sprachen evtl. schwaecher.
- **Spam-Detection** (V9.1+): `private` + `newsletter` reichen V9.0.

## Foundation-Reuse

- **AWS Bedrock Adapter (V1 deployed)** mit eu-central-1-Region (data-residency.md): Modell-ID-Erweiterung fuer Haiku.
- **V5 PII-Redaction-Pipeline (deployed)**: NICHT in dieser Stufe — Pre-Filter laeuft auf Rohdaten weil Klassifikation Inhalt braucht. PII-Redaction kommt in FEAT-072 BEVOR Pattern-Extraktion in FEAT-073 laeuft.
- **ai_cost_ledger (V5 deployed)**: Cost-Tracking pro Bedrock-Call.

## Success Criteria

- AC-1: 1000 Emails durchlaufen Pre-Filter in <10 Minuten Worker-Zeit (Worker-Tier-Default).
- AC-2: Cost pro 1000 Emails Pre-Filter <0.20 EUR (Haiku-Bedrock-Schaetzung, validiert in /architecture mit Test-Corpus).
- AC-3: GF sieht Klassifikations-Counts ("87 content, 200 short_reply, ...") nach Pre-Filter-Completion.
- AC-4: GF kann pro Email die Klassifikation per Dropdown korrigieren.
- AC-5: GF kann Bulk-Reclassify ausfuehren (z.B. "alle unclear -> content").
- AC-6: Approval-Button setzt Bulk-Run-Status `pre_filtered` und triggert FEAT-072.
- AC-7: Cost-Tracking zeigt pro Run die Pre-Filter-Kosten in EUR mit Token-Detail (Reuse ai_cost_ledger).
- AC-8: Confidence < 0.6 markiert Emails als `unclear` (Default-Schwelle, /architecture finalisiert).
- AC-9: Audit-Log: jeder Bedrock-Call ist nachweisbar mit Provider, Region (Pflicht: eu-central-1), Modell, Token-Count.

## Dependencies

- **Backend**: Bedrock-Haiku-Adapter-Erweiterung, Worker-Job `email_bulk_pre_filter`, neue Email-Schema-Spalten `pre_filter_label` + `pre_filter_confidence`.
- **Frontend**: Filter-Review-UI Component, Bulk-Reclassify-Selektion.
- **Data**: Erweiterung email_message-Tabelle, Bedrock-Adapter (Haiku-Sub-Path).
- **Pre-Conditions**: FEAT-070 implementiert (Email-Persistierung).

## Related

- BL-148 (Backlog-Tracker fuer FEAT-071)
- FEAT-070 (Upload-Foundation)
- FEAT-072 (Thread-Aggregation als naechste Pipeline-Stufe)
- data-residency.md (Bedrock eu-central-1-Pflicht)
- RPT-373 (Discovery V9 = Bulk-Import)
