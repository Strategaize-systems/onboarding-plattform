# FEAT-063 — 10-Prinzipien-Teaser-Template + Stufen-Lookup-Daten

**Version:** V8
**Status:** planned
**Created:** 2026-05-28
**Related Slice:** SLC-148 (to be planned in /slice-planning V8)

## Purpose

Liefert die **Daten-Grundlage** fuer die V8 Mandanten-Report-Teaser-Diagnose:

1. Ein neues Template-Objekt `exit-readiness-teaser-v1` in `public.template`, das die 10 Strategaize-Prinzipien der Uebergabefaehigkeit als strukturierten Fragebogen abbildet (47 Fragen ueber 11 Module).
2. Die Stufen-Lookup-Tabelle (9 Module x 5 Stufen x 2 Perspektiven = 90+ Inhalts-Bloecke) als strukturierte Daten — Quelle: `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_LEVELS.md`.

Diese Daten sind die nicht-LLM-Grundlage fuer FEAT-064 (UI-Render), FEAT-065 (Score-Engine) und FEAT-066 (Bericht-Renderer). Strategaize-Methodik-Substanz wird hier 1:1 ins Repo gespiegelt — keine LLM-Generierung, keine Interpretation.

## Problem

- Die V6.3-Variante (`partner_diagnostic_v1` LIVE seit 2026-05-17) bildet einen anderen Use-Case ab (Workshop-Output, 24 Fragen, 6 Blocks).
- Die V1-Voll-Variante (`exit-readiness-v1.0.0.json` LIVE seit V1) ist fuer bestehende Strategaize-Kunden im Mandats-Verhaeltnis gedacht, nicht fuer Teaser-Distribution.
- Die 10-Prinzipien-Methodik (Quelle: `EXIT_READINESS_PRINZIPIEN.md`) ist in der Onboarding-Plattform noch nicht abgebildet — der Mandanten-Report-Prototyp 2026-05-28 ist die Substanz-Vorlage, jetzt portierungs-reif.

## In Scope

1. **Template-Seed-Migration** — additiv, neue Row in `public.template` mit:
   - `slug = 'exit-readiness-teaser-v1'`
   - `version = 1` (FEAT-049 UNIQUE(slug, version) Schutz)
   - `metadata.usage_kind = 'mandanten_report_teaser_v1'` (analog V6.3 DEC-126 Worker-Branch-Strategie)
   - `metadata.scoring_kind = 'sui_weighted'` (siehe FEAT-065)
   - `metadata.report_renderer = 'mandanten_report_v2'` (siehe FEAT-066)
   - `blocks` JSONB mit 11 Modulen (Modul 0 + Module 1-9 + Modul 10)

2. **47 Fragen** strukturiert als JSONB innerhalb `template.blocks[].questions[]`:
   - **Modul 0** (5 Fragen Ja/Teilweise/Nein): M0.1 Vertraege, M0.2 Buergschaften/Konstrukte, M0.3 Geistiges Eigentum, M0.4 Anstellungs-Vertraege, M0.5 Compliance
   - **Modul 1** (4 Fragen Skala 1-5): F1.1..F1.4 Skalierbares Produkt
   - **Modul 2** (4 Fragen Skala 1-5): F2.1..F2.4 Kunden-Fokus
   - **Modul 3** (6 Fragen Skala 1-5): F3.1..F3.6 Liquiditaet + Zahlen-Steuerung
   - **Modul 4** (4 Fragen Skala 1-5): F4.1..F4.4 Vertrieb ohne Inhaber (inkl. KI-Frage F4.4)
   - **Modul 5** (3 Fragen Skala 1-5): F5.1..F5.3 Wiederkehrende Umsaetze
   - **Modul 6** (6 Fragen Skala 1-5): F6.1..F6.6 Datenbasis + KI-Reife
   - **Modul 7** (4 Fragen Skala 1-5): F7.1..F7.4 Wissenssystem
   - **Modul 8** (7 Fragen Skala 1-5): F8.1..F8.7 Fuehrung + Team + KI-Verantwortung
   - **Modul 9** (5 Fragen Skala 1-5): F9.1..F9.5 Wertschaffen + KI-Strategie
   - **Modul 10** (5 Reflexions-Textfelder): R10.1.1..R10.1.3 + R10.2.1..R10.2.2

3. **Stufen-Lookup-Daten** — Quelle entscheidet /architecture Q-V8-H (statisches JSON-File `src/data/exit-readiness-levels-v1.json` oder im Template-Row als `metadata.stufen_lookup`):
   - 9 Module (1-9) x 5 Stufen (1-5) = 45 Stufen-Eintraege
   - Jeder Eintrag hat: `was_es_bedeutet` (Markdown-Text aus EXIT_READINESS_LEVELS.md "Was es bedeutet"-Sektion) + `unsere_empfehlung` (Markdown-Text aus "Was der Steuerberater im Gespraech sieht"-Sektion, Tonalitaet-Migrate auf "Unsere Empfehlung" gegenueber Mandant, nicht gegenueber StB)
   - Plus 9 "Worum es geht"-Texte (Modul-Level, nicht Stufen-Level) aus EXIT_READINESS_PRINZIPIEN.md "Botschaft an den Unternehmer"

4. **Pflicht-Tonalitaets-Migration** beim Stufen-Lookup-Import: der LEVELS.md-Text spricht den Steuerberater an ("Was der Steuerberater im Gespraech sieht"), der Mandanten-Report spricht den Mandanten direkt an aus Strategaize-Sicht. Transformation entweder manuell beim Import oder per LLM-Pass (siehe Q-V8-C in /architecture).

5. **Score-Mapping fuer Skala 1-5** als Template-Daten:
   - Stufe 1 "Noch gar nicht vorhanden" → Score 0
   - Stufe 2 "Erste Ansaetze" → Score 2
   - Stufe 3 "Teilweise implementiert" → Score 5
   - Stufe 4 "Weitgehend etabliert" → Score 8
   - Stufe 5 "Vollstaendig etabliert + belastbar" → Score 10

6. **Gewichtungs-Konfiguration** im Template-Metadata fuer SUI-Berechnung (verarbeitet von FEAT-065):
   - Module 1-8 je 10% (gesamt 80%)
   - Modul 9 doppelt = 20%
   - Modul 0 und Modul 10 = 0% (separate Sektionen im Report)

7. **Helper-Texts + Examples** pro Frage (optional, leer-startbar) — Reuse-Pattern aus FEAT-057 V7.1, Schema-additiv via `helper_text` + `examples_md`-Feldern in `template.blocks[].questions[]`.

## Out of Scope

- **LLM-Generierung der Stufen-Inhalte** — Stufen-Inhalt ist verbindliche Strategaize-Methodik-Substanz, kommt 1:1 aus LEVELS.md
- **Mehrsprachigkeit** (NL/EN) — V8.1+
- **Versionierte Stufen-Lookup-Updates** (z.B. "Stufe 3 von Modul 4 anders formuliert nach 6 Monaten Pilot") — V8.2+, vorerst Schreib-einmal-bei-Migration
- **Helper-Texts-Initial-Content** — Slice kann mit leeren Helper-Texts starten, Inhalts-Schreibarbeit ist separater Backlog-Item analog BL-115 V7.1
- **Replace-Migration** der bestehenden V1-6-Block-Variante oder V6.3-Variante — strict no-touch
- **Tenant-spezifische Frage-Anpassung** — V8 nutzt globales Template, EditableText (FEAT-056) fuer kuenftige Anpassbarkeit ab V8.1+

## Acceptance Criteria

- **AC-1 Template-Seed lebt**: Eine Row in `public.template` mit `slug='exit-readiness-teaser-v1'` und `version=1` existiert auf Coolify-DB. Idempotenter Migrations-Pfad (`ON CONFLICT (slug, version) DO UPDATE`) reusable fuer kuenftige Content-Updates.
- **AC-2 47 Fragen vollstaendig**: `template.blocks` enthaelt exakt 11 Module mit zusammen 47 Fragen (5 Hygiene + 37 Skala + 5 Reflexion). Vitest-Smoke pruefte Modul-IDs (M0..M10) + Frage-IDs (M0.1..M0.5 + F1.1..F9.5 + R10.1.1..R10.2.2).
- **AC-3 Score-Mapping korrekt**: Jede Skala-Frage hat `score_mapping: {1:0, 2:2, 3:5, 4:8, 5:10}`. Hygiene-Fragen ohne Score (Hausaufgaben-Logik). Reflexions-Fragen ohne Score.
- **AC-4 Stufen-Lookup vollstaendig**: 45 Stufen-Eintraege (9 Module x 5 Stufen) + 9 "Worum es geht"-Modul-Texte. Pro Stufen-Eintrag: `was_es_bedeutet` + `unsere_empfehlung` als Markdown-Strings.
- **AC-5 Tonalitaets-Transformation durchgefuehrt**: Stichproben-Pruefung von 5+ "Unsere Empfehlung"-Texten zeigt: kein "Wir sollten" ohne Strategaize-Sicht, kein "Ihr Steuerberater", kein "der Berater". Direkter Mandanten-Adressat ("Sie"-Form).
- **AC-6 Co-Existenz**: V6.3 `partner_diagnostic_v1`-Template + V1 `exit-readiness-v1.0.0`-Template (oder kompatibler V1-Slug) bleiben unveraendert in der DB lesbar.
- **AC-7 Vitest-Coverage**: Tests fuer Template-Parsing (47 Fragen detektiert), Score-Mapping-Konsistenz (5-Punkt-Skala = 0/2/5/8/10), Stufen-Lookup-Vollstaendigkeit (45 Eintraege).

## Technical Notes

- Migrations-Pfad analog V6.3 MIG-037 (`093_partner_diagnostic_template.sql`) — `ON CONFLICT (slug, version) DO UPDATE` idempotent
- Pattern-Reuse Stufen-Lookup-Datei in `src/data/` analog `src/data/email-blocks.json` oder aehnlich (zu validieren in /architecture)
- Wenn Q-V8-C (Score-Engine Hybrid-LLM) "deterministisch" entschieden wird: Stufen-Lookup ist 1:1-Render-Quelle ohne LLM-Pass
- Wenn Q-V8-C "LLM-augmentiert" entschieden wird: Stufen-Lookup ist Default-Text mit LLM-Personalisierung-Layer

## Cross-References

- **Quelle:** `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_PRINZIPIEN.md` (Fragebogen-Struktur + Score-Engine + SUI-Definition)
- **Quelle:** `c:/strategaize/strategaize-dev-system/docs/curriculum/v2/EXIT_READINESS_LEVELS.md` (Stufen-Lookup-Inhalt 9x5x2)
- **Bezug:** [[feedback-mandanten-empfehlung-unsere-nicht-stb]] — Tonalitaet "Unsere Empfehlung"
- **Bezug:** [[feedback-stb-co-hosting-kein-gemeinsamer-termin]] — Distribution-Use-Case
- **Reuse-Pattern:** V6.3 SLC-105 MIG-037 (Template-Seed-Migration)
- **Reuse-Pattern:** V7.1 FEAT-057 (helper_text + examples_md JSONB-Felder)
- **Konsumiert von:** FEAT-064 (UI rendert Fragen), FEAT-065 (Score-Engine liest Mapping), FEAT-066 (Renderer liest Stufen-Lookup)
