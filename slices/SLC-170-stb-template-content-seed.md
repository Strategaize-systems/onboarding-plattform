# SLC-170 — StB Template-Content-Seed (MIG-125)

- Version: V10
- Feature: FEAT-091 (Content-Teil)
- Backlog: BL-510
- Status: planned
- Priority: High
- Created: 2026-06-21
- Parallel-Group: A (Foundation) — MIG-125, disjunkt zu SLC-169 (MIG-124) + SLC-171
- MIG reserviert: **125** (`sql/migrations/125_v10_stb_template_seed.sql`)
- Worktree (SaaS-Pflicht): eigener Branch `v10-slc170-template-seed`, Merge nach /qa-PASS

## Ziel
Den Content der Vertikale als idempotente Seed-Migration anlegen: 4 `template`-Rows — 1 Blueprint (`stb_blueprint_kanzlei`) + 3 Module (`stb_modul_m04`/`m05`/`m06`). Jede mit `blocks` (Fragebogen Stufe-1-Kern + Stufe-2-Vertiefung ueber `ebene`/`required`) und KI-Hebel-Katalog (Reifegrad 1-4). Content aus Dev-System-IP. Reuse der bestehenden `template`-Tabelle (kein neues Schema).

## Architektur-Anker
- DEC-234: Blueprint = neue `template`-Row mit `diagnosis_schema`/`diagnosis_prompt`; Mechanismus reusen, Inhalt neu (NICHT Exit-Readiness-Content, DATEV-Abgrenzung SC-6).
- DEC-233: Module als `template`-Rows; das strukturierte Deliverable landet spaeter in `modul_output` (SLC-169).
- IP-Quellen (Dev-System strategy-docs): `StrategAIze Module.xlsx` (46 Module/11 Kategorien, M-04/05/06 = Kern Finanzen&Controlling), `M-04 – Grundlegende Finanzsteuerung (GuV-Bilanz-Cash).docx` (volle Modul-Spec), `StrategAIze Workspace.docx` (Liefervorlage).
- Template-Versionierung: `UNIQUE(slug, version)` (MIG-096) — idempotent via `ON CONFLICT (slug, version) DO UPDATE`.

## Akzeptanzkriterien
- **AC-170-1:** 4 `template`-Rows geseedet: `stb_blueprint_kanzlei` v1.0 (mit `diagnosis_schema` + `diagnosis_prompt` + `metadata.usage_kind='stb_blueprint'`) + `stb_modul_m04`/`m05`/`m06` v1.0 (je `blocks` mit Stufe-1-Kern [`required=true`] + Stufe-2-Vertiefung [`ebene=2`/`required=false`] + `metadata.ki_hebel[]` Reifegrad-1-4-Katalog).
- **AC-170-2:** Seed idempotent — `ON CONFLICT (slug, version) DO UPDATE`; 2. Apply = 0 zusaetzliche Rows, Content-Update statt Insert.
- **AC-170-3:** M-04 vollstaendig nach Spec (Fragebogen + KI-Hebel + Output-Contract-Hinweis Entscheidung/Standard/Implementierungsschritt). M-05 (Ergebnisrechnung n. Produkten/Segmenten) + M-06 (Liquiditaetsplanung & Zahlungsstroeme) aus `StrategAIze Module.xlsx` autoriert — Tiefe dokumentiert (siehe R-170-1).
- **AC-170-4:** Templates via RLS fuer den Tenant lesbar (Reuse bestehender `template`-RLS).
- **AC-170-5:** DB-Sidecar-Test: 4 Templates ladbar, `blocks` parst (Stufe-1/Stufe-2-Split korrekt), Re-Apply idempotent; `tsc`/`eslint` 0.

## Micro-Tasks

### MT-1: MIG-125 Blueprint-Template `stb_blueprint_kanzlei`
- Goal: Blueprint-Diagnostik-Template (eigene Kanzlei) seedbar.
- Files: `sql/migrations/125_v10_stb_template_seed.sql` (neu, Teil 1).
- Expected behavior: `INSERT ... ON CONFLICT (slug, version) DO UPDATE` mit `blocks` (Struktur-Fragen operative Wirk-Schicht), `diagnosis_schema` (Ampel/Reifegrad + Modul-Routing-Hinweis M-04/05/06), `diagnosis_prompt`, `metadata.usage_kind=<value>`. **`usage_kind`-Wert mit SLC-172 abgestimmt (QA-Finding):** der condensation-Worker `handle-job.ts` routet per `usage_kind`; aktuell nur `self_service_partner_diagnostic` + `mandanten_report_teaser_v1` erkannt. Entweder `self_service_partner_diagnostic` reusen (wenn Blueprint-Output = Diagnostik-Shape, 0 Worker-Code) ODER neuen Wert `stb_blueprint` + Branch in SLC-172 (siehe SLC-172 R-172-1). Default-Empfehlung: Reuse `self_service_partner_diagnostic` falls Shape passt.
- Verification: Row vorhanden, `diagnosis_schema` valid-JSON, 2. Apply idempotent.
- Dependencies: none.

### MT-2: MIG-125 Modul-Template M-04 (volle Spec)
- Goal: M-04 Grundlegende Finanzsteuerung als vollstaendiges Modul-Template.
- Files: `sql/migrations/125_v10_stb_template_seed.sql` (Teil 2), Content-Extrakt-Notiz `docs/stb-vertikale/M-04-seed-source.md` (neu, Quell-Mapping IP→blocks).
- Expected behavior: `blocks` Stufe-1-Kern (Pflicht: GuV/Bilanz/Cash-Grundgroessen, KPI-Set) + Stufe-2-Vertiefung; `metadata.ki_hebel[]` (Reifegrad 1-4, z.B. Monatsabschluss-Kadenz, Standard-Monatsreport-Automatisierung); Output-Contract-Marker.
- Verification: blocks-Split Stufe-1/2 korrekt, ki_hebel mit reifegrad 1-4.
- Dependencies: MT-1 (gleiche Migration-Datei).

### MT-3: MIG-125 Modul-Templates M-05 + M-06 (aus xlsx autoriert)
- Goal: M-05 + M-06 als Modul-Templates, Tiefe aus `StrategAIze Module.xlsx`.
- Files: `sql/migrations/125_v10_stb_template_seed.sql` (Teil 3), `docs/stb-vertikale/M05-M06-seed-source.md` (neu).
- Expected behavior: analog M-04, Content aus xlsx-Zeilen M-05 (Ergebnisrechnung n. Produkten/Segmenten/DB) + M-06 (Liquiditaetsplanung & Zahlungsstroeme).
- Verification: 2 weitere Templates, blocks + ki_hebel vorhanden.
- Dependencies: MT-2.

### MT-4: DB-Sidecar-Seed-Test
- Goal: Seed-Korrektheit + Idempotenz beweisen.
- Files: `src/lib/db/__tests__/migration-125-template-seed.test.ts` (neu, node:20-Sidecar).
- Expected behavior: 4 Templates ladbar; blocks-Stufe-1/2-Split assertbar; Re-Apply = 0 neue Rows.
- Verification: Sidecar-Test GREEN.
- Dependencies: MT-1..MT-3.

## Risiken & Dependencies
- **R-170-1 (Seed-Content-Tiefe, OFFEN aus ARCH §10):** Nur M-04 hat volle Spec; M-05/M-06 Fragebogen + KI-Hebel muessen aus `StrategAIze Module.xlsx` extrahiert + autoriert werden. Founder-Input ggf. noetig fuer Inhaltstiefe. Mitigation: MT-3 mit dokumentiertem Quell-Mapping; bei Lueckenfund Founder-Rueckfrage (nicht raten).
- **R-170-2 (IP-Quellen lokal/uncommitted):** `StrategAIze Module.xlsx` + M-04-Docx liegen im Dev-System strategy-docs working tree (uncommitted Founder-Parallelarbeit). Mitigation: Content-Extrakt im /backend gegen die lokalen Files; Quell-Mapping in `docs/stb-vertikale/*-seed-source.md` versionieren.
- **Dependency:** keine harte (touch nur `template`-Tabelle). Blockt SLC-172 (Blueprint-Template) + SLC-173 (Modul-Templates).

## Out of Scope
Restliche 43 Module (M-01..03, M-07..46); Modul-Editor-UI; `modul_output`-Schema (SLC-169); Capture-/Reader-Flows (SLC-172/173/175).
