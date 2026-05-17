# Diagnose-Werkzeug — Template-Editing-Workflow

**Zweck:** Wiederverwendbares Pattern, wenn die 24 Fragen, Score-Mappings oder Stil-Anker im Diagnose-Werkzeug-Template `partner_diagnostic` aktualisiert werden sollen.

**Geltungs-Bereich:** Nur das `partner_diagnostic`-Template. Die Standard-Templates (`exit_readiness`, `mitarbeiter_wissenserhebung`) folgen anderen Pattern (3-Agenten-Loop statt Light-Pipeline) und sind NICHT durch diesen Guide gedeckt.

**Erstellt:** 2026-05-17 — Aufgabe Strategaize Onboarding-Plattform V6.3.

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

## Architektur-Stand 2026-05-17 (was heute realistisch geht)

**Heutige Constraint:** Die DB-Tabelle `template` hat `UNIQUE(slug)`, NICHT `UNIQUE(slug, version)`. Das bedeutet:
- Es kann zu einem Zeitpunkt **genau eine** aktive Version pro Slug geben.
- `ON CONFLICT (slug) DO UPDATE` ueberschreibt die existierende Row.
- Bestehende `capture_session`-Rows (= alte Diagnose-Runs) zeigen ueber `template_id` auf die ueberschriebene Row.

**Auswirkung auf alte Berichte nach einem Update:**
- `knowledge_unit.body` (= der KI-Kommentar pro Block) bleibt unveraendert — der wurde beim Diagnose-Run gespeichert.
- `knowledge_unit.metadata.score` bleibt unveraendert — wurde beim Run berechnet.
- `capture_session.answers` (= die Mandanten-Antworten) bleibt unveraendert.
- **ABER:** `bericht/page.tsx` rendert Block-Titel + Block-Intro **aus dem aktuellen template.blocks**. Das heisst alte Berichte zeigen nach einem Update die **neuen** Block-Titel und Block-Intro-Texte (nicht die, die zur Zeit ihres Runs galten).

**Praktisch heisst das:**
- Wenn du nur **Fragen-Texte oder Antwort-Optionen** updatest: alte Berichte bleiben funktional korrekt — die Score sind und bleiben mathematisch richtig, die KI-Kommentare bleiben gespeichert. Nur die Frage-Texte sind in alten Berichten nicht sichtbar (`bericht/page.tsx` rendert nur Block-Titel + Intro + KU.body, nicht die Fragen selbst).
- Wenn du **Block-Titel oder Block-Intro** updatest: alte Berichte zeigen die neuen Texte. Das kann fuer den Mandanten verwirrend sein, ist aber kein Datenverlust.
- Wenn du **Score-Mappings** updatest: neue Antworten (gleicher Wortlaut) ergeben den neuen Score. Alte Berichte bleiben mit ihrem alten Score, da der bereits in `knowledge_unit.metadata.score` persistiert ist.

**Wann das problematisch wird:**
- Wenn du nach 6 Monaten echte Pilot-Daten hast und dem Mandanten den Bericht nochmal mit "Originalstand zur Zeit X" zeigen willst.
- Wenn ein Steuerberater seine alten Mandanten-Berichte zur Beratung wieder oeffnet und die Frage-Logik referenziert.

In diesen Faellen brauchst du echte Versionierung als V6.4-Polish-Slice (siehe unten).

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

Pattern aus Migration 093 uebernehmen:
- Kopf-Kommentar mit ZIEL + IDEMPOTENZ + APPLY-PATTERN + PRE-APPLY-BACKUP + VERIFIKATION (analog Migration 093 Zeilen 1-58)
- `BEGIN; ... COMMIT;` Transaction-Block
- Einziger DML-Befehl: `INSERT INTO public.template (slug, version, name, blocks, metadata) VALUES (...) ON CONFLICT (slug) DO UPDATE SET version=EXCLUDED.version, blocks=EXCLUDED.blocks, metadata=EXCLUDED.metadata, updated_at=NOW();`
- `version`-Feld auf `vX` setzen (Sichtbarkeit als Audit-Trail, nicht als Constraint)
- Wenn neue/geaenderte Workshop-Output-Datei existiert, in `metadata.workshop_source` referenzieren (z.B. `"DIAGNOSE_WERKZEUG_INHALT_V2.md"`)

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

## V6.4-Polish-Slice fuer echte Versionierung (Empfehlung)

Wenn echte Versionierung gewuenscht wird (alte Berichte rendern mit alter Frage-Logik, neue Sessions nutzen neue Version), ist das ein kleiner Slice (~2-3h):

**Schema-Aenderung:**
- `ALTER TABLE template DROP CONSTRAINT template_slug_key;`
- `CREATE UNIQUE INDEX template_slug_version_unique ON template(slug, version);`

**Worker- und Start-Action-Logik:**
- `src/app/dashboard/diagnose/start/page.tsx:83` Template-Lookup auf `WHERE slug='partner_diagnostic' ORDER BY created_at DESC LIMIT 1` (= immer neueste Version fuer neue Sessions)
- `src/app/dashboard/diagnose/[capture_session_id]/bericht/page.tsx:84` Template-Lookup ueber `session.template_id` direkt (= jede Session referenziert ihre eigene Template-Version)

**Migration:**
- `INSERT ... ON CONFLICT (slug, version) DO UPDATE` statt `ON CONFLICT (slug) DO UPDATE`
- V1-Row bleibt erhalten, V2 wird als neue Row angelegt

**Backlog:** als V6.4-Kandidat einplanen wenn der erste echte Workshop-Output-V2 ansteht. Aufwand ~2-3h Backend + ~1h Vitest + ~30min Live-Smoke gegen alte+neue Sessions.

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
