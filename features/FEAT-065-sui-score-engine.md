# FEAT-065 — SUI-Score-Engine (Strategaize Uebergabefaehigkeits-Index)

**Version:** V8
**Status:** planned
**Created:** 2026-05-28
**Related Slice:** SLC-148 (gemeinsam mit FEAT-063 in /slice-planning V8)

## Purpose

Implementiert die deterministische Score-Berechnung fuer die V8 Mandanten-Report-Teaser-Diagnose:

1. **SUI (Strategaize Uebergabefaehigkeits-Index 0-100)** — gewichtetes Mittel ueber Module 1-9, Modul 9 doppelt gewichtet (20%).
2. **Modul-Score 0-10** pro Modul (Module 1-9) als Durchschnitt der Frage-Scores.
3. **3-Stufen-Klassifizierung des SUI**: Strukturluecke (0-30 rot), Teil-Reife (31-55 amber), Tragbar (56-100 gruen).
4. **Modul-Stufen-Mapping** (1-5) basierend auf Modul-Score, fuer Bericht-Renderer (FEAT-066) zur Stufen-Lookup-Aufloesung.
5. **Hausaufgaben-Aggregation** fuer Modul 0 (Hygiene-Pruefung): jeder Eintrag mit Status `nein` oder `teilweise` wird als Hausaufgaben-Item gesammelt.
6. **Reflexions-Aggregation** fuer Modul 10: Antworten als Zitat-Sammlung im Bericht, kein Score-Beitrag zum SUI.

## Problem

- V1 hatte keinen Gesamt-Score-Index (Voll-Diagnose-Variante hat 6-Block-Scores ohne gewichteten Gesamt).
- V6.3 SLC-105 hat `computeBlockScores` als Pure-Function in `src/lib/diagnose/computeBlockScores.ts` etabliert (deterministische Score-Berechnung Modul-Level fuer V6.3 partner_diagnostic_v1).
- V8 braucht zusaetzlich SUI-Gesamt-Score-Berechnung mit Gewichtung und Klassifizierung — V6.3-Pattern reuse-faehig fuer Modul-Score, aber Gesamt-Score-Logik ist neu.
- V8 Modul-Stufen-Mapping (Modul-Score 0-10 → Stufe 1-5) wird benoetigt um FEAT-066 Stufen-Lookup korrekt aufzuloesen.

## In Scope

1. **Pure-Function `computeModuleScores(answers, template)`** — Erweiterung oder Wrapper um V6.3 `computeBlockScores`:
   - Iteriert ueber Module 1-9
   - Pro Modul: Durchschnitt der Frage-Scores (0-10)
   - Filtert Reflexions-Fragen (Modul 10) heraus
   - Filtert Hygiene-Fragen (Modul 0) heraus
   - Returns `{ moduleScores: { m1: number, m2: number, ..., m9: number } }`

2. **Pure-Function `computeSui(moduleScores)`** — gewichtetes Mittel:
   - SUI = (m1*10 + m2*10 + m3*10 + m4*10 + m5*10 + m6*10 + m7*10 + m8*10 + m9*20) / 100
   - Wegen je 0-10 Modul-Score und 100-Punkt-Klassifizierungsskala: Modul-Score × 10 = Modul-100-Punkt-Beitrag (so dass SUI direkt 0-100 ist)
   - Returns `number` 0-100

3. **Pure-Function `classifySui(sui)`** — 3-Stufen-Klassifizierung:
   - 0-30 → `{ kind: 'strukturluecke', color: 'rot', label: 'Strukturluecke', meaning: 'Substantielle Vorarbeit noetig...' }`
   - 31-55 → `{ kind: 'teil_reife', color: 'amber', label: 'Teil-Reife', meaning: 'Erste Substanz da, aber wesentliche Luecken...' }`
   - 56-100 → `{ kind: 'tragbar', color: 'gruen', label: 'Tragbar', meaning: 'Grundsaetzlich uebergabefaehig...' }`

4. **Pure-Function `mapModuleScoreToStufe(moduleScore)`** — Modul-Score (0-10) → Stufe (1-5):
   - 0-1 → Stufe 1
   - 1.01-3 → Stufe 2
   - 3.01-6 → Stufe 3
   - 6.01-9 → Stufe 4
   - 9.01-10 → Stufe 5
   - (Bereichs-Grenzen aus Score-Mapping-Reverse: 0=1, 2=2, 5=3, 8=4, 10=5 → Mittelpunkte als Schwellen)

5. **Pure-Function `aggregateHausaufgaben(answers, template)`** — Modul 0:
   - Iteriert ueber 5 Hygiene-Fragen
   - Sammelt alle mit Status `nein` oder `teilweise`
   - Returns `Array<{ frage_id: string, frage_text: string, status: 'nein' | 'teilweise' }>`

6. **Pure-Function `aggregateReflexion(answers, template)`** — Modul 10:
   - Iteriert ueber 5 Reflexions-Fragen
   - Sammelt alle nicht-leeren Textantworten
   - Returns `Array<{ frage_id: string, frage_text: string, antwort_text: string }>`

7. **Server-Action `finalizeMandantenReport(captureSessionId)`** — Worker-Pipeline-Erweiterung:
   - Reuse bestehender V6.3 `runLightPipeline`-Branch-Logik
   - Branching ueber `template.metadata.usage_kind='mandanten_report_teaser_v1'`
   - Berechnet alle 6 Pure-Functions sequenziell
   - Speichert Score-Snapshot in DB (siehe Q-V8-G in /architecture: knowledge_unit vs. block_checkpoint vs. neue Tabelle)
   - Triggert ggf. LLM-Augmentation fuer "Was es in Ihrer Firma bedeutet" personalisierter Text (Q-V8-C entscheidet)

8. **3-Strategie-Hebel-Auswahl** (Default deterministisch, Q-V8-D entscheidet ggf. LLM):
   - Default-Regel: 3 Module mit niedrigstem Modul-Score = 3 Strategie-Hebel
   - Returns `Array<{ modul_id: 'm1'..'m9', modul_name: string, score: number, stufe: number, empfehlung: string }>`

9. **Vitest** mit konkreten Beispiel-Antwort-Sets:
   - Alles Stufe 1 → SUI = 0, Klassifizierung Strukturluecke
   - Alles Stufe 3 → SUI = 50, Klassifizierung Teil-Reife
   - Alles Stufe 5 → SUI = 100, Klassifizierung Tragbar
   - Edge-Case: Modul 9 stark, Module 1-8 schwach → Gewichtungs-Effekt sichtbar
   - Hausaufgaben: 3 Nein + 1 Teilweise + 1 Ja → 4 Items zurueck

## Out of Scope

- **LLM-Augmentation** standardmaessig — Q-V8-C entscheidet, Default deterministisch
- **Verlaufsbeobachtung / 2-SUI-Vergleich** — V8.2+
- **Pro-Tenant-Gewichtungs-Anpassung** — V9+
- **Score-Persistenz-Schema** — Q-V8-G entscheidet, vorerst Reuse V6.3-Pattern (block_checkpoint + knowledge_unit)
- **Auto-Re-Berechnung** wenn nachtraeglich Antworten geaendert — V8.1+
- **Historie der Score-Berechnungen** (Audit-Log) — V8.1+

## Acceptance Criteria

- **AC-1 SUI-Score-Korrektheit**: Vitest-Tests fuer 5+ konkrete Antwort-Sets verifizieren SUI-Wert genau (z.B. alles Stufe 3 → SUI = 50.0 ± 0.01).
- **AC-2 Modul-9-Doppelte-Gewichtung**: Vitest mit asymmetrischem Antwort-Set (alle Module 1-8 Stufe 5, Modul 9 Stufe 1) verifiziert SUI-Wert nicht 88.9 (Mittel 1-9 ohne Gewichtung) sondern 80.0 (Modul 9 doppelt = 20% Beitrag).
- **AC-3 Klassifizierungs-Schwellen**: Vitest fuer SUI=0, 29, 30, 31, 55, 56, 100 mit exakter Erwartung der `kind`-Werte.
- **AC-4 Modul-Score-zu-Stufe-Mapping**: Vitest fuer Score 0, 2, 5, 8, 10 + Bereichs-Mitten 1, 4, 7 mit exakter Stufe-Erwartung (1, 2, 3, 4, 5).
- **AC-5 Hausaufgaben-Aggregation**: Vitest mit 5 Antworten (2 Ja + 2 Nein + 1 Teilweise) gibt exakt 3 Items zurueck.
- **AC-6 Reflexions-Aggregation**: Vitest mit 5 Reflexions-Antworten (3 ausgefuellt + 2 leer) gibt exakt 3 Items zurueck.
- **AC-7 Hebel-Auswahl deterministisch**: Vitest mit definiertem Score-Profil (z.B. m1=8, m2=2, m3=5, m4=2, m5=9, m6=3, m7=7, m8=4, m9=6) gibt drei Module zurueck (m2, m4, m6 mit Scores 2, 2, 3 in dieser Reihenfolge).
- **AC-8 Server-Action End-to-End**: `finalizeMandantenReport` wird auf Test-Mandant ausgefuehrt, alle Aggregations-Daten landen in DB-Persistenz, Bericht-Renderer (FEAT-066) kann die Daten lesen.
- **AC-9 Co-Existenz**: V6.3 `computeBlockScores`-Konsum (partner_diagnostic_v1) bleibt unveraendert funktional. Vitest-Snapshots V6.3 nicht regressiv.
- **AC-10 Live-Smoke**: Founder fuellt eine Diagnose komplett aus, SUI-Score-Wert ist plausibel (Founder-Verdict), Hausaufgaben-Liste vollstaendig, Hebel-Auswahl macht Sinn.

## Technical Notes

- Bestehende `src/lib/diagnose/computeBlockScores.ts` ist Vorlage — neue Pure-Functions koennten in `src/lib/diagnose/sui-engine.ts` leben
- `runLightPipeline`-Worker-Branch ist bestehende V6.3-Architektur, V8-Erweiterung additiv ueber `usage_kind`-Switch
- Wenn Q-V8-C LLM-augmentation entschieden wird: separater Worker-Pipeline-Step **nach** SUI-Berechnung
- Aufwand-Schaetzung: ~6-8h Pure-Functions + Vitest + Worker-Branch + Persistenz-Logik

## Cross-References

- **Quelle:** EXIT_READINESS_PRINZIPIEN.md (SUI-Definition + Score-Berechnung + Klassifizierung)
- **Reuse-Pattern:** V6.3 SLC-105 `computeBlockScores` Pure-Function
- **Reuse-Pattern:** V6.3 `runLightPipeline` Worker-Branch via template.metadata
- **Konsumiert:** FEAT-063 (Score-Mapping aus Template-Daten)
- **Konsumiert von:** FEAT-066 (Renderer braucht alle Aggregations-Daten)
- **Konsumiert von:** FEAT-058 V7.2 Telemetrie (Optional: SUI-Score-Berechnung als Event)
