# FEAT-084 — OKF Bundle-Assembly + Konformitäts-Check (alongside Handbuch-ZIP)

- Status: planned
- Version: V9.7
- Created: 2026-06-14

## Purpose
Setzt die von FEAT-083 erzeugten Concept-Dateien zu einem OKF-v0.1-konformen Bundle zusammen (Root-`index.md` + `log.md` + Verzeichnisstruktur), packt es **zusätzlich** ins bestehende Handbuch-ZIP (alongside, nicht ersetzen) und validiert das Ergebnis programmatisch über einen Konformitäts-Check.

## Why it matters
Einzelne Concept-Dateien sind nur dann ein nutzbares OKF-Bundle, wenn sie über die reservierten Dateien `index.md` (Einstieg + Versions-Deklaration) und `log.md` (Änderungshistorie) navigierbar und maschinell validierbar sind. Der Konformitäts-Check verhindert stillen Format-Drift (OKF v0.1 ist jung/churn-anfällig) und macht „wir liefern in OKF" überprüfbar statt behauptet. Alongside bewahrt das menschenlesbare narrative Handbuch als eigenständiges Produkt-Deliverable.

## How it works
- Neues isoliertes Bundle-Modul (Proposal-Vorschlag `src/lib/handbook/okf/bundle.ts`) + Konformitäts-Check (`src/lib/handbook/okf/conformance.ts`).
- **Root-`index.md`:** Frontmatter `okf_version: "0.1"` + `strategaize_okf_profile: "1.0"`; OKF-Bullet-Form (`* [Title](/pfad.md) - description`), gruppiert nach Section.
- **`log.md`:** ein Eintrag pro Snapshot-Generierung (ISO-Datum-Heading, `Creation`/`Update`-Bullets, neueste zuerst).
- **Packaging (alongside):** OKF-Bundle als eigener Ordner (Vorschlag `okf/` bzw. `concepts/`) **zusätzlich** zum bestehenden `handbuch/`-Ordner im selben Download-ZIP; das narrative Handbuch bleibt byte-für-byte unverändert. (Selber-ZIP-vs-separater-Endpoint = Q-V9.7-A in `/architecture`.)
- **Worker-Wiring:** `handle-snapshot-job` ruft den OKF-Emitter additiv nach dem bestehenden Renderer; Worker-Kern bleibt OKF-agnostisch (ruft nur das isolierte Modul).
- **Konformitäts-Check (TDD-RED zuerst):** parst das erzeugte Bundle und prüft SC-V9.7-1..5 programmatisch; läuft als Vitest + optional als CI-Gate.

## In Scope
- Bundle-Builder (root `index.md` + `log.md` + Verzeichnis) + Cross-Link-Auflösbarkeit.
- Additive Integration in `handle-snapshot-job` + Download-Pfad (Bundle-Inhalt erweitert, ZIP-Endpoint bleibt).
- Konformitäts-Check + Tests; optionale Gegenprobe mit Googles `okf/viz.html`.

## Out of Scope
- Per-Concept-Serialisierung (FEAT-083).
- Ersetzen / Wegfall des narrativen `handbuch/`-ZIP.
- Neuer Download-UI/Endpoint, falls `/architecture` „selber ZIP" wählt (Default-Empfehlung).
- `email_synthesized_unit`-Einschluss.

## Acceptance
- SC-V9.7-4 (Root-`index.md` deklariert `okf_version` + `strategaize_okf_profile`, Bullet-Form), SC-V9.7-5 (`log.md` mit Snapshot-Eintrag), SC-V9.7-6 (Cross-Links auflösbar), SC-V9.7-8 (Konformitäts-Check parst Bundle + prüft SC-1..5), SC-V9.7-10 (bestehendes Handbuch-ZIP unverändert/funktional — alongside). Siehe Roadmap V9.7 Success Criteria.

## Refs
- Rule `c:/strategaize/strategaize-dev-system/.claude/rules/strategaize-okf-profile.md` (Bundle-Konventionen).
- Rule `okf-spec-monitoring.md` (Drift-Absicherung) — Cron `okf-spec-watch` läuft monatlich.
- Ist-Code: `src/workers/handbook/handle-snapshot-job.ts`, `renderer.ts`, `zip-builder.ts`, `index-builder.ts`; Endpoint `src/app/api/handbook/[snapshotId]/download/route.ts`.
- /discovery RPT (V9.7), /requirements RPT (V9.7).
