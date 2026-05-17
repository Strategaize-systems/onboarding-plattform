# SLC-130 — Echte Template-Versionierung UNIQUE(slug, version) (FEAT-045-V6.4-Polish)

## Goal

**Architektur-Polish-Slice fuer das Diagnose-Werkzeug-Template-System.** Heutige Constraint `UNIQUE(slug)` auf `public.template` erlaubt nur eine aktive Version pro Slug — ein Update via `ON CONFLICT (slug) DO UPDATE` ueberschreibt die existierende Row und damit auch alle umrahmenden Texte (Block-Titel, Block-Intros) in bereits abgeschlossenen Mandanten-Berichten.

Dieser Slice stellt die Constraint auf `UNIQUE(slug, version)` um, damit alte Diagnose-Berichte ihre originalen Block-Titel und Intros behalten, wenn das `partner_diagnostic`-Template spaeter aktualisiert wird (V2, V3, ...). KU.body + KU.metadata.score bleiben unveraendert (sind persistiert) — nur der umrahmende Template-Inhalt wird nun versioniert mitgehalten.

**Reines Backend + 1 SQL-Migration + 1 Code-Path-Umstellung im Frontend-Loader.** Kein neuer Funktionsumfang fuer Endnutzer — pure Architektur-Investition gegen spaetere Daten-Inkonsistenz spaetestens vor V7 Self-Signup-Funnel (BL-098).

## Feature

FEAT-045 (Diagnose-Werkzeug Light-Pipeline-Renderer) — V6.4-Polish-Erweiterung.

**Pattern-Reuse:**
- `sql/migrations/093_v63_partner_diagnostic_seed.sql` als Migration-Pattern-Vorlage (Header-Kommentar-Struktur, sql-migration-hetzner.md APPLY-PATTERN, IDEMPOTENZ-Hinweis, VERIFIKATION-Block).
- `docs/DIAGNOSE_TEMPLATE_EDITING.md` Sektion "V6.4-Polish-Slice fuer echte Versionierung" (Z. 132 ff.) als Architektur-Beschreibung.
- `.claude/rules/sql-migration-hetzner.md` fuer Apply-Procedure auf Hetzner.
- `.claude/rules/coolify-test-setup.md` fuer Vitest gegen Coolify-DB im node:20-Container.

**Cross-Project-Pattern (per `strategaize-pattern-reuse.md`):**
Kein Auth-/RLS-/SMTP-/Cron-/RAG-Pattern beruehrt — Standard-Schema-Migration mit Lookup-Refactor. Keine Pflicht-Search in anderen Repos noetig.

## Background — Heutiger Zustand

**Constraint heute:** `template_slug_key UNIQUE (slug)` aus `MIG-021` (Migration ~021).

**Migration 093 Pattern:**
```sql
INSERT INTO template (slug, version, name, ...)
VALUES ('partner_diagnostic', 'v1', ...)
ON CONFLICT (slug) DO UPDATE SET ...;
```

**Konsequenz beim Re-Seed:**
- Re-Apply von Migration 093 oder ein hypothetisches Migration `094_partner_diagnostic_v2.sql` mit gleichem Slug → die existierende Row wird UPDATE-t (gleiches `template.id`, neue blocks/metadata).
- Alle existierenden `capture_session.template_id`-FKs zeigen weiter auf dieselbe Row, sehen aber jetzt die NEUEN blocks/Intros.
- Bericht-Renderer (`src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx` Z. 85-88) laedt Template via `session.template_id` — sieht die ueberschriebenen Texte.
- KU.body + KU.metadata.score in `knowledge_unit` bleiben unveraendert (sind persistiert).

**Fuer Internal-Test-Mode akzeptabel.** Vor erstem echten Live-Pilot-Partner (BL-104 pending) noch akzeptabel weil 0 echte Mandanten-Berichte. **Spaetestens vor V7 Self-Signup-Funnel (BL-098)** muss echte Versionierung stehen — Vertrauens-Asset fuer Steuerberater.

## In Scope

### Schema-Aenderung (Migration 096)

1. `ALTER TABLE public.template DROP CONSTRAINT IF EXISTS template_slug_key;`
2. `CREATE UNIQUE INDEX IF NOT EXISTS template_slug_version_unique ON public.template(slug, version);`
3. Idempotent: bei zweitem Apply No-Op (DROP IF EXISTS + CREATE IF NOT EXISTS).
4. Live-Apply auf Hetzner per `sql-migration-hetzner.md` Pattern (base64 → docker exec psql -U postgres).

### Code-Path-Umstellung (Template-Lookup auf "newest version pro slug")

**File 1: `src/app/dashboard/diagnose/start/page.tsx` Z. 79-85.**

Heute:
```typescript
const { data: template } = await admin
  .from("template")
  .select("id")
  .eq("slug", "partner_diagnostic")
  .eq("version", "v1")
  .single();
```

Umstellung auf:
```typescript
const { data: template } = await admin
  .from("template")
  .select("id")
  .eq("slug", "partner_diagnostic")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

**File 2: `src/app/dashboard/diagnose/actions.ts` Z. 27-28 + Z. 117-126.**

Heute:
```typescript
const PARTNER_DIAGNOSTIC_SLUG = "partner_diagnostic";
const PARTNER_DIAGNOSTIC_VERSION = "v1";
// ...
const { data: template, error: templateError } = await admin
  .from("template")
  .select("id, version")
  .eq("slug", PARTNER_DIAGNOSTIC_SLUG)
  .eq("version", PARTNER_DIAGNOSTIC_VERSION)
  .single();
```

Umstellung auf:
```typescript
const PARTNER_DIAGNOSTIC_SLUG = "partner_diagnostic";
// PARTNER_DIAGNOSTIC_VERSION entfaellt — Lookup auf newest version pro slug
// ...
const { data: template, error: templateError } = await admin
  .from("template")
  .select("id, version")
  .eq("slug", PARTNER_DIAGNOSTIC_SLUG)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (templateError || !template) {
  throw new Error(
    `Template ${PARTNER_DIAGNOSTIC_SLUG} nicht gefunden (keine Version live)`,
  );
}
```

**File 3 — KEIN Code-Touch:** `src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx`. Bestaetigt: Z. 85-88 laedt Template via `session.template_id` direkt. Jede Session referenziert ihre eigene Template-Row → alte Sessions sehen alte Version, neue Sessions sehen neueste Version. Genau das Ziel.

### Doku-Update

`docs/DIAGNOSE_TEMPLATE_EDITING.md` Sektion "V6.4-Polish-Slice fuer echte Versionierung" (Z. 132 ff.) und Sektion "Standard-Workflow: Template-Update via Migration" so umschreiben dass:
- V6.4-Polish-Slice als **LIVE** markiert wird (nicht mehr "Empfehlung")
- Migration-Pattern fuer neue Template-Versionen: `ON CONFLICT (slug, version) DO UPDATE` statt `ON CONFLICT (slug) DO UPDATE`
- Hinweis dass `INSERT ... ON CONFLICT (slug)` jetzt fehlschlaegt (Constraint existiert nicht mehr)
- Bestehende Sektion "Wann das problematisch wird" → "Jetzt geloest mit echter Versionierung"

### Vitest-Coverage

Neues Test-File `__tests__/template-versioning.test.ts` oder Erweiterung von existierenden DB-Tests:

1. **Test 1 — Cross-Version-Read funktioniert:** Insert 2 Template-Rows fuer denselben Slug mit `version='v1'` und `version='v2'`. Lookup ueber `slug + ORDER BY created_at DESC LIMIT 1` gibt v2 zurueck. Lookup via Session-`template_id` auf v1-Row gibt v1 zurueck.
2. **Test 2 — Constraint enforced:** Insert 2x denselben (slug, version) schlaegt fehl mit `unique_violation` (Code 23505).
3. **Test 3 — Slug-Only-Constraint weg:** Insert (slug='partner_diagnostic', version='v1') + (slug='partner_diagnostic', version='v2') klappt nun.

Tests laufen gegen Coolify-DB per `coolify-test-setup.md` Pattern (node:20-Container, TEST_DATABASE_URL).

### Quality-Gates am Slice-Ende

- `ESLint 0/0`
- `tsc EXIT=0`
- `npm run build` PASS lokal mit Dummy-ENVs (Routes weiter als Dynamic)
- `npm run test` gegen Coolify-DB: 3 neue Tests gruen + 0 Regression auf Baseline
- Vitest-Baseline-Check: existierende `light-pipeline-score.test.ts` (18) + `light-pipeline-run.test.ts` (9) + `handle-job-branch.test.ts` (3) bleiben gruen

## Out of Scope

- **Migration 094 (`rpc_finalize_partner_diagnostic`) anpassen** — RPC nutzt `template.id` via Session-Lookup, kein Slug-Lookup. Funktioniert ohne Touch.
- **Light-Pipeline-Worker** (`src/workers/condensation/light-pipeline.ts`) — laedt Template via `session.template_id`, kein Slug-Lookup. Funktioniert ohne Touch.
- **Migration 093 retroaktiv aendern** — bleibt wie ist (idempotent angelegt, Live-Apply hat seine ON CONFLICT(slug) bereits genutzt). Neue Migrationen ab 096+ nutzen neuen Pattern.
- **v2-Template-Seed** — keine inhaltliche Aenderung des `partner_diagnostic`-Templates. Nur Architektur-Polish, keine Daten-Aenderung.
- **Multi-Version-Lookup-UI** (z.B. "Welche Version moechtest du fuer den Bericht?") — V8+. V7 nutzt weiter implizit "neueste Version fuer Self-Signup" Pattern.
- **NL-Variante des Templates** — V7+ wenn NL-Pilot-Aktivierung kommt (Investor-Substanz Q4 2026).
- **Cross-Tenant Template-Customization** — V8+. Heute ist `partner_diagnostic` strategaize-zentral verwaltet.

## Acceptance Criteria

| AC | Beschreibung |
|---|---|
| AC-1 | Migration 096 existiert mit Header-Kommentar (ZIEL, IDEMPOTENZ, APPLY-PATTERN, VERIFIKATION) analog Migration 093. |
| AC-2 | Migration 096 ist idempotent: zweiter Apply ist No-Op (DROP IF EXISTS + CREATE IF NOT EXISTS). |
| AC-3 | Migration 096 LIVE auf Hetzner Coolify-Postgres-Container appliziert via `sql-migration-hetzner.md` Pattern + Pre-Apply-Backup im `/opt/onboarding-plattform-backups/` abgelegt. |
| AC-4 | Verifikation post-Apply: `\d template` zeigt KEINEN `template_slug_key`-Constraint mehr aber `template_slug_version_unique`-Index. |
| AC-5 | `src/app/dashboard/diagnose/start/page.tsx` Z. 79-85 nutzt `.order("created_at", { ascending: false }).limit(1).maybeSingle()` statt `.eq("version", "v1").single()`. |
| AC-6 | `src/app/dashboard/diagnose/actions.ts` Z. 117-126 analog umgestellt. `PARTNER_DIAGNOSTIC_VERSION`-Konstante entfernt oder als Comment markiert "deprecated, see SLC-130". |
| AC-7 | `src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx` UNVERAENDERT (jede Session laedt eigene Template-Row via `session.template_id`). |
| AC-8 | `docs/DIAGNOSE_TEMPLATE_EDITING.md` updated: "V6.4-Polish-Slice"-Sektion als LIVE markiert, Migration-Pattern auf `ON CONFLICT(slug, version) DO UPDATE` umgestellt, "Wann problematisch wird"-Sektion umformuliert. |
| AC-9 | `__tests__/template-versioning.test.ts` enthaelt mindestens 3 Tests (Cross-Version-Read, UNIQUE(slug,version) enforced, alter UNIQUE(slug) weg) — alle 3 PASS gegen Coolify-DB im node:20-Container. |
| AC-10 | Quality-Gates am Slice-Ende: ESLint 0/0, tsc EXIT=0, Build PASS lokal mit Dummy-ENVs, Vitest 0 Regression auf Baseline. |
| AC-11 | Live-Smoke nach Coolify-Redeploy (User-Pflicht): existierende `qa-mandant@strategaizetransition.com`-Test-Session kann ihren V6.3-Bericht weiter oeffnen (lookup via session.template_id auf v1-Row). |
| AC-12 | Live-Smoke neue Session: neuer Test-Mandant kann Diagnose starten + abschliessen + Bericht oeffnen (lookup via newest-version-pro-slug greift v1). |

## Pre-Conditions

- V6.3 LIVE deployed (erfuellt — REL-018 Coolify-Tag `c3e9539`)
- 0 V6.3-Errors in error_log seit Hotfix Migration 095 (erfuellt per RPT-287)
- Coolify-Postgres-Container erreichbar via `docker ps --format '{{.Names}}' | grep ^supabase-db`
- Pre-Apply-Backup-Dir existiert: `/opt/onboarding-plattform-backups/`
- TEST_DATABASE_URL fuer Vitest auf Coolify-DB konfigurierbar

## Stop-Gates

- **Keine V7-Self-Signup-Aktivierung** vor SLC-130-LIVE (sonst neuer Mandant-Funnel mit Template-Drift-Risiko)
- **Keine Schema-Aenderung an `template`-Tabelle** parallel ohne Cross-Check (Migration 096 ist exclusive-Lock-Effekt fuer Sekunden)

## Micro-Tasks

### MT-1: Migration 096 anlegen + Live-Apply auf Hetzner

- **Goal:** SQL-Migration-File anlegen mit DROP CONSTRAINT + CREATE UNIQUE INDEX, Header-Kommentar analog Migration 093, Live-Apply auf Coolify-Postgres mit Pre-Apply-Backup.
- **Files:**
  - `sql/migrations/096_v64_template_slug_version_unique.sql` (NEU)
- **Expected behavior:**
  - Header-Kommentar mit ZIEL / IDEMPOTENZ / APPLY-PATTERN / PRE-APPLY-BACKUP-PFLICHT / VERIFIKATION (Block-Struktur identisch zu Migration 093).
  - Body: `ALTER TABLE public.template DROP CONSTRAINT IF EXISTS template_slug_key;` + `CREATE UNIQUE INDEX IF NOT EXISTS template_slug_version_unique ON public.template(slug, version);`
  - Idempotent: zweiter Apply NOTICE-Output ohne Fehler.
  - Live-Apply auf Hetzner: Container-Name resolven, Pre-Apply-Backup ablegen, `docker exec -i <db-container> psql -U postgres -d postgres < /tmp/096_v64.sql`.
  - Post-Apply-Verifikation: `\d public.template` zeigt neuen Index + alten Constraint weg.
- **Verification:**
  - `ls -la sql/migrations/096_v64_template_slug_version_unique.sql` → File existiert.
  - `docker exec <db-container> psql -U postgres -d postgres -c "SELECT indexname FROM pg_indexes WHERE tablename='template'"` listet `template_slug_version_unique`.
  - `docker exec <db-container> psql -U postgres -d postgres -c "SELECT conname FROM pg_constraint WHERE conrelid='public.template'::regclass"` listet KEINEN `template_slug_key` mehr.
  - Test-Insert `INSERT INTO template (slug, version, name, blocks) VALUES ('test_smoke', 'v1', 'smoke', '[]')` + `INSERT ... VALUES ('test_smoke', 'v2', 'smoke', '[]')` → beide klappen.
  - Test-Insert `INSERT ... VALUES ('test_smoke', 'v2', 'smoke', '[]')` ein zweites Mal → fail mit `unique_violation`.
  - Cleanup-DELETE `DELETE FROM template WHERE slug='test_smoke'` → 2 Rows weg.
- **Dependencies:** keine.

### MT-2: Template-Lookup-Code-Path-Umstellung

- **Goal:** Server-Action `actions.ts` + Page `start/page.tsx` auf "newest version pro slug" umstellen. Bericht-Page bleibt unveraendert (laedt ueber `session.template_id`).
- **Files:**
  - `src/app/dashboard/diagnose/actions.ts` (modify Z. 27-28 + Z. 117-126)
  - `src/app/dashboard/diagnose/start/page.tsx` (modify Z. 79-85)
  - `src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx` (NICHT modifizieren — explicit verification step)
- **Expected behavior:**
  - `actions.ts` Z. 27-28: `PARTNER_DIAGNOSTIC_VERSION` als deprecated Comment markiert (oder geloescht falls nirgends sonst referenziert).
  - `actions.ts` Z. 117-126: Lookup `WHERE slug=... ORDER BY created_at DESC LIMIT 1`. Error-Message angepasst auf "Template ... nicht gefunden (keine Version live)".
  - `start/page.tsx` Z. 79-85: analog `.order("created_at", { ascending: false }).limit(1).maybeSingle()` statt `.eq("version", "v1").single()`.
  - `bericht/page.tsx` Z. 85-88 bleibt 1:1 (`session.template_id`-Lookup) — Verification dass keine ungewollte Aenderung.
- **Verification:**
  - `grep PARTNER_DIAGNOSTIC_VERSION src/app/dashboard/diagnose/actions.ts` → 0 Treffer oder nur als deprecated Comment.
  - `grep "version.*v1" src/app/dashboard/diagnose/start/page.tsx src/app/dashboard/diagnose/actions.ts` → 0 Treffer (Lookup-Logik).
  - `grep "session.template_id" src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx` → 1 Treffer (unveraendert).
  - tsc EXIT=0 / ESLint 0/0 auf 3 Files.
- **Dependencies:** MT-1 (Constraint live, sonst test-relevant).

### MT-3: Vitest Cross-Version-Read

- **Goal:** Test-File mit 3 Tests anlegen, alle gegen Coolify-DB im node:20-Container per `coolify-test-setup.md` Pattern.
- **Files:**
  - `src/app/dashboard/diagnose/__tests__/template-versioning.test.ts` (NEU)
- **Expected behavior:**
  - Test 1 "Cross-Version-Read funktioniert": Insert 2 Templates `('test_versioning', 'v1', ...)` + `('test_versioning', 'v2', ...)` mit `created_at` 5ms auseinander. Lookup `ORDER BY created_at DESC LIMIT 1` gibt v2-Row. Direkt-Lookup auf v1-`id` gibt v1-Row. Cleanup-DELETE.
  - Test 2 "UNIQUE(slug, version) enforced": Insert `('test_versioning_dup', 'v1', ...)` + zweiter Insert mit gleichem (slug, version) wirft `unique_violation`. Cleanup.
  - Test 3 "Alter UNIQUE(slug) weg": Insert `('test_versioning_legacy', 'v1', ...)` + `('test_versioning_legacy', 'v2', ...)` → beide klappen (waere mit altem Constraint nicht moeglich). Cleanup.
  - SAVEPOINT-Pattern fuer Test 2 (erwarteter Fehler bricht Tx ab, ROLLBACK TO SAVEPOINT noetig).
  - Test-Isolation: jeder Test mit eigenem `slug`-Prefix damit parallele Runs nicht kollidieren.
- **Verification:**
  - `docker run --rm --network <coolify-net> -v /opt/onboarding-plattform-test:/app -w /app -e TEST_DATABASE_URL='postgresql://postgres:<pw>@<db-container>:5432/postgres' node:20 npx vitest run src/app/dashboard/diagnose/__tests__/template-versioning.test.ts` → 3/3 PASS.
  - Existierende SLC-105-Vitest 30/30 unveraendert PASS (keine Regression).
- **Dependencies:** MT-1 (Constraint live), MT-2 (Code-Paths umgestellt).

### MT-4: docs/DIAGNOSE_TEMPLATE_EDITING.md Pattern-Update

- **Goal:** Doku auf neuen Constraint-Stand bringen. V6.4-Polish-Slice-Sektion als LIVE markieren, Migration-Pattern umstellen auf `ON CONFLICT(slug, version)`.
- **Files:**
  - `docs/DIAGNOSE_TEMPLATE_EDITING.md` (modify)
- **Expected behavior:**
  - Sektion "V6.4-Polish-Slice fuer echte Versionierung" (Z. 132 ff.) umbenannt auf "Versionierung — V6.4 LIVE" mit Hinweis dass `template_slug_version_unique`-Index seit SLC-130 LIVE.
  - Sektion "Standard-Workflow: Template-Update via Migration" → Migration-Pattern auf `INSERT ... ON CONFLICT (slug, version) DO UPDATE` umgestellt, mit Beispiel "wenn neue Version: neue `version`-String waehlen (z.B. 'v2'), INSERT erstellt neue Row, alte v1-Sessions weiter referenzieren v1".
  - Sektion "Wann das problematisch wird" → umformuliert auf "Vor SLC-130: war problematisch — seit SLC-130 V6.4 LIVE geloest".
  - Header-Block "Stand: 2026-05-XX (V6.4-Release)" updated.
  - Hinweis auf SLC-130-Slice-Doku als Quelle.
- **Verification:**
  - `grep "V6.4-Polish-Slice" docs/DIAGNOSE_TEMPLATE_EDITING.md` → 0 Treffer (umbenannt).
  - `grep "ON CONFLICT (slug, version)" docs/DIAGNOSE_TEMPLATE_EDITING.md` → mindestens 1 Treffer.
  - `grep "ON CONFLICT (slug) DO UPDATE" docs/DIAGNOSE_TEMPLATE_EDITING.md` → 0 Treffer (oder nur als deprecated-historischer Hinweis).
  - Markdown-Preview rendert sauber.
- **Dependencies:** MT-1, MT-2 (Code-Path konsistent zur Doku-Aussage).

### MT-5: Quality-Gates + Vitest-Full-Run + Build + Cockpit-Records

- **Goal:** Slice-End-Gates ausfuehren, Records updaten (slices/INDEX.md, planning/backlog.json, planning/roadmap.json, docs/STATE.md).
- **Files:**
  - `slices/INDEX.md` (modify — SLC-130 status → in_progress → done am Slice-Ende)
  - `planning/backlog.json` (modify — BL-105 status: open → in_progress → done)
  - `planning/roadmap.json` (modify — V6.4 status: planned → active → released am REL-019)
  - `docs/STATE.md` (modify — Current Focus auf SLC-130 done)
  - `docs/MIGRATIONS.md` (modify — MIG-040 Eintrag)
  - `docs/DECISIONS.md` (optional — DEC-129 falls Architektur-Entscheidung loggable)
- **Expected behavior:**
  - ESLint 0/0 auf 3 modifizierte TS-Files + 1 neuer Test-File.
  - tsc EXIT=0 volltree.
  - `npm run build` PASS lokal mit Dummy-ENVs (NEXT_PUBLIC_SUPABASE_URL etc.).
  - `npm run test` gegen Coolify-DB: alle pre-existing PASS + 3 neue Tests PASS, 0 Regression.
  - slices/INDEX.md: SLC-130-Eintrag in V6.4-Sektion mit Status `done`.
  - backlog.json: BL-105 status `done`, version bleibt `V6.4`.
  - roadmap.json: V6.4 status bleibt `active` bis /deploy V6.4 (dann `released`).
  - STATE.md: Current Focus + Immediate Next Steps + Last Stable Version aktualisiert.
- **Verification:**
  - alle Quality-Gates PASS in einer Output-Zusammenfassung.
  - Cockpit-Refresh zeigt SLC-130 done + V6.4 active + BL-105 done.
- **Dependencies:** MT-1, MT-2, MT-3, MT-4.

## Execution Order

Strikt sequentiell: MT-1 → MT-2 → MT-3 → MT-4 → MT-5.

- MT-1 muss vor MT-2 weil sonst Code-Path-Aenderung gegen nicht-existenten Constraint laeuft (Test wuerde fehlschlagen).
- MT-2 muss vor MT-3 weil Test gegen neue Lookup-Logik laeuft.
- MT-3 muss vor MT-4 weil Doku auf "LIVE" markiert nur Sinn macht wenn Test gruen.
- MT-5 als finaler Records-Update + Gesamt-Quality-Gates.

## Estimated Effort

| MT | Aufwand |
|---|---|
| MT-1 | ~45min (Migration-File schreiben + Live-Apply + Backup + Verifikation) |
| MT-2 | ~30min (3 Files editieren + tsc/eslint local) |
| MT-3 | ~60min (Test-File schreiben + Coolify-Container-Run + SAVEPOINT-Pattern + Cleanup) |
| MT-4 | ~30min (Doku-Refactor + Markdown-Verify) |
| MT-5 | ~30min (Records updaten + Gesamt-Gates) |
| **Total** | **~3h** |

Plus ~30min Live-Smoke nach Coolify-Redeploy fuer AC-11+AC-12.

## Risks

- **R-1 (Low):** Migration-Apply schlaegt fehl wegen FK-Verweis aus `capture_session.template_id` — sollte nicht passieren weil FK auf `template.id` (UUID), nicht auf `(slug, version)`. Verifizierbar pre-Apply via `SELECT conname FROM pg_constraint WHERE conrelid='public.capture_session'::regclass AND contype='f'`.
- **R-2 (Low):** Bestehende `partner_diagnostic v1`-Row hat eindeutige `(slug, version)`-Kombination → CREATE UNIQUE INDEX klappt ohne Daten-Kollision. Pre-Apply-Check `SELECT slug, version, COUNT(*) FROM template GROUP BY slug, version HAVING COUNT(*) > 1` muss leer sein.
- **R-3 (Low):** Vitest gegen Coolify-DB braucht TEST_DATABASE_URL-Setup, das per `coolify-test-setup.md` etabliert ist. Pre-Apply-Check: `docker exec <db-container> psql -U postgres -c "SELECT 1"` klappt.
- **R-4 (Very Low):** Cockpit-Parser-Bug bei slices/INDEX.md Status-Column-Position (siehe project-records-format.md "Format rules for slices/INDEX.md"). Mitigation: SLC-130-Eintrag Status in Column 4 platzieren wie bei SLC-122.

## Worktree-Isolation

**Delivery Mode SaaS → Worktree-Isolation Mandatory.**

- Branch-Name: `slc-130-template-versionierung` (analog SLC-122)
- Push nach /qa MT-5 PASS, dann Merge nach `main` am Slice-Ende (per `feedback_slice_merge_at_end.md`).
- Status-Tracking: `slices/INDEX.md` Status `in_progress` waehrend Worktree aktiv, Update auf `done` post-Merge.

## Cross-Slice-Konsistenz

- Migration 096 fuegt sich in MIG-040 (sequenziell nach MIG-039 = Migration 095) ein. `docs/MIGRATIONS.md` bekommt MIG-040-Eintrag in MT-5.
- Kein Konflikt mit V7 BL-098 Self-Signup-Backend — SLC-130 ist Pre-Condition fuer V7 sauber.
- Reuse-Quote: 100% bestehende Worker-/RPC-/Render-Architektur (0 Touch).

## References

- Memory `project_op_v63_released.md` — V6.4 BL-105 Plan
- Memory `session_handoff_2026_05_17_v63_released.md` — MT-Skizze
- `planning/backlog.json` BL-105 — vollstaendige Slice-Description
- `docs/DIAGNOSE_TEMPLATE_EDITING.md` — Architektur-Beschreibung (Sektion "V6.4-Polish-Slice")
- `sql/migrations/093_v63_partner_diagnostic_seed.sql` — Migration-Pattern-Vorlage
- `.claude/rules/sql-migration-hetzner.md` — Apply-Procedure
- `.claude/rules/coolify-test-setup.md` — Vitest-Pattern gegen Coolify-DB
