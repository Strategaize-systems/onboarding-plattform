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

## Ziel (RE-SCOPED 2026-06-21, DEC-242 / B1-Abgleich)
**NUR M-04** als idempotente Seed-Migration anlegen: 1 `template`-Row (`stb_modul_m04`) mit `blocks` (Fragebogen Stufe-1-Kern + Stufe-2-Vertiefung ueber `ebene`/`required`) + KI-Hebel-Katalog (Reifegrad 1-4). Content aus Dev-System-IP (`M-04 …docx`, 26 Fragen / 13 KI-Hebel). Reuse der bestehenden `template`-Tabelle (kein neues Schema). Damit ist der **komplette V10-E2E-Flow** (Capture SLC-173 → Worker SLC-174 → Reader SLC-175) mit dem Prio-A-1-Modul lauffaehig/testbar.

**Verschoben nach SLC-170b** (content-gated, Founder-Autoring noetig): Blueprint (`stb_blueprint_kanzlei`) + M-06 + restlicher 18-Cut. **M-05 gestrichen** (nicht im StB-KERN-Cut, DEC-242). Quelle: `docs/stb-vertikale/modul-bibliothek-seed-source.md`.

**Grund des Re-Scope:** Nur M-04 ist auf voller Tiefe ausgearbeitet; M-05/M-06/Blueprint sind duenn/leer/fehlend. Fragebogen + KI-Hebel zu erfinden ist Founder-Produkt-IP, kein Build (`nicht raten`). Original-Ziel war "4 Templates Blueprint+M-04/05/06" — der "M-04/05/06"-Cluster war ein generischer Platzhalter, nicht der StB-Schnitt.

## Architektur-Anker
- DEC-234: Blueprint = neue `template`-Row mit `diagnosis_schema`/`diagnosis_prompt`; Mechanismus reusen, Inhalt neu (NICHT Exit-Readiness-Content, DATEV-Abgrenzung SC-6).
- DEC-233: Module als `template`-Rows; das strukturierte Deliverable landet spaeter in `modul_output` (SLC-169).
- IP-Quellen (Dev-System strategy-docs): `StrategAIze Module.xlsx` (46 Module/11 Kategorien, M-04/05/06 = Kern Finanzen&Controlling), `M-04 – Grundlegende Finanzsteuerung (GuV-Bilanz-Cash).docx` (volle Modul-Spec), `StrategAIze Workspace.docx` (Liefervorlage).
- Template-Versionierung: `UNIQUE(slug, version)` (MIG-096) — idempotent via `ON CONFLICT (slug, version) DO UPDATE`.

## Akzeptanzkriterien (RE-SCOPED — M-04-only)
- **AC-170-1:** 1 `template`-Row geseedet: `stb_modul_m04` v1.0 (`blocks` mit Stufe-1-Kern [`required=true`] + Stufe-2-Vertiefung [`ebene=2`/`required=false`] + `metadata.ki_hebel[]` Reifegrad-1-4-Katalog). (Blueprint + M-05/M-06 NICHT in diesem Slice — siehe Ziel/DEC-242.)
- **AC-170-2:** Seed idempotent — `ON CONFLICT (slug, version) DO UPDATE`; 2. Apply = 0 zusaetzliche Rows, Content-Update statt Insert.
- **AC-170-3:** M-04 vollstaendig nach Spec (26 Fragen Stufe-1/2 + 13 KI-Hebel Reifegrad 1-4 + Output-Contract-Hinweis Entscheidung/Standard/Implementierungsschritt) aus `M-04 …docx`. Quell-Mapping in `docs/stb-vertikale/M-04-seed-source.md`.
- **AC-170-4:** Template via RLS fuer den Tenant lesbar (Reuse bestehender `template`-RLS).
- **AC-170-5:** DB-Sidecar-Test: M-04-Template ladbar, `blocks` parst (Stufe-1/Stufe-2-Split korrekt), Re-Apply idempotent; `tsc`/`eslint` 0.

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
- Expected behavior: `blocks` Stufe-1-Kern (Pflicht: GuV/Bilanz/Cash-Grundgroessen, KPI-Set) + Stufe-2-Vertiefung; `metadata.ki_hebel[]` (Reifegrad 1-4, z.B. Monatsabschluss-Kadenz, Standard-Monatsreport-Automatisierung); Output-Contract-Marker. Content 1:1 aus `M-04 …docx` (26 Fragen / 13 Hebel) — NICHT umschreiben/kuerzen ausser DB-Strukturierung.
- Verification: blocks-Split Stufe-1/2 korrekt, ki_hebel mit reifegrad 1-4.
- Dependencies: keine (erster + einziger Seed-MT in diesem Slice; MIG-125 enthaelt nur M-04).

### MT-3: ~~M-05 + M-06~~ — ENTFERNT (DEC-242)
M-05 gestrichen (nicht im StB-KERN-Cut). M-06 + Blueprint + Rest → SLC-170b (content-gated). Kein Inhalt erfinden.

### MT-1 (war MT-1 Blueprint): ENTFERNT aus SLC-170 → SLC-170b
Blueprint-Template (`stb_blueprint_kanzlei` inkl. `diagnosis_schema`/`diagnosis_prompt`/`usage_kind`) braucht Founder-Autoring (Diagnose-Fragen + Ampel + Modul-Routing) → SLC-170b, Welle 2 (zuerst, weil es SLC-172 entsperrt). `usage_kind`-Abstimmung mit SLC-172 (Reuse `self_service_partner_diagnostic` vs. neuer Branch) bleibt dort relevant.

### MT-4 → jetzt MT-3: DB-Sidecar-Seed-Test (M-04)
- Goal: Seed-Korrektheit + Idempotenz fuer M-04 beweisen.
- Files: `src/lib/db/__tests__/migration-125-template-seed.test.ts` (neu, node:20-Sidecar).
- Expected behavior: M-04-Template ladbar; blocks-Stufe-1/2-Split assertbar; Re-Apply = 0 neue Rows.
- Verification: Sidecar-Test GREEN.
- Dependencies: MT-2.

## Risiken & Dependencies
- **R-170-1 (RESOLVED via Re-Scope/DEC-242):** Seed-Content-Tiefe — nur M-04 ist voll. Geloest, indem SLC-170 auf M-04-only re-scoped wurde; M-05 gestrichen, Blueprint/M-06/Rest content-gated nach SLC-170b (Founder-Autoring). Kein erfundenes IP.
- **R-170-2 (IP-Quellen lokal/uncommitted):** `M-04 …docx` liegt im Dev-System strategy-docs working tree (uncommitted Founder-Parallelarbeit). Mitigation: Content-Extrakt im /backend gegen die lokale Datei; Quell-Mapping in `docs/stb-vertikale/M-04-seed-source.md` versionieren. Strukturierte Bibliothek-Quelle: `docs/stb-vertikale/modul-bibliothek-seed-source.md`.
- **Dependency:** keine harte (touch nur `template`-Tabelle). Blockt SLC-173 (Modul-Capture, M-04). SLC-172 (Blueprint) wartet auf SLC-170b (Blueprint-Template).

## Out of Scope
M-05 (gestrichen, DEC-242); Blueprint + M-06 + restlicher 18-Cut (→ SLC-170b, content-gated); restliche 28 Nicht-Cut-Module; Modul-Editor-UI; `modul_output`-Schema (SLC-169); Capture-/Reader-Flows (SLC-172/173/175).
