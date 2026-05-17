# Diagnose-Werkzeug — Auswertungs-Beispiel (Smoke-Run-2 vom 2026-05-17)

**Zweck:** Nachvollziehbare Darstellung wie aus den eingegebenen Antworten der Bericht-Inhalt entstanden ist. Pruef-Datei zum Gegenchecken-lassen (Fach-Reviewer, Steuerberater).

**Quelle:** Live-Smoke-Run-2 aus QA-Pass V6.3 SLC-105 — protokolliert in [reports/RPT-284.md](../reports/RPT-284.md).

**Test-Mandant:** `qa-mandant@strategaizetransition.com` (Test-Fixture, danach komplett bereinigt).

**Capture-Session:** `315a28c3-7cea-4b1a-940c-28349fb1eb8e` (Daten nach Smoke-Cleanup geloescht, aber Verarbeitungs-Pfad ist deterministisch und reproduzierbar).

**Hinweis zur Daten-Lage:** Die konkreten KI-Kommentar-Texte des Smoke-Runs sind nach Test-Cleanup nicht mehr in der DB. Dieser Guide rekonstruiert die Verarbeitungs-Schritte deterministisch aus dem Template + den dokumentierten Antworten. Bei einem neuen Run mit denselben Antworten waeren die Scores zu 100% identisch (deterministisch) und die KI-Kommentare stilistisch sehr aehnlich (temperature=0.3, niedrige Streuung).

---

## Was im Smoke-Test eingegeben wurde

**Antwort-Strategie:** Bulk-Click auf alle 24 mittleren Antwort-Optionen (Score 50 pro Frage). Das war bewusst so gewaehlt, weil:
- Mid-Range deckt den haeufigsten realen Fall ab ("teilweise strukturiert, nicht chaotisch, nicht perfekt")
- Trifft pro Block den **mid**-Stil-Anker und prueft damit die mittlere Bericht-Variante
- Ergibt einen gleichmaessigen Bar-Chart (6× 50/100), gut zum visuellen Verifizieren des Renderers

### Die 24 Antworten im Detail

**Baustein 1 — Strukturelle KI-Reife** (alle Mid-Optionen, jede mit Score 50)

| # | Frage (Kurzfassung) | Gewaehlte Antwort | Score |
|---|---|---|---:|
| 1.1 | Wie viele zentrale Systeme oder Datenquellen? | "4-5 zentrale Systeme — die wichtigsten Informationen sind auffindbar, aber nicht sauber verbunden" | 50 |
| 1.2 | Wie verlaesslich sind Ihre Stammdaten? | "Teils-teils — die wichtigsten Daten stimmen, aber nicht durchgehend" | 50 |
| 1.3 | Wer ist fuer Systeme, Datenqualitaet und Prozesspflege verantwortlich? | "Einzelne Mitarbeiter kuemmern sich darum, aber ohne klare Gesamtverantwortung" | 50 |
| 1.4 | Wie stark laufen Prozesse ueber Papier/E-Mail/Excel? | "Gemischt — wichtige Teile sind digital, aber viele Uebergaben sind manuell" | 50 |

**Baustein 2 — Entscheidungs-Qualitaet** (alle Mid-Optionen, jede mit Score 50)

| # | Frage (Kurzfassung) | Gewaehlte Antwort | Score |
|---|---|---|---:|
| 2.1 | Wie werden wichtige Entscheidungen festgehalten? | "In einzelnen Protokollen oder Dateien — aber nicht einheitlich" | 50 |
| 2.2 | Was passiert, wenn der GF 2 Wochen nicht erreichbar ist? | "Ein Stellvertreter entscheidet einiges, aber ohne klare schriftliche Befugnisse" | 50 |
| 2.3 | Wie haeufig pruefen Sie Entscheidungs-Wirkung? | "Gelegentlich — aber ohne festen Rhythmus" | 50 |
| 2.4 | Auf welcher Grundlage werden Entscheidungen getroffen? | "Mischung aus Erfahrung, Zahlen und Einzelinformationen" | 50 |

**Baustein 3 — Schriftlich festgehaltene Entscheidungen** (alle Mid-Optionen, jede mit Score 50)

| # | Frage (Kurzfassung) | Gewaehlte Antwort | Score |
|---|---|---|---:|
| 3.1 | GF faellt 4 Wochen aus, wieviel % der Entscheidungen ohne ihn moeglich? | "40-60% — das Tagesgeschaeft laeuft halbwegs, aber holprig" | 50 |
| 3.2 | Wo sind Sonderregeln dokumentiert? | "Teilweise in Kundenakten oder Projektunterlagen, aber nicht einheitlich" | 50 |
| 3.3 | Wie gut koennen Stellvertreter nachvollziehen warum Regeln gelten? | "Teils-teils — manche Dinge sind dokumentiert, andere nicht" | 50 |
| 3.4 | Wieviele kritische Wissensbereiche nur 1 Person beherrscht? | "3-5 Bereiche" | 50 |

**Baustein 4 — SOPs** (alle Mid-Optionen, jede mit Score 50)

| # | Frage (Kurzfassung) | Gewaehlte Antwort | Score |
|---|---|---|---:|
| 4.1 | Wie gut sind Standardprozesse dokumentiert? | "Teils-teils — einige Ablaeufe sind beschrieben, andere nicht" | 50 |
| 4.2 | Was bekommt ein neuer MA fuer wiederkehrende Aufgabe? | "Einzelne Checklisten oder Vorlagen, aber nicht vollstaendig" | 50 |
| 4.3 | Wie oft werden dokumentierte Ablaeufe aktualisiert? | "Gelegentlich — aber ohne festen Verantwortlichen" | 50 |
| 4.4 | Wie stark unterscheiden sich Arbeitsweisen bei gleicher Aufgabe? | "Mittel — es gibt grobe Gemeinsamkeiten, aber viele Varianten" | 50 |

**Baustein 5 — Unternehmerhandbuch** (alle Mid-Optionen, jede mit Score 50)

| # | Frage (Kurzfassung) | Gewaehlte Antwort | Score |
|---|---|---|---:|
| 5.1 | Gibt es ein zentrales Dokument wie die Firma funktioniert? | "Teilweise — Struktur, Prozesse und Regeln sind verteilt dokumentiert" | 50 |
| 5.2 | Koennte neuer GF in 4 Wochen verstehen wie die Firma funktioniert? | "Teilweise — die wichtigsten Zahlen und Strukturen waeren auffindbar" | 50 |
| 5.3 | Wie gut sind Strategie, Zielkunden, Prioritaeten schriftlich? | "Teils-teils — manches ist beschrieben, aber nicht sauber verbunden" | 50 |
| 5.4 | Wird vorhandene Unternehmensdokumentation im Alltag genutzt? | "Gelegentlich — einzelne Personen nutzen die Dokumente" | 50 |

**Baustein 6 — Workaround-Dunkelziffer** (alle Mid-Optionen, jede mit Score 50)

| # | Frage (Kurzfassung) | Gewaehlte Antwort | Score |
|---|---|---|---:|
| 6.1 | Wieviele Excel-Listen/Schatten-Dateien? | "4-10 Listen" | 50 |
| 6.2 | Wie oft Daten exportiert, manuell bearbeitet, woanders verwendet? | "Gelegentlich bei bestimmten Auswertungen oder Sonderfaellen" | 50 |
| 6.3 | Nutzen MA private/ungeregelte Tools? | "Teilweise — es gibt offizielle Tools, aber manche arbeiten daneben anders" | 50 |
| 6.4 | Wer haette Ueberblick ueber Workarounds? | "Bereichsleiter kennen ungefaehr die wichtigsten Workarounds" | 50 |

---

## Schritt 1 — Score-Berechnung (deterministisch, ohne KI)

Die Funktion `computeBlockScores` ([src/workers/condensation/light-pipeline.ts:83](../src/workers/condensation/light-pipeline.ts#L83)) ist eine reine TypeScript-Funktion ohne KI-Beteiligung. Sie laeuft fuer jeden Block einmal durch:

```
fuer jeden block in template.blocks:
  scores = []
  fuer jede question in block.questions:
    antwort = capture_session.answers[question.key]
    mapping = question.score_mapping.find(m => m.label === antwort)
    scores.push(mapping.score)

  block_score = Math.round(sum(scores) / scores.length)
```

**Konkret im Smoke-Run-2:**

| Block | Frage-Scores | Summe | Mittelwert | Gerundet |
|---|---|---:|---:|---:|
| Baustein 1 | 50 + 50 + 50 + 50 | 200 | 50.0 | **50** |
| Baustein 2 | 50 + 50 + 50 + 50 | 200 | 50.0 | **50** |
| Baustein 3 | 50 + 50 + 50 + 50 | 200 | 50.0 | **50** |
| Baustein 4 | 50 + 50 + 50 + 50 | 200 | 50.0 | **50** |
| Baustein 5 | 50 + 50 + 50 + 50 | 200 | 50.0 | **50** |
| Baustein 6 | 50 + 50 + 50 + 50 | 200 | 50.0 | **50** |

**Gesamt-Score** (arithmetisches Mittel aller Block-Scores): (50+50+50+50+50+50) / 6 = **50**

Diese Berechnung ist 100% reproduzierbar — bei gleichen Antworten kommen immer dieselben Scores raus. Kein KI-Call, kein Zufall.

---

## Schritt 2 — Stil-Anker-Auswahl

Pro Block waehlt `pickStyleAnchor` ([light-pipeline.ts:218](../src/workers/condensation/light-pipeline.ts#L218)) einen von drei Stil-Anker-Texten, abhaengig vom Block-Score:

| Score-Range | Stil-Anker |
|---|---|
| 0-30 | **low**-Variante |
| 31-55 | **mid**-Variante |
| 56-100 | **high**-Variante |

**Im Smoke-Run-2:** Alle Blocks haben Score 50 → Score-Range 31-55 → **mid**-Stil-Anker fuer ALLE 6 Blocks.

### Welche mid-Stil-Anker waren das?

| Block | Mid-Stil-Anker-Text (= Vorlage fuer die KI) |
|---|---|
| Baustein 1 | "Es gibt erste Strukturen, aber noch keinen belastbaren Unterbau fuer breiteren KI-Einsatz. Einzelne Pilotbereiche sind denkbar, aber nur dort, wo Daten und Prozesse wirklich sauber genug sind." |
| Baustein 2 | "Die Entscheidungsqualitaet ist teilweise vorhanden, aber noch nicht konsequent dokumentiert und ueberpruefbar. Fuer KI reicht das nur in eng begrenzten Bereichen mit klaren Regeln." |
| Baustein 3 | "Ein Teil des Wissens ist dokumentiert, aber noch nicht vollstaendig genug, um unabhaengig von Schluesselpersonen zu funktionieren. Genau hier liegt eine der wichtigsten Hausaufgaben vor ernsthaftem KI-Einsatz." |
| Baustein 4 | "Es gibt erste Standards, aber sie sind noch nicht stabil genug fuer breitere Automatisierung. Fuer einzelne Ablaeufe kann KI helfen, wenn vorher klar festgelegt wird, wie der richtige Prozess aussieht." |
| Baustein 5 | "Es gibt bereits Bausteine eines Unternehmerhandbuchs, aber noch kein wirklich nutzbares Gesamtbild. Fuer Nachfolge, Skalierung und KI-Einsatz fehlt damit noch ein zentraler Orientierungsrahmen." |
| Baustein 6 | "Es gibt spuerbare Umgehungsloesungen, aber sie sind nicht voellig ausser Kontrolle. Bevor KI breiter eingesetzt wird, sollten die wichtigsten Schattenprozesse sichtbar gemacht und bewertet werden." |

---

## Schritt 3 — KI-Prompt-Bau pro Block

Pro Block baut `buildLightPipelinePrompt` ([light-pipeline.ts:232](../src/workers/condensation/light-pipeline.ts#L232)) zwei Texte fuer Bedrock:

### System-Prompt (gilt fuer alle 6 Calls identisch)

> "Du bist ein nuechterner Berater, der Diagnose-Antworten zu Strukturreife und KI-Tauglichkeit kommentiert. Antworte in 2-3 Saetzen pro Block, deutsch, prosaisch (keine Bullet-Listen, keine Empfehlungen, keine Aufzaehlungen). Stil: ehrlich, direkt, nicht beratungs-floskelhaft."

### User-Prompt (variiert pro Block)

**Beispiel-Prompt fuer Baustein 1 im Smoke-Run-2:**

```
Bewerteter Baustein: Strukturelle KI-Reife
Block-Beschreibung: Dieser Baustein misst, ob Ihre Firma ueberhaupt sauber genug organisiert ist, damit KI sinnvoll helfen kann. Wenn Daten, Prozesse und Verantwortlichkeiten unklar sind, automatisiert KI nicht die Loesung, sondern verstaerkt das Durcheinander.
Berechneter Score: 50 (Skala 0-100, 100 = beste Strukturreife)
Stil-Anker fuer Score-Bereich mid: "Es gibt erste Strukturen, aber noch keinen belastbaren Unterbau fuer breiteren KI-Einsatz. Einzelne Pilotbereiche sind denkbar, aber nur dort, wo Daten und Prozesse wirklich sauber genug sind."

Antworten des Mandanten:
- Wie viele zentrale Systeme oder Datenquellen nutzen Sie heute fuer Kunden, Auftraege, Angebote, Rechnungen und interne Abstimmungen?: 4-5 zentrale Systeme — die wichtigsten Informationen sind auffindbar, aber nicht sauber verbunden
- Wie verlaesslich sind Ihre Stammdaten, zum Beispiel Kundeninformationen, Ansprechpartner, Konditionen, Artikel, Leistungen oder Projektstaende?: Teils-teils — die wichtigsten Daten stimmen, aber nicht durchgehend
- Wie klar ist in Ihrer Firma festgelegt, wer fuer Systeme, Datenqualitaet und Prozesspflege verantwortlich ist?: Einzelne Mitarbeiter kuemmern sich darum, aber ohne klare Gesamtverantwortung
- Wie stark laufen Ihre wichtigsten Prozesse heute noch ueber Papier, E-Mail, Zuruf oder einzelne Excel-Dateien?: Gemischt — wichtige Teile sind digital, aber viele Uebergaben sind manuell

Schreibe einen kommentierenden Absatz im Stil des Stil-Ankers, der die konkreten Antworten des Mandanten aufgreift. Erwaehne KEINE Score-Zahlen, KEINE konkreten Fragen-Texte.
```

Analog dazu wurden parallel 5 weitere User-Prompts fuer Baustein 2-6 gebaut (gleiche Struktur, andere Inhalte).

---

## Schritt 4 — Bedrock-Call (KI generiert Kommentar)

Modell: `eu.anthropic.claude-sonnet-4-20250514-v1:0` (eu-central-1, Frankfurt, DSGVO-konform).

Settings:
- `temperature: 0.3` (niedrige Streuung, hoher Wiedererkennungs-Wert ueber Runs)
- `maxTokens: 200` (jeder Kommentar wird 2-3 Saetze, ~30-60 Tokens — 200 ist sichere Obergrenze)

Alle 6 Block-Calls laufen **parallel** via `Promise.all` ([light-pipeline.ts:316](../src/workers/condensation/light-pipeline.ts#L316)) — gesamte Bedrock-Phase dauerte im Smoke-Run-2 etwa 30 Sekunden.

### Was wuerde die KI im mid-Stil-Anker-Stil schreiben?

Genaue Output-Texte des Smoke-Run-2 sind nach Cleanup nicht mehr in der DB. Erwartete Stil-Charakteristika basierend auf System-Prompt + mid-Stil-Anker:

- **Sprachstil:** Ehrlich, direkt, nicht floskelhaft. KEINE "Wir empfehlen Ihnen..." oder "Eine gute Praxis waere...".
- **Satz-Anzahl:** 2-3 pro Block.
- **Inhalt:** Greift die konkreten Antworten auf (z.B. "verteilte Systeme", "uneinheitliche Stellvertretung") OHNE die Frage-Texte zu zitieren und OHNE Score-Zahlen zu nennen.
- **Tonfall mid:** Sachlich-realistisch — "es gibt schon was, aber noch nicht belastbar", "in eng begrenzten Bereichen denkbar", "vor breiterem Einsatz Hausaufgaben".

Eine erwartbare Beispiel-Output-Variante fuer Baustein 1 koennte z.B. lauten:

> "In Ihrer Firma sind die wichtigsten Daten zwar grundsaetzlich auffindbar, aber sie liegen in mehreren Systemen verteilt und sind nicht sauber miteinander verbunden. Die Verantwortlichkeit fuer Datenpflege ist auf einzelne Mitarbeiter verteilt, ohne dass eine zentrale Gesamtverantwortung greift. KI kann unter solchen Bedingungen einzelne Pilotanwendungen bedienen, wenn die zugrundeliegenden Daten in einem klar abgegrenzten Bereich sauber sind."

(Diese Formulierung ist eine Rekonstruktion. Der tatsaechliche LLM-Output des Smoke-Runs ist nach Cleanup nicht mehr verfuegbar.)

---

## Schritt 5 — Cost-Ledger-Eintraege

Pro Block-Call schreibt die Pipeline einen Eintrag in `ai_cost_ledger`:

```sql
INSERT INTO ai_cost_ledger (tenant_id, job_id, model_id, tokens_in, tokens_out,
                            usd_cost, duration_ms, iteration, role)
VALUES (..., 'eu.anthropic.claude-sonnet-4-...', tokens_in, tokens_out,
        usd_cost, duration_ms, 1, 'light_pipeline_block');
```

**Smoke-Run-2 Aggregat (nachgewiesen in RPT-284):**

| Kennzahl | Wert |
|---|---|
| Anzahl Cost-Eintraege | 6 (1 pro Block) |
| Tokens insgesamt | 2.720 Input + 928 Output = **3.648** |
| Kosten insgesamt | **$0,022080** |
| Bedrock-Duration | ~30 Sekunden parallel |
| Budget pro Run | $0,10 (AC-14 Budget-Grenze) |
| Headroom | **78% unter Budget** |

Pricing (eu-central-1, Sonnet):
- Input: $3 / Mio Tokens
- Output: $15 / Mio Tokens

---

## Schritt 6 — Atomare Persistenz via RPC

Nach Bedrock-Phase wird der Block-Output in einer einzigen Transaktion in 4 Tabellen geschrieben via `rpc_finalize_partner_diagnostic` ([sql/migrations/094_v63_rpc_finalize_partner_diagnostic.sql](../sql/migrations/094_v63_rpc_finalize_partner_diagnostic.sql)):

| Tabelle | Was wird geschrieben | Pro Run |
|---|---|---:|
| `knowledge_unit` | Block-Daten + KI-Kommentar + Score (in metadata.score JSONB) | **6 Rows** |
| `validation_layer` | reviewer_role='system_auto', action='accept', note='Auto-Finalize per DGN-A' | **6 Rows** |
| `block_checkpoint` | checkpoint_type='auto_final' | **6 Rows** |
| `capture_session` | status: 'submitted' → 'finalized' | **1 Update** |

**Auto-Finalize (DGN-A)**: Im Gegensatz zum Standard-3-Agenten-Loop (V1-V5) gibt es hier KEINEN Berater-Review. Die KU geht direkt mit `status='accepted'` rein, der Bericht ist sofort sichtbar.

---

## Schritt 7 — Bericht-Render

Sobald der RPC-Call durch ist, ist `capture_session.status='finalized'`. Der Bericht-Pending-Poller ([src/components/diagnose/BerichtPendingPoller.tsx](../src/components/diagnose/BerichtPendingPoller.tsx)) merkt das beim naechsten 3-Sekunden-Poll und leitet auf `/dashboard/diagnose/<id>/bericht` weiter.

Die Bericht-Page rendert:

| Render-Element | Quelle |
|---|---|
| Partner-Branding-Header ("Im Auftrag von QA-Steuerberater Demo") | partner_branding_config + resolveBrandingForTenant |
| 6 horizontale Tailwind-Bars | knowledge_unit.metadata.score (pro Block 0-100) |
| Block-Titel + Block-Intro | template.blocks (V6.3-Verhalten: aktuelles Template) |
| KI-Kommentar pro Block | knowledge_unit.body |
| Pflicht-Output-Aussage (Footer) | template.metadata.required_closing_statement |
| "Ich will mehr"-Stub-Karte | hardcoded Komponente fuer Lead-Push (SLC-106) |
| Print-Button | window.print() Client-Component |

**Smoke-Run-2 sichtbarer Bericht:**
- Alle 6 Bars zeigten 50/100 (mittlere Faerbung)
- 6 KI-Kommentare im mid-Stil prosaisch
- Pflicht-Aussage am Ende: "Wir sind noch nicht bereit, KI strukturiert einzusetzen..."

Screenshot dazu: [reports/assets/RPT-284-bericht.png](../reports/assets/RPT-284-bericht.png) (Full-Page-Screenshot vom Run 1, Layout identisch zu Run 2).

---

## Wie kann ich die Logik bei einem NEUEN Run live nachvollziehen?

Falls du selbst einen echten Diagnose-Run machst und dabei die Verarbeitung mitlesen willst:

### A — Antworten + berechnete Scores live in DB

```sql
SELECT
  cs.id AS session_id,
  cs.status,
  cs.created_at,
  ku.block_key,
  ku.metadata->'score' AS score,
  jsonb_pretty(ku.metadata) AS metadata_full,
  ku.body AS ki_kommentar
FROM capture_session cs
JOIN knowledge_unit ku ON ku.capture_session_id = cs.id
WHERE cs.template_id = (SELECT id FROM template WHERE slug='partner_diagnostic')
ORDER BY cs.created_at DESC, ku.block_key
LIMIT 30;
```

### B — Mandanten-Antworten als rohe JSONB

```sql
SELECT id, status, jsonb_pretty(answers) AS antworten
FROM capture_session
WHERE template_id = (SELECT id FROM template WHERE slug='partner_diagnostic')
ORDER BY created_at DESC LIMIT 5;
```

### C — Cost-Trail

```sql
SELECT cl.created_at, cl.tokens_in, cl.tokens_out, cl.usd_cost, cl.duration_ms
FROM ai_cost_ledger cl
WHERE cl.role='light_pipeline_block'
ORDER BY cl.created_at DESC LIMIT 12;
```

### D — Worker-Log (Bedrock-Calls + Finalize)

```sql
SELECT level, source, message, created_at
FROM error_log
WHERE source IN ('partner_diagnostic_finalized', 'partner_diagnostic_failed', 'light-pipeline')
ORDER BY created_at DESC LIMIT 20;
```

### E — Bericht im Browser

`https://onboarding.strategaizetransition.com/dashboard/diagnose/<capture_session_id>/bericht`

Als strategaize_admin eingeloggt siehst du **jeden Bericht aller Tenants** (3-Layer-Auth-Matrix bericht/page.tsx).

---

## Anti-Patterns die du beim Pruefen sehen wuerdest

Diese Faelle sollten in einem echten Run NICHT auftreten — falls doch, ist es ein Bug:

- **Score aussen Range 0-100** → `computeBlockScores` rundet, Wert sollte immer ganzzahlig 0-100 sein
- **knowledge_unit.body leer oder mit Bullet-Listen** → System-Prompt verbietet das explizit
- **Score-Zahlen im KI-Kommentar** → User-Prompt verbietet das explizit
- **Frage-Texte im KI-Kommentar zitiert** → User-Prompt verbietet das explizit
- **Block mit fehlender KU** → Bug im RPC, sollte atomare Tx sicherstellen dass alle 6 Blocks rein gehen
- **capture_session.status nicht 'finalized' nach Bericht-Render** → Race-Condition, sollte durch Poller abgefangen sein

---

## Cross-Refs

- [docs/DIAGNOSE_WERKZEUG_INHALT.md](DIAGNOSE_WERKZEUG_INHALT.md) — Workshop-Output (Inhalts-Quelle, 24 Fragen + Mappings + Stil-Anker)
- [docs/DIAGNOSE_FRAGEN_UND_MAPPING.md](DIAGNOSE_FRAGEN_UND_MAPPING.md) — kompakte Pruef-Uebersicht (Fragen + Score-Mapping als Tabelle)
- [docs/DIAGNOSE_TEMPLATE_EDITING.md](DIAGNOSE_TEMPLATE_EDITING.md) — Workflow fuer Template-Updates
- [reports/RPT-284.md](../reports/RPT-284.md) — Live-Smoke-QA-Report mit Ablauf-Protokoll des Smoke-Run-2
- [src/workers/condensation/light-pipeline.ts](../src/workers/condensation/light-pipeline.ts) — Pipeline-Implementation (computeBlockScores + buildLightPipelinePrompt + runLightPipeline)
- [sql/migrations/093_v63_partner_diagnostic_seed.sql](../sql/migrations/093_v63_partner_diagnostic_seed.sql) — Template-Seed
- [sql/migrations/094_v63_rpc_finalize_partner_diagnostic.sql](../sql/migrations/094_v63_rpc_finalize_partner_diagnostic.sql) — Atomare Finalize-RPC
- [reports/assets/RPT-284-bericht.png](../reports/assets/RPT-284-bericht.png) — Bericht-Screenshot vom Smoke-Test
- DEC-100 (Auto-Finalize DGN-A), DEC-125 (computeBlockScores Pure-Function), DEC-128 (6-Bar-Tailwind-Visual)
