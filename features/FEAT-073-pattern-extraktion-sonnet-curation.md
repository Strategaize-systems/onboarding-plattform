# FEAT-073 — Pattern-Extraktion (Sonnet) + Curation-UI

- Status: planned
- Version: V9
- Created: 2026-06-01

## Purpose
PII-redactionierte Threads (FEAT-072-Output) werden mit Bedrock Claude Sonnet (eu-central-1) analysiert. Pro Thread werden Themen, wiederkehrende Antwort-Muster, Entscheidungen und offene Fragen extrahiert. GF reviewt die extrahierten Patterns in einem Curation-UI und entscheidet pro Pattern: Akzeptieren, Ablehnen, Editieren, in Handbuch-Section X einsortieren.

## Why it matters
Pattern-Extraktion ist der eigentliche Wert-Hebel: ohne sie ist Bulk-Import nur ein groesserer Inbox-Backup. Sonnet's Faehigkeit zur Aggregation ueber mehrere Email-Threads identifiziert wiederkehrende Antwort-Muster (z.B. "GF antwortet auf Preis-Einwand immer mit Wert-Vergleich, nicht mit Rabatt") die einzeln gelesen nicht sichtbar waren. GF-Curation stellt sicher, dass nur echte, brauchbare Patterns in den Handbuch-Snapshot fliessen — kein KI-Slop.

## How it works

### Pattern-Extraktion-Pass

1. **Trigger**: Nach FEAT-072-Completion automatisch oder per GF-Button "Pattern-Extraktion starten". Cost-Cap-Pre-Approval-Pflicht bei groesseren Corpora (Q-V9-G).
2. **Input**: alle Threads des Bulk-Runs mit `pii_redacted = true`.
3. **Pre-Cost-Estimate**: Plattform berechnet erwartete Kosten basierend auf Token-Count des Korpus (Heuristik: ~5 EUR pro 1000 Emails Pattern-Extraktion). Bei >10 EUR Pre-Approval-Modal mit "Erwartete Kosten: X EUR. Fortfahren?".
4. **Worker-Job** `email_bulk_pattern_extraction`: iteriert ueber Threads.
5. **Sonnet-Prompt** (eu-central-1, DSGVO): pro Thread extrahiert Pflicht-Output (Strict-JSON-Schema):
   ```json
   {
     "thread_id": "...",
     "themes": ["preis-einwand-vergleich", "lieferzeit-erklaerung"],
     "patterns": [
       {
         "title": "Antwort auf Preis-Einwand",
         "description": "GF antwortet immer mit Wert-Vergleich statt Rabatt",
         "evidence_snippets": ["Snippet aus redacted_body Thread X"],
         "confidence": 0.9,
         "suggested_section": "vertrieb/einwand-behandlung"
       }
     ],
     "decisions": [...],
     "open_questions": [...]
   }
   ```
6. **Pattern-Persistierung** in `email_pattern`-Tabelle (oder evidence_chunk-Erweiterung — Q-V9-B):
   - pattern_id, tenant_id, bulk_run_id, thread_id, title, description, evidence_snippets (JSONB), confidence, suggested_section, status (`pending_curation`/`accepted`/`rejected`), curator_user_id, curated_at.
7. **Cost-Tracking** pro Bulk-Run (Reuse ai_cost_ledger V5).

### Curation-UI

Unter `/dashboard/bulk-email-import/[run_id]/curation`:

- **Pattern-Liste** sortiert nach Confidence DESC, gruppiert nach `suggested_section` oder Theme.
- **Pro Pattern-Card**:
  - Titel + Beschreibung
  - Evidence-Snippets-Akkordeon (zeigt redacted_body-Auszug — keine Klarnamen!)
  - Confidence-Score-Pill
  - Aktions-Buttons: Akzeptieren, Ablehnen, Editieren, Section-Dropdown
  - Editieren-Modal: Titel + Description editierbar, Evidence-Snippets read-only
- **Section-Auswahl** (Q-V9-F): Default-Vorschlag aus `suggested_section`, Dropdown zeigt V4.1-Handbuch-Sections aus aktivem Template (knowledge_unit-Sections, /architecture finalisiert ob fixed-Sections aus Template oder free-text mit Auto-Komplett).
- **Bulk-Aktion**: "alle mit confidence > 0.8 akzeptieren", "alle ablehnen".
- **Progress-Bar**: "X von Y Patterns curated".
- **Abschluss-Button** "Curation abschliessen + in Handbuch uebernehmen" -> triggert FEAT-074.

### Cost-Cap

- **Default-Cap pro Bulk-Run**: 20 EUR (V9.0-Default, /architecture entscheidet). Bei Ueberschreitung Pre-Approval-Modal.
- **Hard-Cap pro Tenant pro Monat**: 100 EUR (V9.0-Default, /architecture entscheidet). Bei Ueberschreitung Bulk-Run-Block mit klarer Fehlermeldung.

## In Scope (V9.0)

### Funktional
- Sonnet-basiertes Pattern-Extraktion-Pass (eu-central-1)
- Strict-JSON-Output-Schema mit themes/patterns/decisions/open_questions
- Pre-Cost-Estimate + Pre-Approval-Modal
- Cost-Cap pro Run + pro Tenant
- Pattern-Persistierung mit Curation-Status
- Curation-UI mit Pattern-Liste, Detail-Card, Bulk-Aktionen
- Section-Zuordnung pro Pattern
- Edit-Pattern-Modal
- Progress-Tracking
- Abschluss-Trigger fuer FEAT-074

### Nicht-Funktional
- Tenant-RLS auf email_pattern
- Cost-Tracking pro Run (Reuse ai_cost_ledger)
- Audit-Log pro Sonnet-Call (Provider, Region eu-central-1, Modell, Token-Count, Cost)
- Deterministischer Fallback bei Sonnet-Fail (Pattern-Pass markiert als `failed`, GF kann Re-Try ausloesen)

## Out of Scope (V9.0)

- **Auto-Akzeptanz ohne GF-Review** (V10+): jeder Pattern in V9.0 muss GF-Approved sein.
- **Pattern-Diff zwischen Bulk-Runs** (V10+): Cross-Run-Pattern-Konsolidierung.
- **Pattern-Vorschau in V4.1-Handbuch-Reader vor Akzeptanz** (V9.1+).
- **A/B-Test verschiedener Pattern-Extraktion-Prompts** (V9.1+).
- **Multi-Modell-Vergleich (Sonnet vs Claude Opus)** (V9.1+).
- **Auto-Section-Mapping basierend auf ML-Klassifikation** (V10+).

## Foundation-Reuse

- **AWS Bedrock Sonnet Adapter (V1 deployed, V8 in_use)** mit eu-central-1.
- **ai_cost_ledger (V5 deployed)**: Cost-Tracking-Pattern.
- **selectThreeHebel pure-function-Pattern (V8 SLC-148)**: Inspiration fuer Strict-JSON-Output-Validation.
- **V4.1 Handbuch-Reader Sections (FEAT-028 deployed)**: liefert Liste verfuegbarer Sections fuer Curation-Section-Dropdown.
- **Cost-Cap-Pattern**: Reuse aus V8.1 FEAT-069 LLM-Augmentation (Cost-Cap, Pre-Approval).

## Success Criteria

- AC-1: 42 Threads (aus Test-Corpus) liefern mindestens 8 Pattern (Realistic-Case-Heuristik, /architecture validiert mit Test-Corpus).
- AC-2: Cost pro 1000 Emails Pattern-Extraktion <8 EUR (Sonnet-Bedrock-Schaetzung, validiert in /architecture).
- AC-3: Pre-Cost-Estimate-Modal erscheint bei erwarteten >10 EUR, GF muss bestaetigen.
- AC-4: Hard-Cap pro Tenant pro Monat blockiert weitere Runs mit klarer Fehlermeldung.
- AC-5: Curation-UI zeigt Pattern-Liste sortierbar nach Confidence + Theme.
- AC-6: Pro Pattern kann GF Akzeptieren/Ablehnen/Editieren/Section-Zuordnen.
- AC-7: Bulk-Aktion "alle confidence >0.8 akzeptieren" funktioniert.
- AC-8: Edit-Modal speichert Titel + Description-Edits, Evidence-Snippets bleiben read-only.
- AC-9: Audit-Log: jeder Sonnet-Call ist nachweisbar mit Region (Pflicht: eu-central-1), Token-Count, Cost.
- AC-10: Deterministischer Fallback bei Sonnet-Fail markiert Run als `failed`, GF kann Re-Try ausloesen ohne Doppel-Charge.
- AC-11: Abschluss-Button setzt Bulk-Run-Status `pattern_extracted` und triggert FEAT-074.

## Dependencies

- **Backend**: Bedrock-Sonnet-Adapter-Erweiterung fuer Pattern-Extraktion-Prompt, Worker-Job `email_bulk_pattern_extraction`, Cost-Cap-Logik.
- **Frontend**: Curation-UI Component, Pre-Cost-Estimate-Modal, Edit-Pattern-Modal, Section-Dropdown.
- **Data**: neue Tabelle `email_pattern` (oder evidence_chunk-Erweiterung — Q-V9-B).
- **Pre-Conditions**: FEAT-072 implementiert (Threads mit pii_redacted = true).

## Related

- BL-150 (Backlog-Tracker fuer FEAT-073)
- FEAT-072 (Thread-Aggregation als Vorstufe)
- FEAT-074 (Handbuch-Integration als naechste Stufe)
- FEAT-069 (V8.1 LLM-Augmentation — Cost-Cap-Reuse-Pattern)
- FEAT-028 (V4.1 Handbuch-Reader — Sections-Quelle)
- data-residency.md (Bedrock eu-central-1-Pflicht)
- RPT-373 (Discovery V9 = Bulk-Import)
