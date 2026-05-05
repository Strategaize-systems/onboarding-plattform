# SLC-062 — SQL-Backfill 046_seed_demo_template Umlaute (MIG-030)

## Status
- Version: V4.4
- Status: planned
- Priority: Low
- Created: 2026-05-05
- Worktree: gemeinsam mit SLC-061 in `worktree/v44-maintenance`
- Backlog: BL-069
- Decisions: DEC-071 (Migration-Format)
- Migration: MIG-030 (Datei `sql/migrations/081_v44_umlaut_backfill_demo_template.sql`)

## Goal
328 Umlaut-Vorkommnisse in `template.blocks` und `template.sop_prompt` JSONB-Feldern fuer das Demo-Template `slug='mitarbeiter_wissenserhebung'` korrigieren. Live-DB-DML-Migration. Idempotent. Audit-Output post-Apply: 0 Vorkommnisse.

## In Scope
- Audit-Wortliste extrahieren via `scripts/audit-umlauts.mjs` gegen Live-DB-Export.
- Migration `sql/migrations/081_v44_umlaut_backfill_demo_template.sql` schreiben (Format per DEC-071: PL/pgSQL DO-Block mit curated word-list `replace()` ueber JSONB::text-Roundtrip).
- Pre-Apply-Backup der zwei JSONB-Felder.
- Apply auf Hetzner-Coolify-Supabase via base64-Pattern (per `sql-migration-hetzner.md`-Pattern, postgres-Superuser).
- Post-Apply-Audit-Verifikation: 0 Vorkommnisse.

## Out of Scope
- **DDL-Aenderung.** SC-V4.4-6 Constraint: BL-069 ist DML, nicht DDL.
- **Re-Generation aller bestehender Demo-Snapshots** (handbook_snapshot etc.) auf Basis korrigierter Templates. Demo-Snapshots bleiben in dem Zustand, in dem sie der Worker erzeugt hat. User entscheidet manuell, ob Re-Generation noetig.
- **Andere Templates** (Exit-Readiness, etc.). Nur `mitarbeiter_wissenserhebung` aus 046_seed.
- **Word-List-Persistenz im Repo** (z.B. `src/lib/german-umlaut-mapping.ts`). Wortliste lebt nur in der Migration-Datei.
- **Auto-Backfill bei zukuenftigen Seeds.** Source-Of-Truth fuer neue Templates ist der entsprechende Seed-File mit korrekt geschriebenen Umlauten ab Migration-Erstellung.

## Acceptance Criteria
1. **AC-1** Audit-Wortliste aus Live-DB extrahiert, dokumentiert, in MIG-030 hartkodiert.
2. **AC-2** MIG-030 Datei `sql/migrations/081_v44_umlaut_backfill_demo_template.sql` existiert, enthaelt PL/pgSQL DO-Block per DEC-071-Format.
3. **AC-3** Pre-Apply-Backup gemacht: `\copy template TO 'pre-mig-030.csv'` (oder `pg_dump`-Subset).
4. **AC-4** Apply auf Hetzner via base64-Pattern + `psql -U postgres` auf der DB-Container-Instanz (per `sql-migration-hetzner.md`).
5. **AC-5** Post-Apply-Audit liefert **0 Vorkommnisse**: `node scripts/audit-umlauts.mjs` mit Live-DB-Export-Mode (siehe MT-1).
6. **AC-6** Idempotenz verifiziert: 2. Apply der Migration produziert 0 zusaetzliche Aenderungen (`UPDATE ... WHERE ...` matcht bereits-korrigierte Worte nicht).
7. **AC-7** V4.3-Funktionalitaet bleibt verifiziert: Demo-Template-Capture-Session laesst sich anlegen + die Block-Titel/Question-Texte werden korrekt mit Umlauten gerendert.

## Micro-Tasks

### MT-1: Audit-Extract Wortliste aus Live-DB
- **Goal:** Liste der genau 328 betroffenen Worte aus der Live-DB extrahieren, dedupliziert, mapping-fertig.
- **Files:**
  - Output-Datei (temporaer, nicht im Repo): `/tmp/v44-audit-output.txt` lokal
  - Hilfs-Doku optional: `/reports/v44-audit-wordlist.md`
- **Expected behavior:**
  - SSH zu Hetzner: `docker exec <db-container> psql -U postgres -d postgres -c "COPY (SELECT blocks::text FROM template WHERE slug='mitarbeiter_wissenserhebung') TO STDOUT;" > /tmp/blocks.json`
  - Gleiches fuer `sop_prompt`.
  - Files lokal abholen oder direkt auf dem Server `node /opt/onboarding-plattform/scripts/audit-umlauts.mjs` mit angepasstem Source-Pfad.
  - Audit-Output: `path:line:col — '<context>' (<word>)` pro Treffer.
  - Eindeutige Worte extrahieren via `awk` oder `sort | uniq`.
  - Mapping `(suspect, korrekt)` pro Wort manuell verifizieren — z.B. `wuerden → würden`, `koennte → könnte`. **Validation: kein deutsch-englisches Mehrdeutig-Wort wie "neu"/"new" oder "true"/"treu"** (audit-Whitelist filtert das schon, aber manuelle Pruefung ist Pflicht-Gate).
  - Output: konsolidierte Mapping-Tabelle mit ~50-100 unique Worten (gegenueber 328 Vorkommnissen).
- **Verification:**
  - Output-Liste ist nicht-leer.
  - Jedes Wort der Liste enthaelt nur deutsche Wortpattern, keine englischen False-Positives.
  - Mapping ist 1:1 (kein Wort hat zwei verschiedene Korrekturen).
- **Dependencies:** keine.

### MT-2: MIG-030 Datei schreiben
- **Goal:** SQL-Migration anlegen mit Format aus DEC-071.
- **Files:**
  - `sql/migrations/081_v44_umlaut_backfill_demo_template.sql`
- **Expected behavior:**
  - Header-Kommentar: Migration 081, V4.4 BL-069, Verweis auf MIG-030, kurze Begruendung.
  - PL/pgSQL DO-Block per DEC-071-Format-Skizze:
    1. SELECT blocks::text + sop_prompt::text in temporaere Variablen.
    2. Curated word-list `replace()`-Calls (Liste aus MT-1).
    3. UPDATE template SET blocks=...::jsonb, sop_prompt=...::jsonb WHERE slug='mitarbeiter_wissenserhebung'.
    4. RAISE NOTICE bei Erfolg.
  - Optional: `IF NOT EXISTS (SELECT 1 FROM template WHERE slug='mitarbeiter_wissenserhebung') THEN RAISE NOTICE 'Template not found, skipping' RETURN; END IF;` als Idempotenz-Guard.
- **Verification:**
  - SQL-Syntax-Check via `psql --syntax-check` oder direkt im Postgres-Linter.
  - Lokales Trockenrun (gegen leere DB) zeigt keine Syntax-Errors.
- **Dependencies:** MT-1 (Wortliste).

### MT-3: Pre-Apply-Backup + Hetzner-Apply + Post-Apply-Audit
- **Goal:** Migration auf Live-DB applien + Verifikations-Loop schliessen.
- **Files:** keine (Operations-Schritt).
- **Expected behavior:**
  - **Pre-Apply-Backup:** SSH zu Hetzner: `docker exec <db-container> psql -U postgres -d postgres -c "\\copy (SELECT id, slug, blocks, sop_prompt FROM template WHERE slug='mitarbeiter_wissenserhebung') TO '/tmp/pre-mig-030.csv' WITH CSV HEADER"`. Optional: `cp /tmp/pre-mig-030.csv /opt/onboarding-plattform/backups/`.
  - **Apply via base64-Pattern (per sql-migration-hetzner.md):**
    1. Lokal: `base64 -w 0 sql/migrations/081_v44_umlaut_backfill_demo_template.sql` → String kopieren.
    2. Server: `echo 'BASE64_STRING' | base64 -d > /tmp/081_v44.sql`.
    3. Apply: `docker exec -i <db-container> psql -U postgres -d postgres < /tmp/081_v44.sql`.
    4. Verifikation: `docker exec <db-container> psql -U postgres -d postgres -c "SELECT length(blocks::text) FROM template WHERE slug='mitarbeiter_wissenserhebung';"` → liefert Wert.
  - **Post-Apply-Audit:**
    1. Live-DB-Export wie in MT-1 → `/tmp/post-blocks.json` + `/tmp/post-sop.json`.
    2. `node scripts/audit-umlauts.mjs` mit angepasstem Source → Erwartung: **0 Vorkommnisse**.
    3. Wenn > 0: Wortliste war nicht vollstaendig → Iter-Step zurueck zu MT-1, Mapping erweitern, MIG-030 anpassen, neue Migration-Datei (082) schreiben oder MIG-030 als nicht-deployed-stand in DB-Anzeige zuruecksetzen.
  - **Idempotenz-Test:** 2. Apply der Migration laufen lassen → `UPDATE`-Befehle matchen 0 Rows zusaetzlich, kein Daten-Drift.
- **Verification:**
  - AC-3 Backup-File existiert.
  - AC-4 Apply lief ohne Errors.
  - AC-5 Audit liefert 0 Vorkommnisse.
  - AC-6 Idempotenz: 2. Apply produziert keinen DML-Drift (selbe blocks/sop_prompt Hash vor + nach).
  - AC-7 V4.3-Smoke: Demo-Template laesst sich verwenden, Block-Titel rendern korrekte Umlaute im Reader/Capture-UI.
- **Dependencies:** MT-2.
- **Owner:** User fuehrt Apply aus (per `feedback_ssh_migrations_always_claude` — agent erstellt base64 + Befehl, User bestaetigt Apply).

## Risiken und Mitigationen
- **R-1 Wortliste-Luecke:** Wenn MT-1 nicht alle betroffenen Worte erfasst, bleibt Audit-Output post-Apply > 0. Mitigation: Mapping-Tabelle nochmal manuell ueber Audit-Output laufen lassen vor MT-2; bei Apply-Lueckenrunde-2 ist eine 082-Migration die Folge.
- **R-2 False-Positive-Replace:** Wenn ein deutsches Wort wie "auer" auf englisch wie "auer" passt — passiert das? Audit-Whitelist filtert englische Worte schon. Aber bei mehrdeutigen Worten wie "Pause"/"pause" oder "Steuer"/"Stürze" muss manuell entschieden werden. Mitigation: Pflicht-Gate in MT-1 ist die manuelle Verifikation der Mapping-Liste.
- **R-3 JSONB::text-Roundtrip-Drift:** Postgres' jsonb-Serialisierung kann Quote-Style oder Whitespace anders ausgeben als der Original-Insert. Mitigation: nach UPDATE per Hash-Vergleich pruefen, ob nur die erwarteten Worte sich geaendert haben (kein Whitespace-Drift). Wenn doch — Migration korrigieren.
- **R-4 Live-Sessions waehrend Apply:** Wenn ein User gerade ein Capture-Block bearbeitet, sieht er beim naechsten Reload ggf. andere Block-Titel. Mitigation: Apply in Off-Peak-Window. Fuer V4.4-Internal-Test-Mode kein echtes Risiko.
- **R-5 Backup-Restore-Pfad ungetestet:** Pre-Apply-Backup ist nur sinnvoll, wenn Restore funktioniert. Mitigation: Vor Apply 1× Restore-Probe gegen einen Test-Tenant oder gegen lokale Test-DB testen — entfaellt fuer V4.4 weil Test-DB-Setup-Overhead unverhaeltnismaessig (Risiko absorbiert ueber Stoich-Backup-Format CSV das standardisiert ist).

## Verifikations-Schritte (vor /qa)
1. MT-1 Wortliste manuell durchgegangen, keine englischen False-Positives.
2. MT-2 SQL-Datei existiert + syntaktisch valide.
3. MT-3 Backup gemacht.
4. MT-3 Apply lief ohne SQL-Errors.
5. MT-3 Post-Apply-Audit = 0 Vorkommnisse.
6. MT-3 Idempotenz-Re-Apply = kein DML-Drift.
7. V4.3-Smoke: Demo-Template Capture-Session anlegen, Block-Titel-Render mit korrekten Umlauten verifizieren.

## Recommended Next Step
Nach SLC-062 done + /qa SLC-062 PASS:
1. **Gesamt-V4.4-/qa** — beide Slices SLC-061 + SLC-062 zusammen verifizieren.
2. **/final-check V4.4** → **/go-live V4.4** → **/deploy V4.4 als REL-012**.
3. Parallel: **BL-067** Berater-Inhalts-Review wenn noch nicht durch.

## Referenzen
- BL-069 (Backlog-Item)
- DEC-071 (Migration-Format)
- MIG-030 (skizziert in MIGRATIONS.md)
- RPT-152 (/architecture V4.4)
- Rule: `sql-migration-hetzner.md` (Apply-Pattern)
- Rule: `coolify-test-setup.md` (DB-Test-Pattern, hier nicht direkt anwendbar weil reine DML-Migration)
- `scripts/audit-umlauts.mjs` (SLC-052 Werkzeug)
- `sql/migrations/046_seed_demo_template.sql` (Source des Demo-Templates)
