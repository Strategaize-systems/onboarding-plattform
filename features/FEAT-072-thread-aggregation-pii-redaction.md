# FEAT-072 — Thread-Aggregation + PII-Redaction-Pipeline

- Status: planned
- Version: V9
- Created: 2026-06-01

## Purpose
Klassifizierte Emails (FEAT-071-Output) werden zu Konversations-Threads zusammengefasst und durchlaufen einen PII-Redaction-Pass (Reuse der V5-Pipeline). Threads sind die Pattern-Extraktions-Einheit fuer FEAT-073. PII-Redaction stellt sicher, dass das Sonnet-Pattern-Extraktion-Pass nur pseudonymisierte Inhalte sieht (DSGVO-konform).

## Why it matters
Eine einzelne Email enthaelt selten ein vollstaendiges Pattern. Ein Pattern (z.B. "wie der GF auf Preis-Einwaende antwortet") entsteht erst im Konversations-Verlauf: Kunde fragt, GF antwortet, Kunde reagiert, GF rezitiert. Thread-Aggregation per `In-Reply-To`/`References`-Headers stellt die Konversation wieder her. PII-Redaction schuetzt Klarnamen, Email-Adressen, Telefonnummern und sonstige personenbezogene Daten vor dem Sonnet-Call — Pflicht fuer DSGVO + Founder-Direktive zur Datensparsamkeit.

## How it works

### Thread-Aggregation
1. **Input**: alle Emails des Bulk-Runs mit `pre_filter_label IN ('content', 'unclear')` nach FEAT-071-Approval (`private`/`newsletter`/`notification`/`short_reply` werden gefiltert).
2. **Thread-Bildung**: per `message_id` + `in_reply_to` + `references` (RFC-5322-Standard) werden Emails zu Threads gruppiert. `mailparser`-Output enthaelt die Header-Werte aus FEAT-070.
3. **Thread-Persistierung** in `email_thread`-Tabelle (oder evidence_chunk-Erweiterung — Q-V9-B):
   - thread_id (UUID)
   - tenant_id
   - bulk_run_id (FK auf email_bulk_run)
   - root_message_id
   - subject (vom Root)
   - email_count (Threadgroesse)
   - first_date, last_date
   - participant_pseudonyms (JSONB: `{"P1": "kunde-mueller", "P2": "gf-self"}`)
4. **Edge-Cases**:
   - Threads ohne Reply-Relation = Single-Email-Thread (gilt auch).
   - Reply-Loops (zirkulaere Referenz, sehr selten) -> hart unterbrochen nach 100 Emails / Thread.
   - Forward-Chains (mehrere `Fwd:`-Mails) bleiben separate Threads (kein Auto-Join).

### PII-Redaction-Pass
1. **V5-Pipeline-Reuse**: V5 SLC-076..078 Walkthrough-PII-Redaction (deployed) wird als Adapter integriert. /architecture entscheidet ob (a) V5-Pipeline direkt anwendbar oder (b) ein Email-spezifischer Adapter zwischenstuft (Q-V9-A).
2. **Email-spezifische Patterns** (zusaetzlich zu V5-Walkthrough-Patterns):
   - Email-Adressen in Headers (`from`, `to`, `cc`) und Body
   - Signaturen (Trigger-Token `--` oder `Mit freundlichen Gruessen`)
   - Telefonnummern (Signaturen, Body)
   - Klarnamen (Reuse V5)
   - Anschriften (Reuse V5)
3. **Pseudonymisierung**: pro Thread wird eine Participant-Map gebildet (z.B. `kunde-mueller@firma.de` -> `P1`, `gf@strategaize.de` -> `P2`). Body-Text wird mit Pseudonymen gerendert. Map bleibt in `email_thread.participant_pseudonyms` persistiert (NUR Tenant-intern lesbar, nicht Teil von Pattern-Output).
4. **Output**: `email_thread.redacted_body` (kompakter Konversations-Verlauf mit Pseudonymen + Zeitstempeln + Roles).
5. **Persistierung**: `email_message.pii_redacted = true` nach Pass.

### Status-View
- Detail-View pro Bulk-Run zeigt: "Threads: 42 (aus 89 content+unclear Emails). PII-Redaction: 42/42 abgeschlossen."

## In Scope (V9.0)

### Funktional
- Thread-Aggregation per RFC-5322-Headers (`message_id` + `in_reply_to` + `references`)
- Thread-Persistierung mit Pflicht-Metadaten
- PII-Redaction-Adapter (Reuse V5-Pipeline + Email-spezifische Patterns)
- Pseudonymisierung pro Thread (Map persistiert)
- Forward-Chain-Erkennung (separate Threads, kein Join)
- Edge-Case-Handling: Single-Email-Threads, Reply-Loops, fehlende References

### Nicht-Funktional
- Tenant-RLS auf email_thread
- Audit-Log: pro Thread ist nachweisbar welcher PII-Adapter mit welchen Pattern lief
- Performance: 1000 Emails -> Thread-Aggregation in <5 Minuten Worker-Zeit
- Idempotenz: Re-Run der Thread-Aggregation auf gleichem Bulk-Run-State ist no-op

## Out of Scope (V9.0)

- **Cross-Bulk-Run-Thread-Merge** (V9.1+): wenn GF zweite `.mbox` mit Forts. Konversation hochlaedt, bleibt das in V9.0 ein separater Thread.
- **Manuelle Thread-Korrektur** (V9.1+): kein UI fuer "diese 2 Threads zusammenfuegen".
- **Anhang-Inhalts-Redaction** (V9.1+): V9.0 redactioniert nur Email-Body, Anhaenge sind in FEAT-070 nicht als Inhalt persistiert.
- **Multi-Sprachen-PII-Patterns** (V9.1+): V9.0 deutsch + englisch (V5-Pattern-Stand).

## Foundation-Reuse

- **V5 PII-Redaction-Pipeline (SLC-076..078, deployed)**: Pattern-Library + Pipeline-Stufen-Pattern. /architecture entscheidet ob direkt anwendbar oder Email-Adapter zwischen.
- **`mailparser` Header-Output** aus FEAT-070: liefert `message_id` + `in_reply_to` + `references`.
- **Tenant-RLS-Pattern** aus V2/V5.

## Success Criteria

- AC-1: 89 content+unclear Emails werden zu 42 Threads aggregiert (Realistic-Case aus Test-Corpus).
- AC-2: Single-Email-Threads (kein Reply-Relation) erscheinen als 1-Email-Threads, nicht verloren.
- AC-3: Reply-Loops werden hart nach 100 Emails unterbrochen, kein Worker-Hang.
- AC-4: PII-Redaction-Pass entfernt Klarnamen, Email-Adressen, Telefonnummern aus body_text (Stichprobe pro Bulk-Run prueft 10% Threads).
- AC-5: Participant-Pseudonyms-Map persistiert mit korrekter Anzahl Participants pro Thread.
- AC-6: redacted_body enthaelt KEINE Email-Adressen, KEINE Klarnamen (Pattern-Scan im /qa).
- AC-7: Tenant-RLS verhindert Cross-Tenant-Read auf email_thread + participant_pseudonyms.
- AC-8: Audit-Log: pro Thread ist nachweisbar welche PII-Patterns angewendet wurden.
- AC-9: Re-Run ist idempotent (kein Doppel-Threading, kein Doppel-Redact).

## Dependencies

- **Backend**: Thread-Aggregation-Worker, PII-Adapter-Layer, V5-Pipeline-Wiring.
- **Data**: neue Tabelle `email_thread` (oder evidence_chunk-Erweiterung — Q-V9-B), Erweiterung email_message mit `pii_redacted` Flag.
- **Pre-Conditions**: FEAT-071 implementiert + GF-Approval-State `pre_filtered`.

## Related

- BL-149 (Backlog-Tracker fuer FEAT-072)
- FEAT-071 (Pre-Filter-Vorstufe)
- FEAT-073 (Pattern-Extraktion als naechste Stufe)
- V5 SLC-076..078 (PII-Redaction-Pipeline-Reuse-Anker)
- privacy-security.md (Pflicht-Pattern fuer PII-Handling)
- data-residency.md (PII-Verarbeitung in EU)
- RPT-373 (Discovery V9 = Bulk-Import)
