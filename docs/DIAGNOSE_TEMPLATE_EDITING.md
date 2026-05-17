# Diagnose-Werkzeug — Template-Editing-Workflow

**Zweck:** Wiederverwendbares Pattern, wenn die 24 Fragen, Score-Mappings oder Stil-Anker im Diagnose-Werkzeug-Template `partner_diagnostic` aktualisiert werden sollen.

**Geltungs-Bereich:** Nur das `partner_diagnostic`-Template. Die Standard-Templates (`exit_readiness`, `mitarbeiter_wissenserhebung`) folgen anderen Pattern (3-Agenten-Loop statt Light-Pipeline) und sind NICHT durch diesen Guide gedeckt.

**Stand:** 2026-05-17 (V6.4-Release — SLC-130 LIVE).

**Aktualisierungs-Historie:**
- 2026-05-17 V6.3 — Initial-Version, `UNIQUE(slug)` als Constraint.
- 2026-05-17 V6.4 — Echte Versionierung LIVE via Migration 096 (SLC-130). `UNIQUE(slug, version)`, Lookup auf "newest version pro slug" in start/page.tsx + actions.ts.

---

## Wann ein Template-Update sinnvoll ist

- Externer Pruefer (Steuerberater, Anwalt, Fach-Reviewer) hat Anmerkungen zu Frage-Formulierung oder Score-Werten.
- Pilot-Erfahrung zeigt, dass eine Frage von Mandanten nicht verstanden wird oder die Antwort-Optionen nicht zur Realitaet passen.
- Stil-Anker-Texte fuer KI-Kommentare sollen verfeinert werden (z.B. zu nett, zu hart, falscher Tonfall).
- Pflicht-Output-Aussage soll geaendert werden.
- Ein zusaetzlicher Baustein soll hinzugefuegt werden (z.B. von 6 auf 7 Bloecke).

**NICHT durch diesen Guide gedeckt:**
- Per-Partner-Anpassung (Kanzlei A hat andere Fragen als Kanzlei B) — heute nicht moeglich, V7+ Architektur-Erweiterung.
- Per-Mandant-Anpassung — heute nicht moeglich, fachlich auch nicht sinnvoll.
- Frage-Typ-Wechsel (multiple_choice → numeric_bucket) ohne Score-Mapping-Update — wuerde Score-Compute kaputt machen.

---

## Architektur-Stand 2026-05-17 V6.4 (echte Versionierung LIVE)

**Aktuelle Constraint (seit Migration 096 / SLC-130):** Die DB-Tabelle `template` hat `UNIQUE(slug, version)`, NICHT mehr `UNIQUE(slug)`. Das bedeutet:
- Es koennen **mehrere Versions pro Slug** koexistieren (z.B. `partner_diagnostic v1` + `partner_diagnostic v2`).
- `ON CONFLICT (slug, version) DO UPDATE` ueberschreibt nur eine bestimmte Version (Update-Pfad fuer Tippfehler-Korrekturen einer bestehenden Version).
- Neue `capture_session`-Rows (= neue Diagnose-Runs) referenzieren ueber `template_id` immer die juengste Version (Lookup `ORDER BY created_at DESC LIMIT 1` in `start/page.tsx` + `actions.ts`).
- Alte `capture_session`-Rows zeigen ueber ihren persistierten `template_id` auf die Original-Template-Row — auch wenn spaeter eine neue Version dazukommt.

**Auswirkung auf alte Berichte nach einem Update:**
- `knowledge_unit.body` (= der KI-Kommentar pro Block) bleibt unveraendert — der wurde beim Diagnose-Run gespeichert.
- `knowledge_unit.metadata.score` bleibt unveraendert — wurde beim Run berechnet.
- `capture_session.answers` (= die Mandanten-Antworten) bleibt unveraendert.
- **NEU seit V6.4:** `bericht/page.tsx` rendert Block-Titel + Block-Intro **aus dem Template, auf das die Session per `template_id` zeigt** — das ist immer die Original-Version zum Zeitpunkt des Runs. Alte Berichte zeigen damit ihre originalen Texte, nicht die einer spaeteren V2.

**Praktisch heisst das:**
- **Frage-Texte / Antwort-Optionen aendern:** Anlage einer neuen Version V2 — neue Sessions bekommen V2, alte Sessions bleiben auf V1 mit Original-Frage-Texten.
- **Block-Titel / Block-Intro aendern:** alte Berichte zeigen ihre originalen Titel/Intros (V1), neue Berichte zeigen die neuen (V2). Kein Mandanten-Verwirrungs-Risiko mehr.
- **Score-Mappings aendern:** neue Antworten der V2 ergeben den V2-Score-Wert. Alte Berichte bleiben mit ihrem V1-Score und V1-Mapping-Logik — vollstaendig reproduzierbar.

**Wann das jetzt sauber funktioniert (V6.4-Live-Capability):**
- Nach 6 Monaten echte Pilot-Daten existieren: Mandanten-Bericht kann mit "Originalstand zur Zeit X" geoeffnet werden — `session.template_id` zeigt auf die zum Zeitpunkt aktive Version.
- Steuerberater oeffnet alten Mandanten-Bericht zur Beratung — er sieht die originale Frage-Logik, mit der der Mandant damals geantwortet hat.
- Multi-Version-Audit-Trail moeglich (`SELECT version, created_at FROM template WHERE slug='partner_diagnostic' ORDER BY created_at`).

---

## Standard-Workflow: Template-Update via Migration

### Vor-Bedingungen
- [ ] Aenderungs-Wunsch in `docs/DIAGNOSE_WERKZEUG_INHALT.md` dokumentiert und cross-checked
- [ ] Pflichtaussage geprueft (Pflicht-Output-Aussage Zeichenlaenge konsistent halten, ~200-220 Zeichen)
- [ ] Score-Mappings konsistent: jede Antwort hat einen Wert aus {0, 25, 50, 75, 100}
- [ ] `comment_anchors`-Triplet (low/mid/high) komplett pro Block
- [ ] Pre-Apply-Backup als Pflicht-Anlage

### Schritte

#### 1. Neue Migration anlegen
Pfad: `sql/migrations/NNN_partner_diagnostic_vX.sql` (NNN = naechste freie Nummer, X = neue Inhalts-Version, z.B. `v2`)

Pattern aus Migration 093 uebernehmen (Kopf-Kommentar) + V6.4-Migration-Pattern fuer Body:
- Kopf-Kommentar mit ZIEL + IDEMPOTENZ + APPLY-PATTERN + PRE-APPLY-BACKUP + VERIFIKATION (analog Migration 093 Zeilen 1-58)
- `BEGIN; ... COMMIT;` Transaction-Block
- **NEUE VERSION ANLEGEN** (Standardfall fuer V6.4+ — neue Inhalts-Iteration):
  ```sql
  INSERT INTO public.template (slug, version, name, blocks, metadata)
  VALUES ('partner_diagnostic', 'v2', ..., ..., ...)
  ON CONFLICT (slug, version) DO UPDATE SET
    blocks=EXCLUDED.blocks, metadata=EXCLUDED.metadata, updated_at=NOW();
  ```
  Alte V1-Row bleibt unveraendert; alte capture_session-Rows referenzieren weiter ihre V1-template_id.
- **BESTEHENDE VERSION KORRIGIEREN** (Hot-Fix-Fall — Typo in Block-Intro o.ae.):
  ```sql
  INSERT INTO public.template (slug, version, name, blocks, metadata)
  VALUES ('partner_diagnostic', 'v1', ..., ..., ...)
  ON CONFLICT (slug, version) DO UPDATE SET
    blocks=EXCLUDED.blocks, metadata=EXCLUDED.metadata, updated_at=NOW();
  ```
  Update der V1-Row in place. **Vorsicht:** alle Sessions, die auf V1 zeigen, sehen sofort die neuen Texte. Nur fuer kleine Korrekturen (Typo, Klarstellung) verwenden — fuer inhaltliche Aenderungen lieber neue Version V2 anlegen.
- `version`-Feld auf `vX` setzen (jetzt teil des UNIQUE-Constraints, nicht mehr nur Audit-Trail)
- Wenn neue/geaenderte Workshop-Output-Datei existiert, in `metadata.workshop_source` referenzieren (z.B. `"DIAGNOSE_WERKZEUG_INHALT_V2.md"`)

**Anti-Pattern (vor V6.4 erlaubt, jetzt verboten):**
`ON CONFLICT (slug) DO UPDATE` — der Constraint `template_slug_key` existiert seit Migration 096 nicht mehr. Postgres wirft `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification`.

#### 2. Lokal Test-Apply gegen Coolify-Test-Setup
Pattern aus `.claude/rules/coolify-test-setup.md`:
```bash
docker run --rm \
  --network bwkg80w04wgccos48gcws8cs_strategaize-net \
  -v /opt/onboarding-plattform-test:/app -w /app \
  -e TEST_DATABASE_URL='postgresql://postgres:<pw>@supabase-db-...:5432/postgres' \
  node:20 npx vitest run src/workers/condensation/__tests__/light-pipeline-score.test.ts
```
Falls Score-Mappings veraendert wurden: neue Test-Cases in `light-pipeline-score.test.ts` ergaenzen, damit die geaenderten Werte verifiziert sind.

#### 3. Pre-Apply-Backup auf Hetzner
```bash
ssh root@159.69.207.29 "DB=\$(docker ps --filter name=supabase-db-bwkg --format '{{.Names}}' | head -1); \
  docker exec \$DB pg_dump -U postgres -d postgres \
  --table=public.template > /opt/onboarding-plattform-backups/pre-mig-NNN_$(date +%Y%m%d_%H%M%S).sql"
```

#### 4. Live-Apply auf Hetzner (Pattern aus `.claude/rules/sql-migration-hetzner.md`)
```bash
base64 -w 0 sql/migrations/NNN_partner_diagnostic_vX.sql
# resulting BASE64-string in ssh-Befehl:
ssh root@159.69.207.29 "echo '<BASE64>' | base64 -d > /tmp/mig_NNN.sql && \
  DB=\$(docker ps --filter name=supabase-db-bwkg --format '{{.Names}}' | head -1); \
  docker exec -i \$DB psql -U postgres -d postgres < /tmp/mig_NNN.sql"
```

#### 5. Verifikation
```sql
SELECT slug, version, metadata->>'usage_kind',
       jsonb_array_length(blocks) AS block_count,
       LENGTH(metadata->>'required_closing_statement') AS closing_len,
       updated_at
FROM template WHERE slug='partner_diagnostic';
```
Erwartet: 1 Row mit neuer Version + erwarteter Block-Count + Closing-Len + `updated_at` aktuell.

#### 6. Live-Smoke (analog RPT-284 Run 2)
- Login als Test-Mandant
- Diagnose-Start
- Beispiel-Antworten mit Score-Mix (3 low + 3 high oder 6 mid)
- Bericht-Render pruefen: stimmen Block-Titel? Stimmen Intros? KI-Kommentar plausibel?
- `SELECT COUNT(*) FROM ai_cost_ledger WHERE created_at > NOW() - INTERVAL '5 min' AND role='light_pipeline_block'` = 6
- Test-Daten cleanen

#### 7. Records aktualisieren
- `/docs/MIGRATIONS.md` neuer MIG-NNN-Eintrag
- `/docs/DIAGNOSE_WERKZEUG_INHALT.md` aktualisiert (oder als V2-Datei daneben)
- `/docs/DIAGNOSE_FRAGEN_UND_MAPPING.md` regenerieren (Pruef-Datei fuer extern)
- `/docs/STATE.md` Current-Focus erwaehnen

#### 8. Commit + Push + Coolify-Redeploy NICHT noetig
Template-Update ist **datenseitig**, nicht code-seitig. Coolify-Container und der laufende Worker brauchen kein Redeploy — sie lesen das Template bei jedem Job aus der DB neu.

#### 9. (Optional) Bestehende Berichte pruefen
Falls Block-Titel oder Block-Intro signifikant geaendert wurden, bestehende Mandanten-Berichte stichprobenartig oeffnen und pruefen ob Lese-Erfahrung noch konsistent ist.

---

## V6.4 Echte Versionierung — LIVE seit SLC-130 (2026-05-17)

Dieser Abschnitt war in V6.3 als Empfehlung dokumentiert und wurde in V6.4 als Slice SLC-130 umgesetzt — der hier beschriebene Architektur-Stand ist seit Migration 096 LIVE in Produktion.

**Migration 096 (`sql/migrations/096_v64_template_slug_version_unique.sql`):**
- `ALTER TABLE public.template DROP CONSTRAINT IF EXISTS template_slug_key;`
- `CREATE UNIQUE INDEX IF NOT EXISTS template_slug_version_unique ON public.template(slug, version);`
- Idempotent via DROP/CREATE IF EXISTS/NOT EXISTS. Zweiter Apply ist No-Op.

**Lookup-Logik (LIVE in 2 Files):**
- `src/app/dashboard/diagnose/start/page.tsx:79-86` — `WHERE slug='partner_diagnostic' ORDER BY created_at DESC LIMIT 1` (immer neueste Version fuer neue Sessions).
- `src/app/dashboard/diagnose/actions.ts:117-130` — analog, Server-Action `startDiagnoseRun`.
- `src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx:85-88` — UNVERAENDERT (`.eq("id", session.template_id)`, war schon korrekt). Jede Session referenziert ihre eigene Template-Version per FK.

**Migrations-Pattern fuer kuenftige Updates:**
- `INSERT ... ON CONFLICT (slug, version) DO UPDATE` (siehe Schritt 1 oben).
- V1-Row bleibt erhalten; neue V2-Insert legt eine eigene Row an.

**Vitest-Coverage:**
- `src/app/dashboard/diagnose/__tests__/template-versioning.test.ts` mit 3 Tests gegen Coolify-DB (Cross-Version-Read + UNIQUE-enforced + alter-Constraint-weg).

**Slice-Doku:** [`slices/SLC-130-template-versionierung-unique-slug-version.md`](../slices/SLC-130-template-versionierung-unique-slug-version.md) + [`reports/RPT-288.md`](../reports/RPT-288.md) (Slice-Planning) + RPT-Nummer fuer /backend-Completion siehe nachfolgende Reports.

---

## Rollback-Plan

Falls ein Template-Update unerwartete Effekte hat:

**Standard-Rollback via Pre-Apply-Backup:**
```bash
ssh root@159.69.207.29 "DB=\$(docker ps --filter name=supabase-db-bwkg --format '{{.Names}}' | head -1); \
  docker exec -i \$DB psql -U postgres -d postgres < /opt/onboarding-plattform-backups/pre-mig-NNN_<timestamp>.sql"
```
Dauer: ~2min. Kein Container-Restart noetig.

**Konsequenz:** Mandanten-Berichte zeigen wieder die alte Block-Titel/Intro-Variante. Score und KI-Kommentar in bestehenden Berichten waren ohnehin schon persistiert und bleiben unveraendert.

---

## Anti-Patterns vermeiden

- **Score-Mapping-Werte ausserhalb {0, 25, 50, 75, 100}** — bricht die Block-Score-Mathematik in `computeBlockScores` und ergibt unsinnige Bar-Visual-Hoehen.
- **comment_anchors-Triplet unvollstaendig** (low/mid/high) — `pickStyleAnchor` faellt in undefined-Verhalten und die KI bekommt einen undefined-Stil-Anker im Prompt.
- **`question.key`-Aenderungen** bei bestehenden Sessions — die alten `capture_session.answers` wuerden ihre Keys verlieren und `computeBlockScores` wirft `Answer fuer Frage X fehlt`-Errors. Wenn Frage-Keys geaendert werden muessen, ist eine Schema-Migration noetig die bestehende Sessions migriert oder aufraeumt.
- **Frage-Anzahl pro Block aendern** ohne dass `computeBlockScores` getestet ist — die Score-Berechnung mittelt ueber alle Fragen. Bei 5 statt 4 Fragen waere Score = sum/5 statt sum/4.
- **Pflicht-Output-Aussage entfernen** — die Bericht-Page liest `metadata.required_closing_statement` und rendert sie als Markdown-Footer. Fehlt sie, faellt der Bericht-Output unvollstaendig aus.
- **`metadata.usage_kind` aendern** — der Worker-Branch in `handle-job.ts` matched genau auf `self_service_partner_diagnostic`. Anderer Wert bedeutet, dass die Light-Pipeline nicht mehr ausgeloest wird und der Standard-3-Agenten-Loop greift, der fuer dieses Template nicht passt.

---

## Cross-Refs

- [docs/DIAGNOSE_WERKZEUG_INHALT.md](DIAGNOSE_WERKZEUG_INHALT.md) — Workshop-Output v1 (Inhalts-Quelle)
- [docs/DIAGNOSE_FRAGEN_UND_MAPPING.md](DIAGNOSE_FRAGEN_UND_MAPPING.md) — kompakte Pruef-Uebersicht (extern verteilbar)
- [sql/migrations/093_v63_partner_diagnostic_seed.sql](../sql/migrations/093_v63_partner_diagnostic_seed.sql) — Pattern-Vorlage fuer Update-Migrations
- [src/workers/condensation/light-pipeline.ts](../src/workers/condensation/light-pipeline.ts) — `computeBlockScores`-Logik + Stil-Anker-Auswahl
- [src/app/dashboard/diagnose/start/page.tsx](../src/app/dashboard/diagnose/start/page.tsx) — Template-Lookup beim Diagnose-Start
- [src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx](../src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx) — Bericht-Render mit Template-Lookup
- [.claude/rules/sql-migration-hetzner.md](../.claude/rules/sql-migration-hetzner.md) — base64+psql Apply-Pattern
- [.claude/rules/coolify-test-setup.md](../.claude/rules/coolify-test-setup.md) — Vitest gegen Coolify-DB Pattern
- DEC-123..128 — V6.3-Architecture-Decisions
- RPT-280 — Migration 093 Live-Apply (Beispiel-Lauf fuer Schritt-fuer-Schritt-Apply)
- RPT-284 — Live-Smoke-Pattern (Beispiel fuer Smoke nach Template-Aktion)
