# FEAT-093 — Modul-Fragebogen-Capture (Stufe-1-Kern + Stufe-2-Vertiefung)

- Version: V10
- Status: planned
- Backlog: BL-512
- Created: 2026-06-20

## Was
Der StB beantwortet die **Modul-Fragebogen** fuer die eigene Kanzlei — je Modul Stufe-1 (Kern) + Stufe-2 (Vertiefung). KI-getriebener Daten-Bedarf: „wir sagen, welche Daten wir brauchen → KI strukturiert/sortiert".

## Warum
Capture liefert den Input fuer die KI-Output-Generierung (FEAT-094). Ohne strukturierte Modul-Antworten kein Modul-Output.

## In Scope (V10)
- Fragebogen-Capture pro Modul (M-04/05/06), Stufe-1-Kern + Stufe-2-Vertiefung.
- Voice-Input optional (Reuse Whisper, EU).
- Speichern/Wiederaufnehmen (Block-Submit-Pattern wie OP-Questionnaire).

## Out of Scope (V10)
- Mandanten-Capture (Stufe-2).
- Mehr als die 3 Module.
- Bulk-/Email-Import als Modul-Datenquelle (separate V9-Linie).

## Reuse
OP-Capture-Mode / Questionnaire (Block-Submit), Whisper-Adapter (EU, `data-residency.md`), bestehende `capture_session`-Mechanik.

## Success / Acceptance
- Der StB kann pro Modul Stufe-1 + Stufe-2 beantworten und speichern.
- Antworten sind strukturiert und an die KI-Output-Stufe uebergebbar.
- Tenant-Isolation (RLS) verifiziert.

> Detail + Constraints: PRD `## V10 — StB-Vertikale Phase 1`. Forks → /architecture V10.
