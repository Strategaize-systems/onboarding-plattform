# FEAT-083 — OKF Concept-Emitter (DB-Row → OKF-Concept-.md)

- Status: planned
- Version: V9.7
- Created: 2026-06-14

## Purpose
Ein isoliertes Emitter-Modul, das jede kuratierte Wissens-Row eines Handbuch-Snapshots in **eine** OKF-Concept-Datei (Markdown + YAML-Frontmatter) nach **Strategaize-OKF-Profil 1.0** serialisiert. Fein-granular: ein `knowledge_unit` / `sop` / `block_diagnosis` = ein `.md`. Reine Serialisierung — kein DB-Umbau, keine neue Persistenz.

## Why it matters
Der Handbuch-Export ist heute ein menschenlesbarer Sektions-Text (1 `.md` = 1 Sektion, viele Concepts verklumpt). OKF (Google Open Knowledge Format v0.1) verlangt agent-konsumierbare, einzeln adressierbare, cross-linkbare Concepts. Fein-granular liefert den eigentlichen OKF-Wert: jedes Finding/Risk/Action/SOP/Diagnose wird ein versionierbares, herstellerneutrales, maschinen-lesbares Wissens-Atom — bereit für jeden KI-Agenten und cross-platform (OP→IS→BS). Positionierung/Interop, kein Moat.

## How it works
- Neues isoliertes Modul (Pfad in `/architecture`, Proposal-Vorschlag `src/lib/handbook/okf/emit.ts`).
- **Type-Mapping** (Profil 1.0): `knowledge_unit.unit_type` → `type: finding|risk|action|observation`; `sop` → `type: sop`; `block_diagnosis` → `type: diagnosis`.
- **Frontmatter pro Concept:** Pflicht `type`; OKF-empfohlen `title`, `description`, `tags` (aus `themes` wo vorhanden), `timestamp` (aus `updated_at`, ISO 8601); Strategaize-Extension `strategaize_source: op`, `strategaize_tenant`, `confidence`, `curation_status`, `evidence_count`, `strategaize_id` (DB-Row-UUID).
- **`confidence`-Mapping:** numerische Quellwerte → enum nach Profil-Schwellen (<0.5 low, <0.8 medium, sonst high); text-enum 1:1.
- **`# Citations`-Section** pro Concept aus `evidence_refs` (KU) — nummerierte Referenzen; leer = keine Citations-Section.
- **Cross-Links** bundle-relativ-absolut (z.B. KU → zugehörige `diagnosis`), aus den bestehenden Block-/Subtopic-Bezügen.
- **Isolation (BLOCKING):** keine OKF-Felddetails in Worker-Kern/Business-Logik/Queries — alles im Emitter (Profil-Rule AC-7).

## In Scope
- Per-Concept-Serializer für die heute vom Snapshot-Worker geladenen Quellen: `knowledge_unit`, `block_diagnosis`, `sop`.
- Frontmatter-Mapping inkl. `confidence`-Schwellen + `# Citations` + Cross-Links.
- Unit-Tests (TDD-RED zuerst) je Concept-Typ.

## Out of Scope
- Bundle-Assembly (root `index.md`, `log.md`, Verzeichnis, Packaging) → FEAT-084.
- `email_synthesized_unit` → spätere Version (V9.8 ist bereits durch Tag-Vokabular/BL-505 belegt; Nummer offen).
- DB-/Schema-Änderung, Worker-Daten-Verdrahtung neuer Quellen.
- Ersetzen des bestehenden narrativen `handbuch/`-ZIP (bleibt unverändert — alongside).

## Acceptance
- SC-V9.7-1 (Konformitäts-Minimum: parsebares Frontmatter + nicht-leeres `type`), SC-V9.7-2 (`type` aus registrierter Tabelle), SC-V9.7-3 (Pflicht-Extension-Felder + `confidence`-Schwellen), SC-V9.7-6 (`# Citations` + auflösbare Cross-Links), SC-V9.7-7 (Emitter isoliert), SC-V9.7-9 (keine PII über das Nötige hinaus). Siehe Roadmap V9.7 Success Criteria.

## Refs
- Rule `c:/strategaize/strategaize-dev-system/.claude/rules/strategaize-okf-profile.md` (Profil 1.0, Mapping-Tabelle).
- Proposal `c:/strategaize/strategaize-dev-system/docs/OKF_OP_HANDBOOK_EXPORT_SLICE.md` (Achtung: `handbook.json`-Behauptung darin ist faktisch falsch — existiert nicht).
- /discovery RPT (V9.7), /requirements RPT (V9.7).
