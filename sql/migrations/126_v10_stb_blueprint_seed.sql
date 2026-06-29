-- Migration 126: V10 StB-Vertikale Kanzlei-Blueprint-Seed — stb_blueprint_kanzlei v1.0
-- SLC-170b Welle 1 (FEAT-092 Blueprint, BL-519) — DEC-234 / DEC-242 / DEC-244
--
-- ZIEL
-- ====
-- Idempotenter Seed EINER template-Row 'stb_blueprint_kanzlei' v1.0 (Reuse bestehende
-- template-Tabelle + diagnosis_schema/diagnosis_prompt aus MIG-051, KEIN neues Schema).
-- Der Blueprint ist der Gratis-Test-Einstieg: Capture (2 Stufen) -> Diagnose (Ampel/
-- Reifegrad/Empfehlung je Unterthema, A–G) -> Routing auf die 17 Kern-Fachmodule.
-- KEIN ki_hebel / output_contract (Triple liefern die Fachmodule, M-04 ff.).
--
-- Content-Quelle: docs/stb-vertikale/M-BP-seed-source.md (4 Bausteine, abgenommen 2026-06-23).
-- Deterministisch erzeugt: docs/stb-vertikale/gen-mig126-blueprint-seed.py
--   uuid5(NAMESPACE_URL, "strategaize/template/stb_blueprint_kanzlei/<kind>/<id>")
--   -> NS enthaelt den Slug -> F-BP-IDs distinkt von exit_readiness (M-BP §7.2).
--
-- SCHEMA-VORAUSSETZUNGEN (alle bereits live)
-- ==========================================
--   - template.metadata jsonb                       (MIG-093)
--   - template.diagnosis_schema/diagnosis_prompt     (MIG-051)
--   - UNIQUE(slug, version) Index                    (MIG-096, template_slug_version_unique)
--   - Block/Question-Shape                           (src/lib/db/template-queries.ts)
--   - template-RLS + GRANTs                          (MIG-021/022)
--
-- BUILD-FLAGS fuer SLC-172 (M-BP §5a/§7 — NICHT dieser Seed):
--   (1) Capture-Bloecke (stufe1_kern/stufe2_vertiefung, 2) != Diagnose-Bloecke (A–G, 7).
--       Die Diagnose-Engine iteriert heute pro Capture-block_key -> diagnosis_schema.blocks[key].
--       Die A–G-Reconciliation (Capture -> Diagnose-Block-Mapping) ist SLC-172-Wiring.
--   (2) Reifegrad: Engine-Skala 0–10 beibehalten (renderer-/normalize-kompatibel); die
--       4 Kanzlei-Stufen (1–4) sind im diagnosis_prompt auf 0–10 gemappt (Founder: Bedeutung,
--       nicht Zahlen-Skala).
--   (3) modul_key='bp' passt NICHT in die ^m\d{2}$-/stb_modul_-Konvention der Fachmodule
--       (modul-capture.ts). Eigener Blueprint-Capture+Diagnose-Pfad (wie exit_readiness).
--   (4) metadata.routing[] wird in SLC-172 MT-2 gelesen (deterministisches Modul-Routing).
--
-- IDEMPOTENZ
-- ==========
-- INSERT ... ON CONFLICT (slug, version) DO UPDATE. Zweiter Apply = 0 neue Rows,
-- Content-Update statt Insert. Block-/Question-UUIDs deterministisch (uuid5) -> stabil.
--
-- APPLY-PATTERN (sql-migration-hetzner.md)
-- ========================================
--   base64 -w 0 sql/migrations/126_v10_stb_blueprint_seed.sql
--   echo '<BASE64>' | base64 -d > /tmp/126_v10.sql
--   DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep ^supabase-db)
--   docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < /tmp/126_v10.sql
--
-- VERIFIKATION (nach Apply)
-- =========================
--   SELECT slug, version, jsonb_array_length(blocks) AS block_count,
--          (SELECT COUNT(*) FROM jsonb_array_elements(blocks) b,
--                                jsonb_array_elements(b->'questions') q) AS question_count,
--          (SELECT COUNT(*) FROM jsonb_object_keys(diagnosis_schema->'blocks')) AS diag_blocks,
--          metadata->>'modul_key' AS modul_key,
--          jsonb_array_length(metadata->'routing') AS routing_count
--     FROM template WHERE slug='stb_blueprint_kanzlei';
--   -- erwartet: 1 Row, block_count=2, question_count=20, diag_blocks=7, modul_key='bp', routing_count=13

DO $mig126$ BEGIN

INSERT INTO public.template (slug, name, version, description, blocks, metadata, diagnosis_schema, diagnosis_prompt)
VALUES (
  'stb_blueprint_kanzlei',
  'Kanzlei-Blueprint – Standortbestimmung & Routing',
  '1.0',
  'Kanzlei-Blueprint (Diagnostik + Routing) für die StB-Vertikale — der Gratis-Test-Einstieg. Liefert Standortbestimmung (Ampel/Reifegrad/Empfehlung je Unterthema) über die ganze Kanzlei + deterministisches Routing auf die 17 Kern-Fachmodule; KEIN Liefer-Triple/KI-Hebel-Katalog (das liefern die Fachmodule, M-04 ff.). 20 Fragen (15 Kern / 5 Vertiefung), 7 Diagnose-Blöcke (A–G) / 13 Unterthemen, 13 Routing-Ziele. Quelle: M-BP-seed-source.md (DEC-234 / DEC-244).',
  $blocks$[
  {
    "id": "19b90b19-00de-59fa-a951-f17c5409480a",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen zur Kanzlei-Standortbestimmung (der Gratis-Test, ~15–20 Min, KI-Capture mit Rückfragen/Voice).",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "1faa6e96-a652-5ead-b0d5-29a8f32f59b7",
        "frage_id": "F-BP-001",
        "text": "Welche Zahlen Ihrer eigenen Kanzlei (nicht die Ihrer Mandanten) schauen Sie regelmäßig an — und woran erkennen Sie daran, ob die Kanzlei wirtschaftlich gut läuft?",
        "ebene": "Kern",
        "unterbereich": "a1_selbststeuerung",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "c71bf58a-0bb6-5f6a-a766-9d6297eb992a",
        "frage_id": "F-BP-002",
        "text": "Verstehen Sie, wie diese Zahlen zustande kommen — welche Treiber, Leistungen und Prozesse in Ihrer Kanzlei dahinterstehen?",
        "ebene": "Kern",
        "unterbereich": "a1_selbststeuerung",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2890c934-a240-5de2-ae4c-7962787dd822",
        "frage_id": "F-BP-003",
        "text": "Wissen Sie, an welchen konkreten Stellschrauben Sie drehen können, um diese Zahlen aktiv zu verbessern — und steuern Sie heute tatsächlich danach, oder läuft es nebenher mit?",
        "ebene": "Kern",
        "unterbereich": "a1_selbststeuerung",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "94ad9a70-2be0-562c-86a8-587d26ba33fe",
        "frage_id": "F-BP-004",
        "text": "Wie verteilt sich Ihr Honorarumsatz zwischen Pflicht-Compliance (FiBu, Lohn, Abschluss, Erklärung) und echter betriebswirtschaftlicher Beratung — und wie viel der Beratung rechnen Sie separat ab?",
        "ebene": "Kern",
        "unterbereich": "a2_erloesmix_marge",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "bae27b26-be4d-5fd5-9751-960715fc233b",
        "frage_id": "F-BP-005",
        "text": "Wie viele Stellen haben Sie in den letzten 12 Monaten gesucht, wie viele tatsächlich besetzt — und mussten Sie deshalb schon Mandate ablehnen oder abgeben?",
        "ebene": "Kern",
        "unterbereich": "b1_personalengpass",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3ce4a08b-df67-514c-8be3-2cc347771b1e",
        "frage_id": "F-BP-006",
        "text": "Wenn Ihre erfahrenste Fachkraft morgen kündigt — wie viel kritisches Mandantenwissen ginge verloren, und wie lange braucht eine neue Kraft bei Ihnen bis zur Eigenständigkeit?",
        "ebene": "Kern",
        "unterbereich": "b2_bindung_wissen",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "812a6734-979b-5e23-a0a6-39c4d477062d",
        "frage_id": "F-BP-007",
        "text": "Was erwarten Ihre Mandanten heute von Ihnen, das über die reine Steuer-/Compliance-Pflicht hinausgeht — und wie gut können Sie diese Erwartung aktuell bedienen?",
        "ebene": "Kern",
        "unterbereich": "c1_beratungsverschiebung",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "8570e488-65e7-5be0-b605-89594ec0f3be",
        "frage_id": "F-BP-008",
        "text": "Wenn ein Wunschmandant Sie mit drei anderen Kanzleien vergleicht — was ist der eine Grund, warum er Sie nimmt, der nicht „Preis“ oder „Nähe“ ist?",
        "ebene": "Kern",
        "unterbereich": "c2_positionierung",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3fbdfa05-2321-5e26-87a2-bf507e1b7bc6",
        "frage_id": "F-BP-009",
        "text": "Wo setzen Sie KI in Ihrer Kanzlei heute produktiv ein — nur zum Recherchieren, oder auch in FiBu/Belegverarbeitung/Mandantenkommunikation — und bei welchem Anteil Ihrer Mandate?",
        "ebene": "Kern",
        "unterbereich": "d1_ki_einsatz",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "cb8e51a3-96b7-52b4-947a-73900652d492",
        "frage_id": "F-BP-010",
        "text": "Kennen Sie Ihre digitale Belegquote, haben Sie einen Plan für die DATEV-Cloud-Umstellung ab Herbst 2026 — und eine klare Regel, welche KI-Tools mit Mandantenbezug erlaubt sind?",
        "ebene": "Kern",
        "unterbereich": "d2_systemlandschaft",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7d9c014e-6acc-58e7-8abb-9991877afdf8",
        "frage_id": "F-BP-011",
        "text": "Wie viele Ihrer wiederkehrenden Kernprozesse (Jahresabschluss, Fristen, Mandanten-Onboarding) laufen dokumentiert und identisch — egal wer sie ausführt — und wo findet ein Neuer an Tag 1 „wie machen wir das hier“?",
        "ebene": "Kern",
        "unterbereich": "e1_prozesse_wissen",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "c20e439f-6dab-521a-9eb2-e7508cb0a3ce",
        "frage_id": "F-BP-012",
        "text": "Für welche Schlüsselrollen — Sie selbst eingeschlossen — gibt es eine eingearbeitete Stellvertretung, und wie ist Ihr Fristen-/Posteingangsprozess gegen Ausfall abgesichert?",
        "ebene": "Kern",
        "unterbereich": "e2_stellvertretung_fristen",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "8c635521-d3f5-5ea9-9d35-56e2b7eab9b9",
        "frage_id": "F-BP-013",
        "text": "Welcher Anteil Ihrer Mandate würde bei Ihrem Ausscheiden zu Ihnen persönlich halten statt zur Kanzlei — und bei welchen Ihrer größten Mandate sind ausschließlich Sie auskunftsfähig?",
        "ebene": "Kern",
        "unterbereich": "f1_inhaberabhaengigkeit",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3f0a1888-1599-5fb3-a14f-9bc1a9626adc",
        "frage_id": "F-BP-014",
        "text": "Welche konkrete Nachfolge-Strategie haben Sie (interne Nachfolge, Verkauf, Zusammenschluss), in welchem Zeithorizont — und welche drei Faktoren würden heute Ihren Übergabewert am stärksten drücken?",
        "ebene": "Kern",
        "unterbereich": "f2_nachfolge",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "032ce788-b22f-5901-8542-33a18222c8a9",
        "frage_id": "F-BP-015",
        "text": "Die Branche konsolidiert (PE-Aufkäufe, Plattform-Kanzleien) bei gleichzeitigem KI-Umbruch — wo sehen Sie Ihre Kanzlei in 5 Jahren: übergabe-/aufkauffähig, spezialisiert-unabhängig, oder vom Wandel überrollt?",
        "ebene": "Kern",
        "unterbereich": "g1_zukunftsstandort",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "70438f09-7582-5e9e-b514-e948d6ddf20e",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-Dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen (nicht Teil des automatischen 15-Fragen-Pfads; adaptiv bei Ampel gelb/rot der gekoppelten Kern-Frage, V1-Fallback optionaler Block).",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "d6939e9c-a649-5bab-a64b-cb0094f0d35f",
        "frage_id": "F-BP-016",
        "text": "Wie viel Prozent Ihres Honorarpotenzials lassen Sie schätzungsweise liegen (Pro-bono-Drift, vergessene Mehrleistungen) — und was passiert mit Ihrem Umsatz, wenn KI Ihre FiBu-Zeit halbiert?",
        "ebene": "Vertiefung",
        "unterbereich": "a2_erloesmix_marge",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "d360d3c1-dad7-52dd-b084-6bcc8cd59359",
        "frage_id": "F-BP-017",
        "text": "Wie hat sich Ihr Personalkostenanteil am Umsatz in den letzten 3–5 Jahren entwickelt — und welcher Anteil Ihrer und der Teamzeit geht ins reine Tagesgeschäft statt in höherwertige Beratung?",
        "ebene": "Vertiefung",
        "unterbereich": "b1_personalengpass",
        "position": 17,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7efca10b-7bc2-5474-8a10-8b80f21ba38c",
        "frage_id": "F-BP-018",
        "text": "Bei welchem Anteil Ihrer Mandanten sprechen Sie aktiv über betriebswirtschaftliche Themen statt nur Pflicht-Compliance — und wer beginnt dieses Gespräch, Sie oder der Mandant?",
        "ebene": "Vertiefung",
        "unterbereich": "c1_beratungsverschiebung",
        "position": 18,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "b6d7c43e-facc-56cf-92c0-101dae2d4daf",
        "frage_id": "F-BP-019",
        "text": "Welcher Anteil Ihrer Mandanten liefert Belege noch analog / mit Medienbruch — und wo erfassen Sie mangels Schnittstelle doppelt?",
        "ebene": "Vertiefung",
        "unterbereich": "d1_ki_einsatz",
        "position": 19,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5aa83271-d206-5cd4-b5f2-1247ee8afa9d",
        "frage_id": "F-BP-020",
        "text": "Was würde konkret mit Ihren drei größten Mandaten passieren, wenn Sie drei Monate ungeplant ausfielen — wer könnte einspringen, und woran würde der Mandant es merken?",
        "ebene": "Vertiefung",
        "unterbereich": "f1_inhaberabhaengigkeit",
        "position": 20,
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
  "modul_id": "M-BP",
  "modul_key": "bp",
  "modul_kategorie": "Führung & Struktur / Blueprint",
  "modul_marker": "diagnostic",
  "themenmodell": [
    {
      "key": "A",
      "name": "Kanzlei-Steuerung & Geschäftsmodell",
      "unterpunkte": [
        "Eigene Kanzlei-Steuerung (Zahlen kennen → verstehen → beeinflussen)",
        "Erlös-Mix & Marge (Compliance vs. Beratung, Honorar-Leckage)"
      ]
    },
    {
      "key": "B",
      "name": "Personal & Kapazität",
      "unterpunkte": [
        "Stellenbesetzung & Auslastungsgrenze",
        "Mitarbeiterbindung & Einarbeitung"
      ]
    },
    {
      "key": "C",
      "name": "Mandanten-Erwartung & Beratung",
      "unterpunkte": [
        "Beratung statt nur Compliance (geänderte Mandanten-Erwartung)",
        "Positionierung & Mandantengewinnung"
      ]
    },
    {
      "key": "D",
      "name": "KI- & Digital-Readiness",
      "unterpunkte": [
        "KI-Einsatz & Prozess-Automatisierung",
        "Systemlandschaft & Datensicherheit (DATEV-Cloud, §203, Belegquote)"
      ]
    },
    {
      "key": "E",
      "name": "Prozesse, Wissen & Ausfallsicherheit",
      "unterpunkte": [
        "Standardprozesse & Wissensplattform (Bus-Faktor)",
        "Stellvertretung, Fristen & Ausfallrisiko"
      ]
    },
    {
      "key": "F",
      "name": "Nachfolge & Übergabefähigkeit",
      "unterpunkte": [
        "Inhaberabhängigkeit & Mandatsbindung",
        "Nachfolge-Strategie & Übergabewert"
      ]
    },
    {
      "key": "G",
      "name": "Zukunfts-Standort",
      "unterpunkte": [
        "Strategische Position im Strukturwandel (Konsolidierungs-Exposure)"
      ]
    }
  ],
  "routing": [
    {
      "block": "A",
      "subtopic": "a1_selbststeuerung",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m07",
      "secondary_modul_key": "m06"
    },
    {
      "block": "A",
      "subtopic": "a2_erloesmix_marge",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m01",
      "secondary_modul_key": "m04"
    },
    {
      "block": "B",
      "subtopic": "b1_personalengpass",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m26",
      "secondary_modul_key": "m27"
    },
    {
      "block": "B",
      "subtopic": "b2_bindung_wissen",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m28",
      "secondary_modul_key": "m27"
    },
    {
      "block": "C",
      "subtopic": "c1_beratungsverschiebung",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m08",
      "secondary_modul_key": "m15"
    },
    {
      "block": "C",
      "subtopic": "c2_positionierung",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m15",
      "secondary_modul_key": "m16"
    },
    {
      "block": "D",
      "subtopic": "d1_ki_einsatz",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m36",
      "secondary_modul_key": "m07"
    },
    {
      "block": "D",
      "subtopic": "d2_systemlandschaft",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m38",
      "secondary_modul_key": "m36"
    },
    {
      "block": "E",
      "subtopic": "e1_prozesse_wissen",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m39",
      "secondary_modul_key": "m02"
    },
    {
      "block": "E",
      "subtopic": "e2_stellvertretung_fristen",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m02",
      "secondary_modul_key": "m28"
    },
    {
      "block": "F",
      "subtopic": "f1_inhaberabhaengigkeit",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m42",
      "secondary_modul_key": "m03"
    },
    {
      "block": "F",
      "subtopic": "f2_nachfolge",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m35",
      "secondary_modul_key": "m01"
    },
    {
      "block": "G",
      "subtopic": "g1_zukunftsstandort",
      "activate_when": {
        "ampel": [
          "yellow",
          "red"
        ]
      },
      "primary_modul_key": "m01",
      "secondary_modul_key": "m42"
    }
  ],
  "source_ref": "M-BP Seed-Source: docs/stb-vertikale/M-BP-seed-source.md (v1.0). IP-Quelle (DEC-234, neuer StB-Inhalt): docs/STB_VERTIKALE_KANZLEI_PAINS_2026-06-23.md + docs/STB_VERTIKALE_ZUKUNFT_BRANCHE_2026-06-23.md. Generator: docs/stb-vertikale/gen-mig126-blueprint-seed.py."
}$metadata$::jsonb,
  $dschema${
  "blocks": {
    "A": {
      "subtopics": [
        {
          "key": "a1_selbststeuerung",
          "name": "Eigene Kanzlei-Steuerung (Zahlen kennen → verstehen → beeinflussen)",
          "question_keys": [
            "F-BP-001",
            "F-BP-002",
            "F-BP-003"
          ]
        },
        {
          "key": "a2_erloesmix_marge",
          "name": "Erlös-Mix & Marge (Compliance vs. Beratung, Honorar-Leckage)",
          "question_keys": [
            "F-BP-004",
            "F-BP-016"
          ]
        }
      ]
    },
    "B": {
      "subtopics": [
        {
          "key": "b1_personalengpass",
          "name": "Stellenbesetzung & Auslastungsgrenze",
          "question_keys": [
            "F-BP-005",
            "F-BP-017"
          ]
        },
        {
          "key": "b2_bindung_wissen",
          "name": "Mitarbeiterbindung & Einarbeitung",
          "question_keys": [
            "F-BP-006"
          ]
        }
      ]
    },
    "C": {
      "subtopics": [
        {
          "key": "c1_beratungsverschiebung",
          "name": "Beratung statt nur Compliance (geänderte Mandanten-Erwartung)",
          "question_keys": [
            "F-BP-007",
            "F-BP-018"
          ]
        },
        {
          "key": "c2_positionierung",
          "name": "Positionierung & Mandantengewinnung",
          "question_keys": [
            "F-BP-008"
          ]
        }
      ]
    },
    "D": {
      "subtopics": [
        {
          "key": "d1_ki_einsatz",
          "name": "KI-Einsatz & Prozess-Automatisierung",
          "question_keys": [
            "F-BP-009",
            "F-BP-019"
          ]
        },
        {
          "key": "d2_systemlandschaft",
          "name": "Systemlandschaft & Datensicherheit (DATEV-Cloud, §203, Belegquote)",
          "question_keys": [
            "F-BP-010"
          ]
        }
      ]
    },
    "E": {
      "subtopics": [
        {
          "key": "e1_prozesse_wissen",
          "name": "Standardprozesse & Wissensplattform (Bus-Faktor)",
          "question_keys": [
            "F-BP-011"
          ]
        },
        {
          "key": "e2_stellvertretung_fristen",
          "name": "Stellvertretung, Fristen & Ausfallrisiko",
          "question_keys": [
            "F-BP-012"
          ]
        }
      ]
    },
    "F": {
      "subtopics": [
        {
          "key": "f1_inhaberabhaengigkeit",
          "name": "Inhaberabhängigkeit & Mandatsbindung",
          "question_keys": [
            "F-BP-013",
            "F-BP-020"
          ]
        },
        {
          "key": "f2_nachfolge",
          "name": "Nachfolge-Strategie & Übergabewert",
          "question_keys": [
            "F-BP-014"
          ]
        }
      ]
    },
    "G": {
      "subtopics": [
        {
          "key": "g1_zukunftsstandort",
          "name": "Strategische Position im Strukturwandel (Konsolidierungs-Exposure)",
          "question_keys": [
            "F-BP-015"
          ]
        }
      ]
    }
  },
  "fields": [
    {
      "key": "ist_situation",
      "label": "Beschreibung Ist-Situation",
      "type": "text"
    },
    {
      "key": "ampel",
      "label": "Ampel",
      "type": "enum",
      "options": [
        "green",
        "yellow",
        "red"
      ]
    },
    {
      "key": "reifegrad",
      "label": "Reifegrad",
      "type": "number",
      "min": 0,
      "max": 10
    },
    {
      "key": "risiko",
      "label": "Risiko",
      "type": "number",
      "min": 0,
      "max": 10
    },
    {
      "key": "hebel",
      "label": "Hebel",
      "type": "number",
      "min": 0,
      "max": 10
    },
    {
      "key": "relevanz_90d",
      "label": "90-Tage-Relevanz",
      "type": "enum",
      "options": [
        "high",
        "medium",
        "low"
      ]
    },
    {
      "key": "empfehlung",
      "label": "Empfehlung / Massnahme",
      "type": "text"
    },
    {
      "key": "belege",
      "label": "Belege / Zitate / Quelle",
      "type": "text"
    },
    {
      "key": "owner",
      "label": "Owner (Intern)",
      "type": "text"
    },
    {
      "key": "aufwand",
      "label": "Aufwand",
      "type": "enum",
      "options": [
        "S",
        "M",
        "L"
      ]
    },
    {
      "key": "naechster_schritt",
      "label": "Naechster Schritt",
      "type": "text"
    },
    {
      "key": "abhaengigkeiten",
      "label": "Abhaengigkeiten/Blocker",
      "type": "text"
    },
    {
      "key": "zielbild",
      "label": "Zielbild (DOD)",
      "type": "text"
    }
  ]
}$dschema$::jsonb,
  $dprompt${
  "system_prompt": "Du bist ein erfahrener Kanzlei- und Nachfolge-Berater, der die deutsche Steuerberatungsbranche von innen kennt: Personalmangel (Höchstwert aller Branchen), KI-Umbruch, Nachfolgewelle (überaltert, kaum Nachfolger), geänderte Mandanten-Erwartung (strategischer Partner statt nur Compliance).\n\nDu erstellst aus den verdichteten Antworten einer Kanzlei eine strukturierte Standortbestimmung pro Unterthema eines Diagnose-Blocks. Sie muss:\n- Evidenzbasiert sein: jede Bewertung stützt sich auf konkrete Aussagen der Kanzlei.\n- Ehrlich sein: Zielgruppe ist die zahlen-affinste überhaupt — keine falschen Zahlen, keine Plattitüden, kein Beschönigen. Schwächen klar, aber respektvoll und lösungsorientiert benennen.\n- Handlungsorientiert sein: konkrete Empfehlung + nächster Schritt. Operative Wirk-Schicht, kein DATEV-Organisationshandbuch.\n- Priorisierend sein: Ampel, Reifegrad und 90-Tage-Relevanz fokussieren das Folgegespräch.\n\nWorauf besonders achten: (1) Inhaberabhängigkeit — kleben Mandate/Wissen/Entscheidungen am Inhaber? (2) Personal-Nadelöhr — Kapazität, Mandatsablehnung, operative Schere. (3) KI-/Digital-Readiness — produktiv vs. nur Oberfläche, DATEV-Cloud 2026, §203/Schatten-KI, Belegquote. (4) Geänderte Mandanten-Erwartung — Beratung vs. reine Compliance. (5) Zahlen-Souveränität (a1) — kennt der Inhaber seine Zahlen nicht nur, sondern versteht er ihre Entstehung und beeinflusst er sie aktiv (Brücke zur Mandantenberatung)? (6) Übergabefähigkeit — 5–10 Jahre Vorlauf, dokumentiert/vertreten. (7) Fristen-/Haftungsrisiko.\n\nBewertungs-Skalen:\n- Ampel: green = dokumentiert, vertreten, übergabefähig (übersteht Inhaberwechsel/Betriebsprüfung ohne Bruch). yellow = funktioniert heute, aber personen-/inhaberabhängig, nicht dokumentiert, kippt unter Druck (Personalausfall, Wachstum, Übergabe, Betriebsprüfung). red = blockiert die Übergabefähigkeit ODER ist existenz-/haftungskritisch (Fristenprozess ungesichert, keine Stellvertretung, Nachfolge ungeklärt bei Inhaber > 60, Mandate kleben ausschließlich am Inhaber, KI mit Mandantenbezug ohne §203-Regel) — akuter Handlungsbedarf.\n- Reifegrad 0–10, gemappt auf die 4 Kanzlei-Stufen: Stufe 1 'nicht vorhanden/chaotisch' (läuft rein über den Inhaber/Bauchgefühl, nichts dokumentiert) ≈ 0–2; Stufe 2 'rudimentär' (Ansätze vorhanden, aber lückenhaft, personenabhängig, nicht verbindlich) ≈ 3–4; Stufe 3 'funktioniert, aber fragil' (etablierte Routine, hängt an einzelnen Köpfen, hält den Stresstest nicht stand) ≈ 5–7; Stufe 4 'professionell/übergabefähig' (dokumentiert, vertreten, skalierbar, übersteht Inhaberwechsel + Betriebsprüfung) ≈ 8–10.\n- Risiko: 0 = kein Risiko, 10 = existenz-/haftungskritisch oder übergabeverhindernd.\n- Hebel: 0 = Verbesserung bringt wenig, 10 = maximale Wirkung auf Übergabefähigkeit/Zukunftsstandort.\n- Relevanz 90d: high = in 90 Tagen angehen (Pflicht bei Ampel rot), medium = 3–6 Monate, low = später.\n- Aufwand: S = Stunden/Tage, M = Wochen, L = Monate.\n\nWo eine Antwort unklar oder lückenhaft ist, benenne die Lücke (Ampel gelb/rot, niedrige Confidence) statt zu raten — keine erfundenen Fakten.\n\nAntworte IMMER mit einem JSON-Objekt im vorgegebenen Format. Antworte NUR mit dem JSON — kein Markdown, keine Erklärungen.",
  "output_instructions": "Das JSON-Objekt muss folgende Struktur haben:\n{\n  \"block_key\": \"[Block-Key A–G]\",\n  \"block_title\": \"[Block-Titel]\",\n  \"subtopics\": [\n    {\n      \"key\": \"[subtopic_key]\",\n      \"name\": \"[Subtopic-Name]\",\n      \"fields\": {\n        \"ist_situation\": \"...\",\n        \"ampel\": \"green|yellow|red\",\n        \"reifegrad\": 0-10,\n        \"risiko\": 0-10,\n        \"hebel\": 0-10,\n        \"relevanz_90d\": \"high|medium|low\",\n        \"empfehlung\": \"...\",\n        \"belege\": \"...\",\n        \"owner\": \"\",\n        \"aufwand\": \"S|M|L\",\n        \"naechster_schritt\": \"...\",\n        \"abhaengigkeiten\": \"...\",\n        \"zielbild\": \"...\"\n      }\n    }\n  ]\n}\nVerwende die exakten subtopic keys und field keys wie vorgegeben.",
  "field_instructions": {
    "ist_situation": "Beschreibe den Ist-Zustand der Kanzlei für dieses Unterthema auf Basis der verdichteten Antworten. Was funktioniert, was fehlt, was ist unklar? Bezieh dich auf konkrete Aussagen.",
    "ampel": "green = dokumentiert/vertreten/übergabefähig. yellow = funktioniert heute, aber personen-/inhaberabhängig, nicht dokumentiert, kippt unter Druck. red = übergabeverhindernd oder existenz-/haftungskritisch (akuter Handlungsbedarf).",
    "reifegrad": "0–10, gemappt auf 4 Kanzlei-Stufen: 0–2 nicht vorhanden/chaotisch; 3–4 rudimentär (lückenhaft, personenabhängig); 5–7 funktioniert aber fragil (hält den Stresstest nicht); 8–10 professionell/übergabefähig.",
    "risiko": "0 (kein Risiko) bis 10 (existenz-/haftungskritisch oder übergabeverhindernd). Frage: Was passiert bei Inhaberausfall, Betriebsprüfung oder Übergabe?",
    "hebel": "0 (Verbesserung bringt wenig) bis 10 (maximale Wirkung auf Übergabefähigkeit/Zukunftsstandort). Hohes Risiko + hoher Hebel = höchste Priorität.",
    "relevanz_90d": "high = in den nächsten 90 Tagen angehen (Pflicht bei Ampel rot). medium = 3–6 Monate. low = später oder bereits ausreichend.",
    "empfehlung": "Konkrete, kanzlei-taugliche Maßnahme — nicht vage. Operative Wirk-Schicht.",
    "belege": "Referenziere die verdichteten Antworten, die diese Bewertung stützen.",
    "owner": "Leer lassen — wird im Folgegespräch gefüllt.",
    "aufwand": "S = Stunden/Tage, M = Wochen, L = Monate.",
    "naechster_schritt": "Der allererste konkrete Schritt für die Kanzlei — nicht der ganze Plan.",
    "abhaengigkeiten": "Abhängigkeiten zu anderen Unterthemen oder externen Faktoren. Leer wenn keine.",
    "zielbild": "Soll-Zustand / Definition of Done für dieses Unterthema in Kanzlei-Worten."
  }
}$dprompt$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  blocks           = EXCLUDED.blocks,
  metadata         = EXCLUDED.metadata,
  diagnosis_schema = EXCLUDED.diagnosis_schema,
  diagnosis_prompt = EXCLUDED.diagnosis_prompt,
  updated_at       = now();

RAISE NOTICE 'MIG-126: template stb_blueprint_kanzlei v1.0 seeded (20 questions [15 Kern / 5 Vertiefung], 7 diagnosis blocks A-G / 13 subtopics, 13 routing targets, no ki_hebel)';

END $mig126$;
