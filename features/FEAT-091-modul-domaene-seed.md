# FEAT-091 — Modul-Domaene + Content-Seed M-04/05/06 + KI-Hebel-Katalog

- Version: V10
- Status: planned
- Backlog: BL-510
- Created: 2026-06-20

## Was
Die Daten-/Liefer-Domaene fuer ein **Modul** und der Seed der 3 Prio-A-Module. Ein Modul traegt: Fragebogen Stufe-1-Kern + Stufe-2-Vertiefung, Output-Kontrakt (Entscheidung / Standard / Implementierungsschritt) und eine KI-Hebel-Liste mit Reifegrad 1-4. Module sind **lebende Dokumente** (aus IP-Bestand geseedet, laufend ergaenzbar).

## Warum
Ist das Fundament, auf dem Capture (FEAT-093), KI-Output (FEAT-094) und Reader (FEAT-095) aufsetzen. Die Modul-Inhalte existieren bereits als IP (Dev-System: `StrategAIze Module.xlsx`, M-04-Modul-Spec) und muessen in eine konsumierbare Struktur ueberfuehrt werden.

## In Scope (V10)
- Modul-Struktur (Architektur-Fork: neue Tabellen `modul`/`modul_output`/`ki_hebel` vs. Reuse `template`/`capture_session`/`knowledge_unit` — /architecture entscheidet).
- Seed M-04 Grundlegende Finanzsteuerung (GuV/Bilanz/Cash), M-05 Ergebnisrechnung n. Produkten/Segmenten (DB), M-06 Liquiditaetsplanung & Zahlungsstroeme — je Fragebogen Stufe-1+2.
- KI-Hebel-Katalog je Modul mit Reifegrad 1-4 (M-04 z.B. Monatsreport-Autokommentar RF2, KPI-Cockpit-Ampellogik RF2, Closing-Workflow RF1).
- Output-Kontrakt-Definition: Entscheidung / Standard / Implementierungsschritt.

## Out of Scope (V10)
- Die uebrigen 43 Module (M-01..M-03, M-07..M-46) — spaeter.
- Modul-Authoring-/Editor-UI fuer den StB (Module sind Strategaize-kuratiert).
- Wissensnetzwerk-Pool / Cross-Tenant-Aggregation (Stufe-3, spaetere Version).

## Reuse
pgvector-RAG (`036_pgvector_knowledge_chunks.sql`), Template-/Seed-Pattern aus V6.3/V8 (`102_v8_*`-Seed-Skripte), DECISIONS-Migrationspattern.

## Success / Acceptance
- M-04/05/06 sind als konsumierbare Module im System vorhanden (Fragebogen Stufe-1+2 + KI-Hebel Reifegrad 1-4 + Output-Kontrakt).
- Seed ist idempotent (ON CONFLICT, re-applyable).
- Module sind tenant-sichtbar via RLS.

> Detail + Constraints: PRD `## V10 — StB-Vertikale Phase 1`. Forks → /architecture V10. Naechste freie Migration = 124.
