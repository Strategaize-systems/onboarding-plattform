-- Migration 125: V10 StB-Vertikale Template-Content-Seed — M-04 (M-04-only, DEC-242)
-- SLC-170 MT-2 (FEAT-091 Content-Teil, BL-510) — DEC-233/DEC-234/DEC-242
--
-- ZIEL
-- ====
-- Idempotenter Seed EINER template-Row 'stb_modul_m04' v1.0 (Reuse bestehende
-- template-Tabelle, KEIN neues Schema). Inhalt: Fragebogen in zwei Stufen
-- (Stufe-1-Kern required=true / Stufe-2-Vertiefung required=false) + KI-Hebel-
-- Katalog (Reifegrad 1-4) in metadata. Damit ist der V10-E2E-Flow (Capture
-- SLC-173 -> Worker SLC-174 -> Reader SLC-175) mit dem Prio-A-1-Modul lauffaehig.
--
-- Content-Quelle: M-04 – Grundlegende Finanzsteuerung (GuV-Bilanz-Cash).docx
-- (26 Fragen / 13 KI-Hebel). Quell-Mapping: docs/stb-vertikale/M-04-seed-source.md.
-- NICHT in diesem Slice (DEC-242): Blueprint, M-06, restlicher 18-Cut -> SLC-170b
-- (content-gated). M-05 gestrichen.
--
-- SCHEMA-VORAUSSETZUNGEN (alle bereits live)
-- ==========================================
--   - template.metadata jsonb           (MIG-093)
--   - UNIQUE(slug, version) Index        (MIG-096, template_slug_version_unique)
--   - Block/Question-Shape               (src/lib/db/template-queries.ts:
--                                         id, key, title{de,en,nl}, order, required, weight,
--                                         questions[id, frage_id, text, ebene, unterbereich, position])
--   - template-RLS + GRANTs              (MIG-021/022 — fuer Tenant unveraendert lesbar)
--
-- IDEMPOTENZ
-- ==========
-- INSERT ... ON CONFLICT (slug, version) DO UPDATE. Zweiter Apply = 0 neue Rows,
-- Content-Update statt Insert (blocks/metadata/description/name werden ersetzt).
-- Block-/Question-UUIDs sind deterministisch (uuid5) und damit ueber Re-Applies stabil.
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/125_v10_stb_template_seed.sql
--   echo '<BASE64>' | base64 -d > /tmp/125_v10.sql
--   DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep ^supabase-db)
--   docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < /tmp/125_v10.sql
--
-- PRE-APPLY-BACKUP-PFLICHT
-- ========================
--   mkdir -p /opt/onboarding-plattform-backups
--   DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep ^supabase-db)
--   docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres \
--     --schema-only --data-only --table=public.template \
--     > /opt/onboarding-plattform-backups/pre-mig-125_$(date +%Y%m%d_%H%M%S).sql
--
-- VERIFIKATION (nach Apply)
-- =========================
--   SELECT slug, version, jsonb_array_length(blocks) AS block_count,
--          (SELECT COUNT(*) FROM jsonb_array_elements(blocks) b,
--                                jsonb_array_elements(b->'questions') q) AS question_count,
--          jsonb_array_length(metadata->'ki_hebel') AS hebel_count,
--          metadata->>'modul_key' AS modul_key
--     FROM template WHERE slug='stb_modul_m04';
--   -- erwartet: 1 Row, block_count=2, question_count=26, hebel_count=13, modul_key='m04'

DO $mig125$ BEGIN

INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m04',
  'M-04 – Grundlegende Finanzsteuerung (GuV/Bilanz/Cash)',
  '1.0',
  'M-04 Grundlegende Finanzsteuerung (GuV/Bilanz/Cash) — StB-KERN-Cut (DEC-242). Laufende Steuerung über Zahlen statt nur rückblickender Jahresabschluss: einheitliche Steuerungslogik aus GuV, Bilanz und Cash mit klaren Kennzahlen, Taktung und Reaktionsmechanik. 26 Fragen (10 Kern / 16 Vertiefung), 13 KI-Hebel (Reifegrad 1-4). Quelle: M-04-Modul-Spec.',
  $blocks$[
  {
    "id": "47f19dea-7dda-5334-b77b-168400e3a073",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen zur grundlegenden Finanzsteuerung (GuV/Bilanz/Cash).",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "36f54958-d613-5342-bb38-baa71240a085",
        "frage_id": "F-M04-001",
        "text": "Woran erkennen Sie, ob Ihr Unternehmen „gut läuft“?",
        "ebene": "Kern",
        "unterbereich": "Block D / D1 Wirtschaftliche Orientierung",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "eb4f5173-cbeb-557f-8fb9-862aa632765e",
        "frage_id": "F-M04-002",
        "text": "Welche Zahlen schauen Sie regelmäßig an?",
        "ebene": "Kern",
        "unterbereich": "Block D / D1 Wirtschaftliche Orientierung",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "c9bd641c-8aa9-512d-8fa1-fb76ffecc1ae",
        "frage_id": "F-M04-005",
        "text": "Welche eher selten – obwohl sie wichtig sein könnten?",
        "ebene": "Kern",
        "unterbereich": "Block D / D1 Wirtschaftliche Orientierung",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "76f83849-f96e-54d1-8ca4-0406249acd7f",
        "frage_id": "F-M04-003",
        "text": "Gibt es klare Kennzahlen, die Entscheidungen beeinflussen?",
        "ebene": "Kern",
        "unterbereich": "Block D / D2 Steuerungslogik",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "36df78ee-09bd-598e-b9a9-5d2c95f78943",
        "frage_id": "F-M04-004",
        "text": "Oder reagieren Sie überwiegend auf Kontostand, Bauchgefühl oder Probleme?",
        "ebene": "Kern",
        "unterbereich": "Block D / D2 Steuerungslogik",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "337cd0a2-ff9b-55c9-8fe8-e1e16e774cba",
        "frage_id": "F-M04-008",
        "text": "Wer ist heute verantwortlich für: Monatsabschluss, Reporting, Interpretation und Maßnahmen-Tracking?",
        "ebene": "Kern",
        "unterbereich": "Block D / D3 Rollen & Taktung",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "e562161a-4b8f-53fe-99f9-89c5fb47334f",
        "frage_id": "F-M04-009",
        "text": "Wie schnell liegen Monatszahlen nach Monatsende vor (inkl. kurzer Kommentierung der Abweichungen)?",
        "ebene": "Kern",
        "unterbereich": "Block D / D3 Rollen & Taktung",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "01ad7e66-2493-5d70-9eac-09b5bad2eefd",
        "frage_id": "F-M04-010",
        "text": "Welche 3–5 Bilanz-/Cash-Treiber schauen Sie aktiv an (z. B. Forderungen, Lager, Anzahlungen, Investitionen)?",
        "ebene": "Kern",
        "unterbereich": "Block D / D4 GuV–Bilanz–Cash",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "b4720c93-1bc0-5582-9d89-87754e4a1971",
        "frage_id": "F-M04-011",
        "text": "Gibt es einen Plan/Budget und einen rollierenden Forecast – und wird darauf aktiv gesteuert?",
        "ebene": "Kern",
        "unterbereich": "Block D / D5 Planung & Forecast",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "af75a571-46e5-5593-97c6-d01d93560897",
        "frage_id": "F-M04-012",
        "text": "Was passiert konkret, wenn Kennzahlen vom Plan abweichen (wer entscheidet was bis wann)?",
        "ebene": "Kern",
        "unterbereich": "Block D / D5 Planung & Forecast",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "1e048d46-d873-5e01-b60c-923152dd1e89",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-Dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen (Workspace-Ebene) zu Prozess, GuV-Bilanz-Cash, Forecast, Systemen und Szenarien.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "0c9cd76a-b96a-5f5c-8cc7-6768b4ac40e5",
        "frage_id": "F-M04-006",
        "text": "Verstehen Sie selbst jederzeit, wo Geld verdient wird – und wo nicht?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D4 Transparenz & Verständnis",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "431ccf33-8a4e-54d1-bf32-e6cb6ed6c716",
        "frage_id": "F-M04-007",
        "text": "Könnten zentrale Mitarbeiter diese Logik erklären?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D4 Transparenz & Verständnis",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5f62c357-f08b-582e-b47c-05e2776bb494",
        "frage_id": "F-M04-013",
        "text": "Wie sieht Ihr Monatsabschluss-Prozess konkret aus (Schritte, Verantwortliche, Zeitplan, typische Verzögerungen)?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D3 Rollen & Taktung",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3627bd8b-65ea-580b-8987-b3b771f476f5",
        "frage_id": "F-M04-014",
        "text": "Welche Qualitätssicherungen gibt es im Reporting (Plausibilitäten, Abstimmungen, „eine Version der Wahrheit“)?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D3 Rollen & Taktung",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "53084789-dc27-524c-bfc7-242db12acaa6",
        "frage_id": "F-M04-015",
        "text": "Welche Kennzahlen haben definierte Schwellenwerte/Trigger (Ampel), und welche Standardmaßnahmen sind daran gekoppelt?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D2 Steuerungslogik",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "c09b80f8-a21e-55b7-a2ec-aa1b13f6cdfd",
        "frage_id": "F-M04-016",
        "text": "Wie erklären Sie den Zusammenhang zwischen Ergebnis, Bilanzveränderungen und Cashflow an einem typischen Monat?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D4 GuV–Bilanz–Cash",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "42e8391d-d7f6-5789-82c8-030681076eab",
        "frage_id": "F-M04-017",
        "text": "Welche Posten in der Bilanz verursachen bei Ihnen typischerweise Cash-Bindung oder Cash-Freisetzung (Forderungen, Lager, Anzahlungen, Projekte)?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D4 GuV–Bilanz–Cash",
        "position": 17,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3f56aa85-c55d-5e34-ba1b-0a1a8030b5b9",
        "frage_id": "F-M04-018",
        "text": "Wie werden Investitionen geplant, freigegeben und in der Steuerung nachgehalten (Business Case, Payback, Budgettreue)?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D4 GuV–Bilanz–Cash",
        "position": 18,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "4f1ee360-f13e-5269-940b-6211e3e14e42",
        "frage_id": "F-M04-019",
        "text": "Wie wird der Forecast erstellt (Top-down/Bottom-up), wie oft aktualisiert, und welche Annahmen werden dokumentiert?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D5 Planung & Forecast",
        "position": 19,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "408d2c51-dc26-5d32-8cab-842b1d607fe2",
        "frage_id": "F-M04-020",
        "text": "Wie machen Sie Abweichungsanalysen (Preis/Menge/Mix, Kostenblöcke, Sondereffekte) – und wer liefert die Ursachen?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D5 Planung & Forecast",
        "position": 20,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "329eb256-6235-5be7-a01f-73e36dc538c3",
        "frage_id": "F-M04-021",
        "text": "Welche Systeme/Dateien sind die Basis für Ihre Zahlen (FiBu, Warenwirtschaft, Zeiterfassung, Projekte, CRM) und wo entstehen Medienbrüche?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D6 Systeme & Daten",
        "position": 21,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "cb512d81-9105-5d00-9d57-a5c1d1a258fa",
        "frage_id": "F-M04-022",
        "text": "Wo sind Definitionen geregelt (z. B. Umsatz, DB, Projektfortschritt) und wie stellen Sie Konsistenz sicher?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D6 Systeme & Daten",
        "position": 22,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2c0f3b74-5c5e-5392-890b-374ea12ef7c6",
        "frage_id": "F-M04-023",
        "text": "Welche Steuerungsmeetings gibt es (Frequenz, Agenda, Teilnehmer) und wie wird Maßnahmen-Tracking verbindlich gemacht?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D3 Steuerungsmeetings",
        "position": 23,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "f79d241f-1b5e-57fe-b14e-cae0aa3dda20",
        "frage_id": "F-M04-024",
        "text": "Welche Frühindikatoren nutzen Sie zusätzlich zu Finanzzahlen (Auftragseingang, Pipeline, Reklamationen, Auslastung, Krankstand, Kundenrisiken)?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D5 Frühindikatoren",
        "position": 24,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "46edba06-32c0-5c26-b042-b9e7a44c9445",
        "frage_id": "F-M04-025",
        "text": "Welche 2–3 Szenarien rechnen Sie regelmäßig durch (z. B. -10% Umsatz, Kunde X fällt aus, Lohnkosten +5%) und welche Maßnahmen wären vorbereitet?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D7 Szenarien",
        "position": 25,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "171f9099-2b64-5339-881c-6e4246bd2728",
        "frage_id": "F-M04-026",
        "text": "Wo hakt es im Führungsteam beim Zahlenverständnis – und welcher Standard würde helfen (z. B. 60-Minuten-Finanz-„Grundkurs“)?",
        "ebene": "Workspace",
        "unterbereich": "Block D / D6 Finance Literacy",
        "position": 26,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  }
]$blocks$::jsonb,
  $metadata${
  "modul_id": "M-04",
  "modul_key": "m04",
  "modul_kategorie": "Finanzen & Controlling",
  "output_contract": {
    "kinds": [
      "entscheidung",
      "standard",
      "implementierungsschritt"
    ],
    "ki_hebel_kind": "ki_hebel",
    "reifegrad_range": [
      1,
      4
    ],
    "beschreibung": "Aus den M-04-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "2.1",
      "name": "Wirtschaftliche Orientierung",
      "unterpunkte": [
        "Was bedeutet „gut laufen“ in Zahlen (Wachstum, Marge, Cash, Stabilität)",
        "Regelmäßige Sicht auf Kernzahlen (Taktung, Fokus, Verantwortliche)",
        "„Blinde Flecken“: wichtige Zahlen, die selten betrachtet werden"
      ]
    },
    {
      "key": "2.2",
      "name": "Steuerungslogik & Entscheidungsnutzung",
      "unterpunkte": [
        "Kennzahlen-Set mit Entscheidungsrelevanz (Trigger/Schwellenwerte)",
        "Proaktiv vs. reaktiv (Bauchgefühl, Kontostand, Problemsteuerung)",
        "Maßnahmen- und Eskalationslogik (wer entscheidet, bis wann, mit welchem Effekt)"
      ]
    },
    {
      "key": "2.3",
      "name": "Reporting-Prozess, Rollen & Taktung",
      "unterpunkte": [
        "Rollen: Erstellung, Prüfung, Interpretation, Freigabe",
        "Monatsabschluss/Closing: Ablauf, Termine, Qualitätssicherung",
        "Steuerungsmeetings: Agenda, Frequenz, Protokoll, Maßnahmen-Tracking"
      ]
    },
    {
      "key": "2.4",
      "name": "GuV, Bilanz & Cash als Steuerungsdreieck",
      "unterpunkte": [
        "GuV-Logik: Umsatz, Rohertrag/DB, Overhead, Ergebnis, Sondereffekte",
        "Bilanztreiber: Forderungen, Verbindlichkeiten, Lager, Anzahlungen, Investitionen",
        "Cashflow-Verständnis: Ergebnis ≠ Cash; Brücke über Working Capital/Investitionen"
      ]
    },
    {
      "key": "2.5",
      "name": "Planung, Forecast & Abweichungsmanagement",
      "unterpunkte": [
        "Plan-/Budget-Logik und Aktualisierung (rolling Forecast)",
        "Abweichungsanalyse & Ursachen (Preis/Menge, Kosten, Produktmix)",
        "Frühindikatoren und Risikofrüherkennung im Cockpit"
      ]
    },
    {
      "key": "2.6",
      "name": "Systeme, Datenqualität & Finance Literacy",
      "unterpunkte": [
        "Datenquellen/Tools (FiBu, Controlling, BI, Excel), Single Source of Truth",
        "Definitionen, Datenqualität, Zugriffsrechte",
        "Befähigung: Zahlenverständnis im Führungskreis (kurzer Standard)"
      ]
    },
    {
      "key": "2.7",
      "name": "Szenarien & Steuerungshebel",
      "unterpunkte": [
        "Szenario-/Sensitivitätsrechnungen (Umsatz, Preis, Lohn, Energie, Kunde X)",
        "Maßnahmenbibliothek: Kostenhebel, Preishebel, Working-Capital-Hebel"
      ]
    }
  ],
  "dod": "Monatszahlen liegen binnen X Tagen vor, werden in einem fixen Meeting besprochen, Maßnahmen werden getrackt, und die wesentlichen Cash-Treiber sind transparent und steuerbar.",
  "output_artefakte": [
    "KPI-Set inkl. Schwellenwerten (Ampellogik) für Ergebnis, Bilanztreiber und Cash",
    "Monatsabschluss-Taktung inkl. Rollen/Verantwortlichkeiten und Qualitätschecks",
    "Standard-Monatsreport (1 Seite) inkl. Kommentierung und Maßnahmenliste",
    "Cashflow-Brücke „Ergebnis → Cash“ als Standard (Working-Capital-/Investitions-Treiber)",
    "Forecast-Routine (rolling) inkl. Abweichungslogik und Entscheidungstriggern"
  ],
  "symptome": [
    "Ergebnis gut, aber Cash schlecht / Kontostand überraschend niedrig.",
    "Monatszahlen kommen zu spät, werden angezweifelt oder nicht genutzt.",
    "Entscheidungen entstehen nach Kontostand, Bauchgefühl oder akutem Problem."
  ],
  "abgrenzung": "Ersetzt weder Steuerberater noch ein vollständiges Controlling-Setup, sondern etabliert eine verlässliche Steuerungsroutine. Schnittstellen: M-06 Liquidität, M-07 KPI-Set, M-36/M-38 Systeme/IT-Sicherheit.",
  "ki_hebel": [
    {
      "hebel_id": "H-M04-001",
      "name": "Monatsreport-Autokommentar",
      "beschreibung": "KI erzeugt aus GuV/Bilanz/Cash plus Plan/Ist eine Management-Zusammenfassung (Abweichungen, Ursachenhypothesen, Risiken, Maßnahmen).",
      "reifegrad": 2,
      "referenz": "2.3/2.5; F-M04-009, F-M04-020"
    },
    {
      "hebel_id": "H-M04-002",
      "name": "KPI-Cockpit mit Ampellogik",
      "beschreibung": "Dashboard mit Schwellenwerten/Triggern und Standardreaktionen, um Bauchgefühl durch definierte Steuerungslogik zu ersetzen.",
      "reifegrad": 2,
      "referenz": "2.2; F-M04-003, F-M04-012, F-M04-015"
    },
    {
      "hebel_id": "H-M04-003",
      "name": "Closing-Workflow & Checkliste",
      "beschreibung": "Automatisierter Monatsabschluss-Workflow (Owner, Deadlines, Eskalation) zur Verkürzung der Time-to-Report.",
      "reifegrad": 1,
      "referenz": "2.3; F-M04-009, F-M04-013"
    },
    {
      "hebel_id": "H-M04-004",
      "name": "Cashflow-Brücke Ergebnis→Cash",
      "beschreibung": "Standard-Report, der Ergebnis in Cash über Bilanztreiber/Working Capital übersetzt (verständlich für Führung).",
      "reifegrad": 2,
      "referenz": "2.4; F-M04-010, F-M04-016, F-M04-017"
    },
    {
      "hebel_id": "H-M04-005",
      "name": "Abweichungsanalyse-Assistent",
      "beschreibung": "KI leitet durch Preis/Menge/Mix- und Kostenursachen, dokumentiert Annahmen und leitet Maßnahmen ab.",
      "reifegrad": 2,
      "referenz": "2.5; F-M04-020"
    },
    {
      "hebel_id": "H-M04-006",
      "name": "Datenqualitäts-Checks vor Reporting",
      "beschreibung": "Automatische Plausibilitäten/Ausreißerprüfungen, Abstimmregeln und „eine Version der Wahrheit“ vor Freigabe.",
      "reifegrad": 2,
      "referenz": "2.6; F-M04-014, F-M04-022"
    },
    {
      "hebel_id": "H-M04-007",
      "name": "Meeting-Protokoll & Maßnahmen-Tracking",
      "beschreibung": "KI erstellt Protokolle, extrahiert Entscheidungen/Maßnahmen, weist Owner/Termine zu und erinnert.",
      "reifegrad": 1,
      "referenz": "2.3/2.2; F-M04-012, F-M04-023"
    },
    {
      "hebel_id": "H-M04-008",
      "name": "Finance-Literacy Micro-Learning",
      "beschreibung": "Kurze Lernbausteine zu GuV/Bilanz/Cash auf Basis eigener Begriffe/Kennzahlen, für Führungskräfte.",
      "reifegrad": 2,
      "referenz": "2.6; F-M04-026"
    },
    {
      "hebel_id": "H-M04-009",
      "name": "Rolling-Forecast-Agent",
      "beschreibung": "Agent sammelt Annahmen aus Bereichen, prüft Konsistenz, aktualisiert Forecast, erklärt Abweichungen.",
      "reifegrad": 3,
      "referenz": "2.5; F-M04-011, F-M04-019"
    },
    {
      "hebel_id": "H-M04-010",
      "name": "Treiberbasierte Szenario-Simulation",
      "beschreibung": "Modelliert Treiber (Umsatz/Preis/Kosten/Working Capital) und rechnet Szenarien inkl. Maßnahmenpaketen.",
      "reifegrad": 3,
      "referenz": "2.7; F-M04-025"
    },
    {
      "hebel_id": "H-M04-011",
      "name": "Maßnahmen-Wirkungsnachweis",
      "beschreibung": "System verknüpft Maßnahmen mit Kennzahlenwirkungen (vorher/nachher) und lernt effektive Hebel.",
      "reifegrad": 4,
      "referenz": "2.2/2.5; F-M04-012, F-M04-020"
    },
    {
      "hebel_id": "H-M04-012",
      "name": "Single Source of Truth Finance+Operativ",
      "beschreibung": "Konsolidierter Datenlayer/BI verbindet FiBu, Projekte, Wawi, Zeit; reduziert Excel-Fehler und Medienbrüche.",
      "reifegrad": 4,
      "referenz": "2.6; F-M04-021, F-M04-022"
    },
    {
      "hebel_id": "H-M04-013",
      "name": "Risiko-Frühwarnsystem (Anomalien)",
      "beschreibung": "Erkennt Muster (Forderungsalterung, Margenerosion, Projektverzug) und eskaliert mit Handlungsvorschlägen.",
      "reifegrad": 4,
      "referenz": "2.5/2.4; F-M04-024, F-M04-017"
    }
  ],
  "source_ref": "M-04 – Grundlegende Finanzsteuerung (GuV-Bilanz-Cash).docx; Mapping: docs/stb-vertikale/M-04-seed-source.md"
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

RAISE NOTICE 'MIG-125: template stb_modul_m04 v1.0 seeded (26 questions [10 Kern / 16 Workspace], 13 KI-Hebel)';

END $mig125$;
