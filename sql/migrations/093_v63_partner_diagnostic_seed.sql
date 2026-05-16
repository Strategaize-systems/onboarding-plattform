-- Migration 093: V6.3 Diagnose-Werkzeug Live-Schaltung (Schema + Template-Seed)
-- SLC-105 MT-1 (FEAT-045, MIG-037) — DEC-123, DEC-124, DEC-127, RPT-279
--
-- ZIEL
-- ====
-- 1) template.metadata JSONB-Spalte (haelt usage_kind + required_closing_statement)
-- 2) knowledge_unit.metadata JSONB-Spalte (haelt Diagnose-Score, KI-Kommentar,
--    score_rule_version, block_intro — Light-Pipeline-Output pro Block)
-- 3) Idempotenter Template-Seed 'partner_diagnostic' v1 mit
--    24 Fragen (6 Bloecke × 4 Fragen) + Pflicht-Output-Aussage.
--    Inhalts-Quelle: docs/DIAGNOSE_WERKZEUG_INHALT.md (BL-095 Workshop-Output v1).
--
-- IDEMPOTENZ
-- ==========
-- ALTER ... ADD COLUMN IF NOT EXISTS + INSERT ... ON CONFLICT (slug) DO UPDATE.
-- Zweiter Apply ist ein No-Op.
--
-- Hinweis Unique-Constraint:
-- template.slug ist UNIQUE allein (MIG-021), NICHT (slug, version).
-- ARCHITECTURE.md V6.3-Section spricht von ON CONFLICT (slug, version) — das war
-- konzeptionell gemeint. Echter Constraint ist nur slug. Wir nutzen
-- ON CONFLICT (slug) DO UPDATE — bei spaeterem Workshop-Output-v2 ueberschreibt
-- eine neue Migration (094) den partner_diagnostic-Eintrag.
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/093_v63_partner_diagnostic_seed.sql
--   echo '<BASE64>' | base64 -d > /tmp/093_v63.sql
--   docker exec -i <db-container> psql -U postgres -d postgres < /tmp/093_v63.sql
--
-- PRE-APPLY-BACKUP-PFLICHT
-- ========================
--   docker exec <db-container> pg_dump -U postgres -d postgres \
--     --schema-only --table=public.template --table=public.knowledge_unit \
--     > /opt/onboarding-plattform-backups/pre-mig-037-093_$(date +%Y%m%d_%H%M%S).sql
--
-- VERIFIKATION (nach Apply)
-- =========================
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='template' AND column_name='metadata';
--   -- erwartet: 1 Row
--
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='knowledge_unit' AND column_name='metadata';
--   -- erwartet: 1 Row
--
--   SELECT slug, version, metadata->>'usage_kind',
--          jsonb_array_length(blocks) AS block_count,
--          (SELECT COUNT(*) FROM jsonb_array_elements(blocks) b,
--                                 jsonb_array_elements(b->'questions') q)
--            AS question_count
--     FROM template WHERE slug='partner_diagnostic';
--   -- erwartet: 1 Row, usage_kind='self_service_partner_diagnostic',
--   --           block_count=6, question_count=24

DO $mig037_step1$ BEGIN

-- ============================================================
-- 1. template.metadata JSONB-Spalte
-- ============================================================
-- Haelt Worker-Branch-Trigger (usage_kind) + Pflicht-Output-Aussage als
-- Markdown-Footer fuer Bericht-Renderer. Existierende Templates
-- (exit_readiness, mitarbeiter_wissenserhebung) bekommen '{}'::jsonb Default
-- und laufen weiter durch Standard-Pipeline.
ALTER TABLE public.template
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.template.metadata IS
  'V6.3+ Optionale Template-Metadaten. usage_kind=self_service_partner_diagnostic triggert Light-Pipeline-Branch im knowledge_unit_condensation-Handler. required_closing_statement haelt Pflicht-Output-Aussage als Markdown.';

RAISE NOTICE 'MIG-037/093: template.metadata column ensured';

-- ============================================================
-- 2. knowledge_unit.metadata JSONB-Spalte
-- ============================================================
-- Haelt Light-Pipeline-Output pro Block: score (0-100, deterministisch),
-- comment (Bedrock-Verdichtungs-Output), score_rule_version (Template-
-- Version-Identifier fuer Reproduzierbarkeit), block_intro (kopiert aus
-- Template fuer Renderer-Stabilitaet bei spaeterem Template-Update).
-- Standard-Pipeline-KUs bekommen '{}'::jsonb Default — nicht betroffen.
ALTER TABLE public.knowledge_unit
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.knowledge_unit.metadata IS
  'V6.3+ Optionale KU-Metadaten. Light-Pipeline schreibt: { score:number, comment:string, score_rule_version:string, block_intro:string }. Standard-Pipeline laesst leer.';

RAISE NOTICE 'MIG-037/093: knowledge_unit.metadata column ensured';

-- ============================================================
-- 3. Template-Seed 'partner_diagnostic' v1
-- ============================================================
-- 24 Fragen (6 Bloecke × 4 Fragen) aus docs/DIAGNOSE_WERKZEUG_INHALT.md.
-- Score-Mapping pro Frage diskret (0/25/50/75/100). Frage-Typen:
-- multiple_choice | likert_5 | numeric_bucket.
-- Comment-Anchors pro Block: low (0-30) / mid (31-55) / high (56-100).
-- ON CONFLICT (slug) DO UPDATE: idempotent + erlaubt Re-Seed bei spaeterem
-- Workshop-Output-Update (z.B. Migration 094 fuer v2).
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'partner_diagnostic',
  'Strategaize-Diagnose-Werkzeug',
  'v1',
  '24 Fragen ueber 6 MULTIPLIER_MODEL-Bausteine. Auto-Finalize DGN-A (kein Berater-Review). Inhalts-Quelle: BL-095 Workshop v1.',
  $blocks$[
    {
      "key": "ki_reife",
      "title": "Strukturelle KI-Reife",
      "intro": "Dieser Baustein misst, ob Ihre Firma überhaupt sauber genug organisiert ist, damit KI sinnvoll helfen kann. Wenn Daten, Prozesse und Verantwortlichkeiten unklar sind, automatisiert KI nicht die Lösung, sondern verstärkt das Durcheinander.",
      "order": 1,
      "questions": [
        {
          "key": "ki_reife.q1",
          "text": "Wie viele zentrale Systeme oder Datenquellen nutzen Sie heute für Kunden, Aufträge, Angebote, Rechnungen und interne Abstimmungen?",
          "question_type": "multiple_choice",
          "scale_direction": "negative",
          "score_mapping": [
            {"label": "Mehr als 10 Systeme, Listen oder Ablagen — niemand hat den vollständigen Überblick", "score": 0},
            {"label": "6-10 Systeme oder Listen — es funktioniert, aber vieles ist verstreut", "score": 25},
            {"label": "4-5 zentrale Systeme — die wichtigsten Informationen sind auffindbar, aber nicht sauber verbunden", "score": 50},
            {"label": "2-3 zentrale Systeme — die Firma ist weitgehend strukturiert", "score": 75},
            {"label": "1 klares Hauptsystem mit sauberer Ergänzung — die Datenlage ist übersichtlich", "score": 100}
          ]
        },
        {
          "key": "ki_reife.q2",
          "text": "Wie verlässlich sind Ihre Stammdaten, zum Beispiel Kundeninformationen, Ansprechpartner, Konditionen, Artikel, Leistungen oder Projektstände?",
          "question_type": "likert_5",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Sehr unzuverlässig — wir müssen oft nachfragen oder suchen", "score": 0},
            {"label": "Eher unzuverlässig — es gibt regelmäßig Dubletten, alte Daten oder Lücken", "score": 25},
            {"label": "Teils-teils — die wichtigsten Daten stimmen, aber nicht durchgehend", "score": 50},
            {"label": "Eher zuverlässig — Fehler kommen vor, sind aber nicht die Regel", "score": 75},
            {"label": "Sehr zuverlässig — wir können uns im Tagesgeschäft darauf verlassen", "score": 100}
          ]
        },
        {
          "key": "ki_reife.q3",
          "text": "Wie klar ist in Ihrer Firma festgelegt, wer für Systeme, Datenqualität und Prozesspflege verantwortlich ist?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Niemand — es kümmert sich, wer gerade Zeit hat", "score": 0},
            {"label": "Der Geschäftsführer — aber eher nebenbei und ohne feste Struktur", "score": 25},
            {"label": "Einzelne Mitarbeiter kümmern sich darum, aber ohne klare Gesamtverantwortung", "score": 50},
            {"label": "Es gibt klare Zuständigkeiten für einzelne Bereiche", "score": 75},
            {"label": "Es gibt eine klare Gesamtverantwortung und geregelte Pflegeprozesse", "score": 100}
          ]
        },
        {
          "key": "ki_reife.q4",
          "text": "Wie stark laufen Ihre wichtigsten Prozesse heute noch über Papier, E-Mail, Zuruf oder einzelne Excel-Dateien?",
          "question_type": "multiple_choice",
          "scale_direction": "negative",
          "score_mapping": [
            {"label": "Sehr stark — ohne Papier, E-Mail und Excel würde vieles stehen bleiben", "score": 0},
            {"label": "Stark — die offiziellen Systeme decken viele Abläufe nicht sauber ab", "score": 25},
            {"label": "Gemischt — wichtige Teile sind digital, aber viele Übergaben sind manuell", "score": 50},
            {"label": "Eher gering — die meisten Prozesse laufen in geregelten Systemen", "score": 75},
            {"label": "Sehr gering — Prozesse sind weitgehend digital, nachvollziehbar und systemgestützt", "score": 100}
          ]
        }
      ],
      "comment_anchors": {
        "low": "Ihre strukturelle Basis ist aktuell nicht KI-tauglich. Wenn KI auf verstreute Daten, unklare Systeme und unsaubere Zuständigkeiten trifft, entstehen mehr Fehler als Entlastung.",
        "mid": "Es gibt erste Strukturen, aber noch keinen belastbaren Unterbau für breiteren KI-Einsatz. Einzelne Pilotbereiche sind denkbar, aber nur dort, wo Daten und Prozesse wirklich sauber genug sind.",
        "high": "Die Firma hat eine brauchbare strukturelle Grundlage für KI. Der nächste Engpass liegt weniger in der Technik, sondern darin, die passenden Anwendungsfälle sauber auszuwählen und kontrolliert umzusetzen."
      }
    },
    {
      "key": "entscheidungs_qualitaet",
      "title": "Entscheidungs-Qualität",
      "intro": "Dieser Baustein misst, wie sauber Entscheidungen in Ihrer Firma entstehen, kommuniziert und nachgehalten werden. KI kann nur dann sinnvoll unterstützen, wenn klar ist, wer entscheidet, auf welcher Grundlage entschieden wird und was danach passiert.",
      "order": 2,
      "questions": [
        {
          "key": "entscheidungs_qualitaet.q1",
          "text": "Wie werden wichtige Entscheidungen in Ihrem Unternehmen normalerweise festgehalten?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Gar nicht — Entscheidungen werden mündlich getroffen und bleiben im Kopf", "score": 0},
            {"label": "Teilweise in E-Mails oder Chats — später schwer auffindbar", "score": 25},
            {"label": "In einzelnen Protokollen oder Dateien — aber nicht einheitlich", "score": 50},
            {"label": "In einer festen Ablage oder einem festen Format — meistens nachvollziehbar", "score": 75},
            {"label": "Systematisch mit Entscheidung, Begründung, Verantwortlichem und nächstem Schritt", "score": 100}
          ]
        },
        {
          "key": "entscheidungs_qualitaet.q2",
          "text": "Was passiert, wenn der Geschäftsführer oder die wichtigste Führungsperson zwei Wochen nicht erreichbar ist?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Viele Entscheidungen bleiben liegen", "score": 0},
            {"label": "Mitarbeiter entscheiden aus dem Bauch heraus oder fragen informell herum", "score": 25},
            {"label": "Ein Stellvertreter entscheidet einiges, aber ohne klare schriftliche Befugnisse", "score": 50},
            {"label": "Es gibt klare Vertretungsregeln für die meisten operativen Entscheidungen", "score": 75},
            {"label": "Es gibt dokumentierte Entscheidungsgrenzen, Vertretungen und Eskalationsregeln", "score": 100}
          ]
        },
        {
          "key": "entscheidungs_qualitaet.q3",
          "text": "Wie häufig prüfen Sie rückblickend, ob größere Entscheidungen die gewünschte Wirkung hatten?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Nie — wenn entschieden ist, ist das Thema erledigt", "score": 0},
            {"label": "Selten — nur wenn etwas sichtbar schiefläuft", "score": 25},
            {"label": "Gelegentlich — aber ohne festen Rhythmus", "score": 50},
            {"label": "Regelmäßig bei wichtigen Themen", "score": 75},
            {"label": "Systematisch mit Ergebnissen, Zahlen und klarer Lernschleife", "score": 100}
          ]
        },
        {
          "key": "entscheidungs_qualitaet.q4",
          "text": "Auf welcher Grundlage werden operative und strategische Entscheidungen überwiegend getroffen?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Bauchgefühl des Geschäftsführers", "score": 0},
            {"label": "Erfahrung einzelner Schlüsselpersonen", "score": 25},
            {"label": "Mischung aus Erfahrung, Zahlen und Einzelinformationen", "score": 50},
            {"label": "Überwiegend auf Basis von Zahlen, Berichten und klaren Kriterien", "score": 75},
            {"label": "Auf Basis definierter Entscheidungslogik, belastbarer Daten und dokumentierter Annahmen", "score": 100}
          ]
        }
      ],
      "comment_anchors": {
        "low": "Entscheidungen hängen noch zu stark an einzelnen Personen und mündlicher Abstimmung. KI kann in so einem Umfeld keine verlässliche Unterstützung leisten, weil die Entscheidungslogik nicht stabil genug ist.",
        "mid": "Die Entscheidungsqualität ist teilweise vorhanden, aber noch nicht konsequent dokumentiert und überprüfbar. Für KI reicht das nur in eng begrenzten Bereichen mit klaren Regeln.",
        "high": "Ihre Entscheidungsprozesse sind überwiegend nachvollziehbar. Das ist eine gute Voraussetzung, um KI nicht nur als Textwerkzeug, sondern als echte Unterstützung in Auswertung, Vorbereitung und Steuerung einzusetzen."
      }
    },
    {
      "key": "schriftliche_entscheidungen",
      "title": "Schriftlich festgehaltene Entscheidungen",
      "intro": "Dieser Baustein misst, wie viel wichtiges Wissen schriftlich verfügbar ist und wie viel nur in den Köpfen einzelner Personen steckt. Je mehr Kopf-Wissen ungesichert bleibt, desto schwerer werden Vertretung, Wachstum, Nachfolge und KI-Einsatz.",
      "order": 3,
      "questions": [
        {
          "key": "schriftliche_entscheidungen.q1",
          "text": "Stellen Sie sich vor, Ihr Geschäftsführer fällt für vier Wochen vollständig aus. Wie viel Prozent der laufenden Entscheidungen können ohne ihn getroffen werden, weil die Grundlagen schriftlich dokumentiert sind?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Unter 20% — ohne ihn bleibt vieles stehen", "score": 0},
            {"label": "20-40% — es läuft nur mit vielen Rückfragen und Improvisation", "score": 25},
            {"label": "40-60% — das Tagesgeschäft läuft halbwegs, aber holprig", "score": 50},
            {"label": "60-80% — die meisten Entscheidungen sind ausreichend vorbereitet", "score": 75},
            {"label": "Über 80% — die Firma läuft weiter, er wird nur vermisst", "score": 100}
          ]
        },
        {
          "key": "schriftliche_entscheidungen.q2",
          "text": "Wo sind Sonderregeln zu Kunden, Preisen, Konditionen, Lieferzusagen oder internen Ausnahmen dokumentiert?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Nirgends — das wissen einzelne Personen", "score": 0},
            {"label": "Verteilt in E-Mails, Chats oder persönlichen Notizen", "score": 25},
            {"label": "Teilweise in Kundenakten oder Projektunterlagen, aber nicht einheitlich", "score": 50},
            {"label": "Meistens zentral auffindbar, aber nicht immer aktuell", "score": 75},
            {"label": "Zentral, einheitlich und für berechtigte Personen nachvollziehbar", "score": 100}
          ]
        },
        {
          "key": "schriftliche_entscheidungen.q3",
          "text": "Wie gut können neue Führungskräfte oder Stellvertreter nachvollziehen, warum bestimmte Regeln, Preise, Abläufe oder Prioritäten gelten?",
          "question_type": "likert_5",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Gar nicht — sie müssten die Historie mündlich erfragen", "score": 0},
            {"label": "Eher schlecht — vieles erklärt sich nur durch alte Erfahrung", "score": 25},
            {"label": "Teils-teils — manche Dinge sind dokumentiert, andere nicht", "score": 50},
            {"label": "Eher gut — die meisten Grundlagen sind nachvollziehbar", "score": 75},
            {"label": "Sehr gut — Entscheidungen und Hintergründe sind sauber dokumentiert", "score": 100}
          ]
        },
        {
          "key": "schriftliche_entscheidungen.q4",
          "text": "Wie viele kritische Wissensbereiche gibt es in Ihrer Firma, die im Wesentlichen nur eine Person wirklich beherrscht?",
          "question_type": "numeric_bucket",
          "scale_direction": "negative",
          "score_mapping": [
            {"label": "0 Bereiche", "score": 100},
            {"label": "1-2 Bereiche", "score": 75},
            {"label": "3-5 Bereiche", "score": 50},
            {"label": "6-10 Bereiche", "score": 25},
            {"label": "Mehr als 10 Bereiche", "score": 0}
          ]
        }
      ],
      "comment_anchors": {
        "low": "Zu viel wichtiges Wissen steckt noch in Köpfen einzelner Personen. Das macht Vertretung, Übergabe und KI-Einsatz riskant, weil die Grundlagen nicht zuverlässig abrufbar sind.",
        "mid": "Ein Teil des Wissens ist dokumentiert, aber noch nicht vollständig genug, um unabhängig von Schlüsselpersonen zu funktionieren. Genau hier liegt eine der wichtigsten Hausaufgaben vor ernsthaftem KI-Einsatz.",
        "high": "Die Firma hat bereits eine solide schriftliche Wissensbasis. Dadurch kann KI später deutlich besser unterstützen, weil sie auf dokumentierte Regeln, Entscheidungen und Zusammenhänge zugreifen kann."
      }
    },
    {
      "key": "sops",
      "title": "SOPs",
      "intro": "Dieser Baustein misst, ob wiederkehrende Aufgaben nach klaren Standards laufen oder jedes Mal neu erklärt werden müssen. Ohne belastbare Standardabläufe kann KI kaum sinnvoll entlasten, weil nicht klar ist, welcher Ablauf überhaupt der richtige ist.",
      "order": 4,
      "questions": [
        {
          "key": "sops.q1",
          "text": "Wie gut sind Ihre wichtigsten Standardprozesse dokumentiert, zum Beispiel Angebotserstellung, Auftragsabwicklung, Reklamation, Rechnungsklärung oder Einarbeitung?",
          "question_type": "likert_5",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Gar nicht — jeder macht es nach Erfahrung", "score": 0},
            {"label": "Eher schlecht — es gibt einzelne Notizen, aber keine echte Prozessdokumentation", "score": 25},
            {"label": "Teils-teils — einige Abläufe sind beschrieben, andere nicht", "score": 50},
            {"label": "Eher gut — die meisten wichtigen Abläufe sind dokumentiert", "score": 75},
            {"label": "Sehr gut — die zentralen Abläufe sind klar, aktuell und auffindbar dokumentiert", "score": 100}
          ]
        },
        {
          "key": "sops.q2",
          "text": "Was bekommt ein neuer Mitarbeiter an die Hand, wenn er eine wiederkehrende Aufgabe übernehmen soll?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Mündliche Erklärung und dann ausprobieren", "score": 0},
            {"label": "Erklärung durch Kollegen plus alte Beispiele", "score": 25},
            {"label": "Einzelne Checklisten oder Vorlagen, aber nicht vollständig", "score": 50},
            {"label": "Eine dokumentierte Anleitung mit Beispielen für die meisten Aufgaben", "score": 75},
            {"label": "Eine klare SOP mit Ziel, Ablauf, Verantwortlichkeiten, Ausnahmen und Qualitätskriterien", "score": 100}
          ]
        },
        {
          "key": "sops.q3",
          "text": "Wie oft werden dokumentierte Abläufe aktualisiert, wenn sich in der Praxis etwas ändert?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Nie — Dokumente veralten einfach", "score": 0},
            {"label": "Selten — nur wenn jemand zufällig daran denkt", "score": 25},
            {"label": "Gelegentlich — aber ohne festen Verantwortlichen", "score": 50},
            {"label": "Regelmäßig — Änderungen werden meistens nachgezogen", "score": 75},
            {"label": "Systematisch — Prozessänderungen führen automatisch zur Aktualisierung der SOP", "score": 100}
          ]
        },
        {
          "key": "sops.q4",
          "text": "Wie stark unterscheiden sich die Arbeitsweisen verschiedener Mitarbeiter bei derselben Standardaufgabe?",
          "question_type": "likert_5",
          "scale_direction": "negative",
          "score_mapping": [
            {"label": "Sehr stark — jeder hat seine eigene Methode", "score": 0},
            {"label": "Eher stark — Ergebnisse hängen deutlich von der Person ab", "score": 25},
            {"label": "Mittel — es gibt grobe Gemeinsamkeiten, aber viele Varianten", "score": 50},
            {"label": "Eher gering — die meisten arbeiten ähnlich", "score": 75},
            {"label": "Sehr gering — Ablauf und Ergebnis sind weitgehend standardisiert", "score": 100}
          ]
        }
      ],
      "comment_anchors": {
        "low": "Wiederkehrende Aufgaben laufen noch zu stark nach persönlicher Erfahrung. KI würde hier keine Standards schaffen, sondern uneinheitliche Abläufe nur schneller reproduzieren.",
        "mid": "Es gibt erste Standards, aber sie sind noch nicht stabil genug für breitere Automatisierung. Für einzelne Abläufe kann KI helfen, wenn vorher klar festgelegt wird, wie der richtige Prozess aussieht.",
        "high": "Ihre Standardprozesse sind in vielen Bereichen belastbar genug dokumentiert. Das eröffnet realistische Möglichkeiten, KI gezielt bei Vorbereitung, Prüfung, Zusammenfassung oder Routinekommunikation einzusetzen."
      }
    },
    {
      "key": "unternehmerhandbuch",
      "title": "Unternehmerhandbuch",
      "intro": "Dieser Baustein misst, ob Ihre Firma als Ganzes verständlich beschrieben ist: Strategie, Struktur, Verantwortlichkeiten, Schlüsselprozesse und Spielregeln. Ein Unternehmerhandbuch ist kein Hochglanzdokument, sondern die Betriebsanleitung für das Unternehmen.",
      "order": 5,
      "questions": [
        {
          "key": "unternehmerhandbuch.q1",
          "text": "Gibt es ein zentrales Dokument oder eine zentrale Wissensbasis, die beschreibt, wie Ihre Firma grundsätzlich funktioniert?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Nein — dieses Wissen steckt vor allem im Kopf des Unternehmers", "score": 0},
            {"label": "Ansatzweise — es gibt einzelne Dokumente, aber kein Gesamtbild", "score": 25},
            {"label": "Teilweise — Struktur, Prozesse und Regeln sind verteilt dokumentiert", "score": 50},
            {"label": "Ja, weitgehend — es gibt eine zentrale Beschreibung, aber sie ist nicht vollständig oder nicht immer aktuell", "score": 75},
            {"label": "Ja — es gibt ein lebendes Unternehmerhandbuch, das regelmäßig genutzt und gepflegt wird", "score": 100}
          ]
        },
        {
          "key": "unternehmerhandbuch.q2",
          "text": "Könnte ein neuer Geschäftsführer innerhalb von vier Wochen verstehen, wie Ihre Firma wirtschaftlich, organisatorisch und operativ funktioniert?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Nein — er wäre massiv auf persönliche Erklärungen angewiesen", "score": 0},
            {"label": "Nur grob — er würde viele Zusammenhänge erst im Alltag lernen", "score": 25},
            {"label": "Teilweise — die wichtigsten Zahlen und Strukturen wären auffindbar", "score": 50},
            {"label": "Ja, größtenteils — mit Unterstützung könnte er schnell arbeitsfähig werden", "score": 75},
            {"label": "Ja — die Firma ist so dokumentiert, dass eine geordnete Übergabe realistisch ist", "score": 100}
          ]
        },
        {
          "key": "unternehmerhandbuch.q3",
          "text": "Wie gut sind Strategie, Zielkunden, Leistungsversprechen und Prioritäten schriftlich festgehalten?",
          "question_type": "likert_5",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Gar nicht — das ist eher Gefühl und Erfahrung", "score": 0},
            {"label": "Eher schlecht — einzelne Aussagen existieren, aber nichts Belastbares", "score": 25},
            {"label": "Teils-teils — manches ist beschrieben, aber nicht sauber verbunden", "score": 50},
            {"label": "Eher gut — die wichtigsten Leitplanken sind dokumentiert", "score": 75},
            {"label": "Sehr gut — Strategie, Zielgruppen, Angebot und Prioritäten sind klar dokumentiert", "score": 100}
          ]
        },
        {
          "key": "unternehmerhandbuch.q4",
          "text": "Wird vorhandene Unternehmensdokumentation im Alltag wirklich genutzt?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Nein — falls etwas existiert, liegt es nur irgendwo ab", "score": 0},
            {"label": "Selten — meistens fragt man trotzdem direkt jemanden", "score": 25},
            {"label": "Gelegentlich — einzelne Personen nutzen die Dokumente", "score": 50},
            {"label": "Regelmäßig — bei Einarbeitung, Abstimmung oder Prozessfragen", "score": 75},
            {"label": "Durchgehend — Dokumentation ist Teil der täglichen Arbeitsweise", "score": 100}
          ]
        }
      ],
      "comment_anchors": {
        "low": "Die Firma ist als Gesamtsystem noch zu wenig beschrieben. Solange Strategie, Struktur und Spielregeln vor allem im Kopf des Unternehmers liegen, bleibt KI nur punktuell einsetzbar.",
        "mid": "Es gibt bereits Bausteine eines Unternehmerhandbuchs, aber noch kein wirklich nutzbares Gesamtbild. Für Nachfolge, Skalierung und KI-Einsatz fehlt damit noch ein zentraler Orientierungsrahmen.",
        "high": "Die Firma ist als Ganzes gut genug beschrieben, um darauf aufzubauen. Ein lebendes Unternehmerhandbuch kann später zur Grundlage werden, damit KI Antworten, Analysen und Vorschläge besser am Unternehmen ausrichtet."
      }
    },
    {
      "key": "workaround_dunkelziffer",
      "title": "Workaround-Dunkelziffer",
      "intro": "Dieser Baustein misst, wie viele inoffizielle Umgehungslösungen Ihre Mitarbeiter nutzen, damit die Arbeit trotz Systemlücken weiterläuft. Workarounds sind oft praktisch, aber sie machen Prozesse unsichtbar, riskant und schwer automatisierbar.",
      "order": 6,
      "questions": [
        {
          "key": "workaround_dunkelziffer.q1",
          "text": "Wie viele Excel-Listen, private Übersichten oder Schatten-Dateien werden ungefähr außerhalb Ihrer offiziellen Systeme genutzt?",
          "question_type": "numeric_bucket",
          "scale_direction": "negative",
          "score_mapping": [
            {"label": "0 bekannte Listen oder Schatten-Dateien", "score": 100},
            {"label": "1-3 Listen", "score": 75},
            {"label": "4-10 Listen", "score": 50},
            {"label": "11-20 Listen", "score": 25},
            {"label": "Mehr als 20 Listen oder niemand weiß es genau", "score": 0}
          ]
        },
        {
          "key": "workaround_dunkelziffer.q2",
          "text": "Wie häufig werden Daten aus einem System exportiert, manuell bearbeitet und dann woanders weiterverwendet?",
          "question_type": "multiple_choice",
          "scale_direction": "negative",
          "score_mapping": [
            {"label": "Täglich in mehreren Bereichen", "score": 0},
            {"label": "Mehrmals pro Woche", "score": 25},
            {"label": "Gelegentlich bei bestimmten Auswertungen oder Sonderfällen", "score": 50},
            {"label": "Selten — nur in klar begrenzten Ausnahmefällen", "score": 75},
            {"label": "Praktisch nie — Daten bleiben in den vorgesehenen Systemen", "score": 100}
          ]
        },
        {
          "key": "workaround_dunkelziffer.q3",
          "text": "Nutzen Mitarbeiter private oder nicht offiziell geregelte Tools für geschäftliche Abläufe, zum Beispiel WhatsApp-Gruppen, private Google-Sheets, persönliche To-do-Apps oder eigene Ablagen?",
          "question_type": "multiple_choice",
          "scale_direction": "negative",
          "score_mapping": [
            {"label": "Ja, regelmäßig und in mehreren Bereichen", "score": 0},
            {"label": "Ja, vereinzelt, aber es ist bekannt und wird geduldet", "score": 25},
            {"label": "Teilweise — es gibt offizielle Tools, aber manche arbeiten daneben anders", "score": 50},
            {"label": "Selten — einzelne Ausnahmen kommen vor", "score": 75},
            {"label": "Nein — geschäftliche Abläufe laufen über freigegebene Systeme", "score": 100}
          ]
        },
        {
          "key": "workaround_dunkelziffer.q4",
          "text": "Wer hätte heute einen verlässlichen Überblick darüber, welche Workarounds im Unternehmen tatsächlich genutzt werden?",
          "question_type": "multiple_choice",
          "scale_direction": "positive",
          "score_mapping": [
            {"label": "Niemand — das würde erst auffallen, wenn jemand ausfällt", "score": 0},
            {"label": "Einzelne Mitarbeiter kennen ihre eigenen Lösungen, aber kein Gesamtbild", "score": 25},
            {"label": "Bereichsleiter kennen ungefähr die wichtigsten Workarounds", "score": 50},
            {"label": "Es gibt einen guten Überblick über die meisten Umgehungslösungen", "score": 75},
            {"label": "Workarounds werden aktiv erfasst, bewertet und entweder beseitigt oder offiziell geregelt", "score": 100}
          ]
        }
      ],
      "comment_anchors": {
        "low": "Die Workaround-Dunkelziffer ist hoch. Das bedeutet: Die offiziellen Prozesse zeigen nicht die echte Arbeitsweise, und genau das macht KI-Einsatz gefährlich, weil wichtige Abläufe unsichtbar bleiben.",
        "mid": "Es gibt spürbare Umgehungslösungen, aber sie sind nicht völlig außer Kontrolle. Bevor KI breiter eingesetzt wird, sollten die wichtigsten Schattenprozesse sichtbar gemacht und bewertet werden.",
        "high": "Die Zahl der Workarounds wirkt beherrschbar. Das ist eine gute Voraussetzung, weil KI dann eher auf reale, geregelte Abläufe trifft und nicht auf versteckte Nebenprozesse."
      }
    }
  ]$blocks$::jsonb,
  $metadata${
    "usage_kind": "self_service_partner_diagnostic",
    "required_closing_statement": "Wir sind noch nicht bereit, KI strukturiert einzusetzen. Wir haben offene Flanken, wir müssen Hausaufgaben machen. Aber wenn wir die Zeit dafür nehmen, wird KI ein echter Faktor in unserem Unternehmen sein."
  }$metadata$::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  version     = EXCLUDED.version,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

RAISE NOTICE 'MIG-037/093: template partner_diagnostic v1 seeded (24 questions, 6 blocks)';

END $mig037_step1$;
