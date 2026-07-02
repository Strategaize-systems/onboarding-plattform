-- ============================================================================
-- MIG-128 — StB Fachmodul-Seed (16 Module, Welle 3-5)
-- SLC-170b (FEAT-092 StB-Vertikale, DEC-234 / DEC-242) — Modus A /module-author
--
-- Seedet 16 template-Rows (M-04=MIG-125, M-BP=MIG-126 separat):
--   M-01, M-02, M-03, M-06, M-07, M-08, M-15, M-16, M-26, M-27, M-28, M-35, M-36, M-38, M-39, M-42
-- Summe: 311 Fragen (2 Blocks/Modul: stufe1_kern required + stufe2_vertiefung),
--        146 KI-Hebel (Reifegrad 1-4) in metadata.ki_hebel.
--
-- Content-Quelle: docs/stb-vertikale/M-<xx>-seed-source.md (v1.0, abgenommen).
-- Shape 1:1 zu MIG-125 (M-04): template-queries.ts (TemplateBlock/Question) +
--   module-context.ts (ModuleMetadataSchema). Scoring-Flags = false (Delivery-Schicht).
-- Determinismus: uuid5(NAMESPACE_URL, 'strategaize/template/<slug>/<kind>/<id>'),
--   json.dumps(ensure_ascii=False). Generator: docs/stb-vertikale/gen-mig128-fachmodule-seed.py
--
-- IDEMPOTENZ: INSERT ... ON CONFLICT (slug, version) DO UPDATE. Zweiter Apply =
--   0 neue Rows, Content-Update (blocks/metadata/description/name). uuid5 -> stabil.
--
-- APPLY (sql-migration-hetzner.md): base64 -> /tmp, dann
--   docker exec -i <supabase-db> psql -U postgres -d postgres < /tmp/128_...sql
-- VERIFY:
--   SELECT slug, jsonb_array_length(blocks) AS blocks,
--     (SELECT COUNT(*) FROM jsonb_array_elements(blocks) b,
--       jsonb_array_elements(b->'questions') q) AS questions,
--     jsonb_array_length(metadata->'ki_hebel') AS hebel, metadata->>'modul_key' AS mk
--   FROM public.template WHERE slug LIKE 'stb_modul_%' AND slug NOT IN ('stb_modul_m04')
--   ORDER BY slug;
--   -- erwartet: 16 Rows (+ m04 aus MIG-125), je blocks=2, mk gesetzt.
-- ============================================================================

BEGIN;

-- ── M-01 · stb_modul_m01 · 9 Kern / 8 Vertiefung / 8 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m01',
  'M-01 – Geschäftsmodell & Werttreiber',
  '1.0',
  'M-01 – Geschäftsmodell & Werttreiber — StB-KERN-Cut (DEC-242). 17 Fragen (9 Kern / 8 Vertiefung), 8 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-01-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "45038f59-ffc5-5f09-a3f6-c5c483d4cc99",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "3fa7ab00-6819-51c8-81b1-01de4d29dd06",
        "frage_id": "F-M01-001",
        "text": "Aus welchen Kernleistungen besteht Ihr Angebot heute (FiBu, Lohn, Jahresabschluss, Steuererklärung, betriebswirtschaftliche Beratung, Spezialthemen) — und wie grob verteilt sich Ihr Honorarumsatz darauf?",
        "ebene": "Kern",
        "unterbereich": "b1a_kernleistungen_portfolio",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "46adfae4-329e-595e-aedf-a2a4a84edfe1",
        "frage_id": "F-M01-002",
        "text": "Verdient Ihre Kanzlei im Kern über Menge und geleistete Zeit (Volumen-/Stundenlogik) oder über Wert und Ergebnis für den Mandanten (Beratungs-/Wertlogik) — und mit welcher Logik wollen Sie künftig wachsen?",
        "ebene": "Kern",
        "unterbereich": "b1b_geschaeftslogik",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2420852b-a007-5d12-87a1-f44adc81061a",
        "frage_id": "F-M01-003",
        "text": "Wie verteilt sich Ihr Honorarumsatz zwischen Pflicht-Compliance (FiBu, Lohn, Abschluss, Erklärung) und echter betriebswirtschaftlicher Beratung?",
        "ebene": "Kern",
        "unterbereich": "b2a_compliance_beratung_split",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "4e90ba29-9ad7-5a3d-a545-8926643a18d6",
        "frage_id": "F-M01-004",
        "text": "Wie viel Ihrer Beratungsleistung rechnen Sie tatsächlich separat und wertbasiert ab — und wie viel geben Sie faktisch kostenlos mit, weil es „im Mandat mit drin\" ist?",
        "ebene": "Kern",
        "unterbereich": "b2b_beratung_abrechnung",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a1ec4f9c-d338-57d6-9a52-95ed33071a7f",
        "frage_id": "F-M01-005",
        "text": "Wie viel Prozent Ihres Honorarpotenzials lassen Sie schätzungsweise liegen (Pro-bono-Drift, vergessene Mehrleistungen, zu späte/zu niedrige Rechnung) — und wissen Sie, an welchen Stellen es am meisten leckt?",
        "ebene": "Kern",
        "unterbereich": "b3a_honorar_leckage",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3fae766c-5215-51b1-b1c6-4bd346f7b2ff",
        "frage_id": "F-M01-006",
        "text": "Was sind die zwei, drei laufenden Werttreiber Ihrer Kanzlei — das, womit Sie heute wirklich Geld verdienen und was Sie von anderen abhebt — und wie bewusst bauen Sie diese aus?",
        "ebene": "Kern",
        "unterbereich": "b4a_laufende_werttreiber",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "95904604-0e7b-550d-8bc9-70728e81d219",
        "frage_id": "F-M01-007",
        "text": "Die Branche konsolidiert (PE-Aufkäufe, Plattform-Kanzleien) bei gleichzeitigem KI-Umbruch — wo sehen Sie Ihre Kanzlei in 5 Jahren: übergabe-/aufkauffähig, spezialisiert-unabhängig, oder vom Wandel überrollt?",
        "ebene": "Kern",
        "unterbereich": "b6a_strategische_position",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "e3afc4e5-707e-585b-9729-b6112901531d",
        "frage_id": "F-M01-008",
        "text": "Ist die Marktkonsolidierung für Sie eher Chance (verkaufen, andocken, selbst aufkaufen) oder Bedrohung (überrollt werden) — und haben Sie dazu schon eine bewusste Haltung/Strategie, oder läuft es nebenher?",
        "ebene": "Kern",
        "unterbereich": "b6b_konsolidierungs_exposure",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "bf3f33b9-165c-5887-965f-629628097d40",
        "frage_id": "F-M01-009",
        "text": "Was passiert mit Ihrem Umsatzmodell, wenn KI in den nächsten Jahren Ihre FiBu-/Routine-Zeit halbiert — bricht Umsatz weg, oder verschiebt sich Kapazität in höherwertige Beratung?",
        "ebene": "Kern",
        "unterbereich": "b5a_ki_modell_effekt",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "f9178a4e-15f0-5609-8be6-2f92fcc93703",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "944f58ac-283c-5b8c-8630-e61c99d80dab",
        "frage_id": "F-M01-010",
        "text": "Wie stark hängt Ihr Umsatz an wenigen großen Mandaten oder einer einzelnen Branche — und was würde ein Wegbrechen der drei größten Mandate für Ihr Geschäftsmodell bedeuten?",
        "ebene": "Vertiefung",
        "unterbereich": "b1c_ertrags_klumpen",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2793de95-49d5-58ee-ba22-7d599254e90b",
        "frage_id": "F-M01-011",
        "text": "Wollen Sie Ihren Erlös-Mix bewusst Richtung höherwertige Beratung verschieben — und wenn ja, um welche konkreten Leistungen/Pakete und in welchem Zeithorizont?",
        "ebene": "Vertiefung",
        "unterbereich": "b2c_zukunft_erloesmix",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5943570e-4f89-507f-86a0-305630688363",
        "frage_id": "F-M01-012",
        "text": "Welche Ihrer Leistungsarten oder Mandatstypen sind wirklich rentabel und welche Verlustbringer — und ziehen Sie daraus Konsequenzen (ausbauen, anders bepreisen, abgeben)?",
        "ebene": "Vertiefung",
        "unterbereich": "b3b_leistungsrentabilitaet",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5fcf8329-fd46-5c0d-a86d-3e961739b82f",
        "frage_id": "F-M01-013",
        "text": "Orientiert sich Ihr Honorar eher am Aufwand/an der Zeit oder am Wert/Nutzen für den Mandanten — und wo könnten Sie für dieselbe Leistung mehr verlangen, ohne einen Mandanten zu verlieren?",
        "ebene": "Vertiefung",
        "unterbereich": "b3c_preis_wertlogik",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2511d061-8388-5a91-b818-f42a272729f5",
        "frage_id": "F-M01-014",
        "text": "Welche Tätigkeiten fressen bei Ihnen und im Team viel Zeit, ohne echten Wert für Mandant oder Kanzlei zu schaffen — und was davon ließe sich streichen, automatisieren oder abgeben?",
        "ebene": "Vertiefung",
        "unterbereich": "b4b_zeitfresser_wertlos",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "677a9e6d-f48f-5b5a-a47d-387cd2d0787c",
        "frage_id": "F-M01-015",
        "text": "Welche Teile Ihres Angebots ließen sich standardisieren oder produktisieren (feste Pakete, wiederholbare Beratungsformate), sodass Sie mit weniger individuellem Aufwand mehr erreichen?",
        "ebene": "Vertiefung",
        "unterbereich": "b4c_skalierbarkeit",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "86b11d5d-f287-56b2-98a6-a60638fd778f",
        "frage_id": "F-M01-016",
        "text": "Sehen Sie neue oder zusätzliche Erlösquellen jenseits des klassischen Mandats (Beratungspakete, Abo-/Retainer-Modelle, digitale Leistungen, Spezial-/Branchenberatung) — und probieren Sie davon schon etwas aus?",
        "ebene": "Vertiefung",
        "unterbereich": "b5c_neue_erloesquellen",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5fda45d0-f79c-5d04-8a6a-51721964d9a2",
        "frage_id": "F-M01-017",
        "text": "Ist Spezialisierung (Branche, Leistung, Nische) für Sie ein Weg, im Wandel unabhängig und gefragt zu bleiben — und haben Sie einen Fokus, oder machen Sie eher „alles für alle\"?",
        "ebene": "Vertiefung",
        "unterbereich": "b6c_spezialisierung_fokus",
        "position": 17,
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
  "modul_id": "M-01",
  "modul_key": "m01",
  "modul_kategorie": "Führung & Struktur",
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
    "beschreibung": "Aus den M-01-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "B1",
      "name": "Geschäftsmodell & Leistungsportfolio",
      "unterpunkte": [
        "Kernleistungen & Umsatzanteile (FiBu/Lohn/Abschluss/Erklärung/Beratung/Spezial)",
        "Grundlogik — Volumen-/Zeitlogik vs. Wert-/Beratungslogik",
        "Mandantenbasis als Ertragsbasis (Konzentration/Klumpen ertragsseitig)"
      ]
    },
    {
      "key": "B2",
      "name": "Erlös-Mix: Compliance vs. Beratung",
      "unterpunkte": [
        "Umsatzanteil Pflicht-Compliance vs. echte Beratung",
        "Beratung separat/wertbasiert abgerechnet vs. verschenkt",
        "Bewusste Verschiebung Richtung höherwertige Beratung"
      ]
    },
    {
      "key": "B3",
      "name": "Marge, Honorar-Leckage & Rentabilität",
      "unterpunkte": [
        "Nicht abgerechnete Mehrleistung / Pro-bono-Drift",
        "Rentable Leistungen/Mandate vs. Verlustbringer (Modell-Konsequenz)",
        "Honorar am Wert vs. am Aufwand (Grenze: Preisgestaltung/StBVV → M-09)"
      ]
    },
    {
      "key": "B4",
      "name": "Werttreiber & Zeitfresser",
      "unterpunkte": [
        "Die 2–3 laufenden Werttreiber (Grenze: Übergabewert → M-35)",
        "Tätigkeiten mit viel Zeit / wenig Wert",
        "Standardisierbar/produktisierbar (Grenze: KI-Systemwahl → M-36)"
      ]
    },
    {
      "key": "B5",
      "name": "KI-/Struktur-Wandel des Modells",
      "unterpunkte": [
        "Umsatz-/Kapazitäts-Effekt, wenn KI Routine (FiBu) halbiert",
        "Bewusste Anpassung des Modells an den Wandel",
        "Neue Erlösquellen (Pakete, Retainer/Abo, digitale/Spezial-Leistungen)"
      ]
    },
    {
      "key": "B6",
      "name": "Zukunfts-Standort & strategische Position",
      "unterpunkte": [
        "Position in 5 J. (übergabe-/aufkauffähig / spezialisiert-unabhängig / überrollt)",
        "Konsolidierung (PE/Plattform-Kanzleien) — Chance vs. Bedrohung",
        "Spezialisierung/Nische als Zukunftsschutz (Grenze: Positionierungs-Botschaft → M-15)"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M01-001",
      "name": "Erlös-Mix-Analyse",
      "beschreibung": "Honorarumsatz nach Compliance vs. Beratung + Leistungsart aufschlüsseln, Verschiebungs-Szenarien",
      "reifegrad": 2,
      "referenz": "B2; F-M01-003, F-M01-011"
    },
    {
      "hebel_id": "H-M01-002",
      "name": "Honorar-Leckage-Radar",
      "beschreibung": "Pro-bono-Drift, vergessene Mehrleistungen, Unterabrechnung sichtbar + Rückgewinnungspotenzial",
      "reifegrad": 2,
      "referenz": "B3a; F-M01-005 (Grenze: Realisierungsgrad-KPI = H-M07-002)"
    },
    {
      "hebel_id": "H-M01-003",
      "name": "Leistungs-/Mandats-Rentabilitäts-Portfolio",
      "beschreibung": "Träger vs. Verlustbringer → Ausbauen/Abbauen/Umpreisen-Empfehlung",
      "reifegrad": 3,
      "referenz": "B3b; F-M01-012 (verwandt H-M07-006 — hier Modell-Konsequenz)"
    },
    {
      "hebel_id": "H-M01-004",
      "name": "Wert-/Preislogik-Assistent",
      "beschreibung": "aufwands- vs. wertbasierte Honorierung, Preissetzungs-Spielräume aufzeigen",
      "reifegrad": 2,
      "referenz": "B3c; F-M01-013"
    },
    {
      "hebel_id": "H-M01-005",
      "name": "Werttreiber-/Zeitfresser-Landkarte",
      "beschreibung": "was schafft Wert vs. frisst Zeit — Standardisierungs-/Automatisierungs-Kandidaten",
      "reifegrad": 3,
      "referenz": "B4; F-M01-006, F-M01-014, F-M01-015"
    },
    {
      "hebel_id": "H-M01-006",
      "name": "KI-Modell-Effekt-Simulator",
      "beschreibung": "Umsatz-/Kapazitäts-Effekt, wenn KI Routine halbiert; Verschiebung in Beratung durchrechnen",
      "reifegrad": 3,
      "referenz": "B5a; F-M01-009"
    },
    {
      "hebel_id": "H-M01-007",
      "name": "Neue-Erlösquellen-/Produktisierungs-Ideengeber",
      "beschreibung": "Pakete, Retainer, digitale/Spezial-Leistungen fürs Portfolio",
      "reifegrad": 2,
      "referenz": "B4c/B5c; F-M01-015, F-M01-016"
    },
    {
      "hebel_id": "H-M01-008",
      "name": "Zukunfts-Standort-Radar",
      "beschreibung": "strategische Position im Konsolidierungs-/KI-Wandel; Szenarien übergabefähig/spezialisiert/überrollt + Weichenstellungen",
      "reifegrad": 4,
      "referenz": "B6; F-M01-007, F-M01-008, F-M01-017"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-02 · stb_modul_m02 · 9 Kern / 8 Vertiefung / 8 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m02',
  'M-02 – Organisationsstruktur & Rollen',
  '1.0',
  'M-02 – Organisationsstruktur & Rollen — StB-KERN-Cut (DEC-242). 17 Fragen (9 Kern / 8 Vertiefung), 8 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-02-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "5e182596-ecf3-5f0d-9787-a1b33c64a3b3",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "9f407488-ef2a-593a-8304-d1e99eecfac1",
        "frage_id": "F-M02-001",
        "text": "Wie ist Ihre Kanzlei heute organisiert — eher als Einzelkämpfer mit Zuarbeit, in festen Teams/Bereichen (FiBu, Lohn, Abschluss, Beratung) oder nach Mandantengruppen — und über wie viele Standorte?",
        "ebene": "Kern",
        "unterbereich": "s1a_struktur_aufbau",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "748f9287-f59e-595e-8dd0-efd3d998b118",
        "frage_id": "F-M02-002",
        "text": "Gibt es ein Organigramm, das die tatsächliche Struktur abbildet — oder weicht die gelebte Realität (wer wirklich was macht und wem zuarbeitet) deutlich von dem ab, was auf dem Papier stünde?",
        "ebene": "Kern",
        "unterbereich": "s1b_real_vs_formal",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "515371bd-1b07-5778-8f78-c84f0a15ec26",
        "frage_id": "F-M02-003",
        "text": "Sind die Rollen und Zuständigkeiten in Ihrem Team klar — weiß jeder, wofür er verantwortlich ist — oder macht faktisch „jeder alles\" und vieles landet nach Verfügbarkeit?",
        "ebene": "Kern",
        "unterbereich": "s2a_rollenklarheit",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "e44ae397-10a9-5bd4-9f9a-a8ba0623d93d",
        "frage_id": "F-M02-004",
        "text": "Ist geregelt, wer welche Mandate federführend verantwortet (fester Ansprechpartner, Vertretung) — oder hängt die Mandatsbetreuung eher unstrukturiert an wechselnden Personen?",
        "ebene": "Kern",
        "unterbereich": "s2b_verantwortung_mandate",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "4416047d-969f-53d3-9156-4487c01c9c67",
        "frage_id": "F-M02-005",
        "text": "Wie viele Fäden laufen strukturell bei Ihnen als Inhaber zusammen — Zeichnung, Freigaben, Schlüsselmandate, Entscheidungen — und bei wie vielem sind Sie faktisch die einzige Stelle, an der es vorbeimuss?",
        "ebene": "Kern",
        "unterbereich": "s3a_inhaber_nadeloehr",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "240191ba-285b-552e-aaac-8f4eeaf8468c",
        "frage_id": "F-M02-006",
        "text": "Gibt es unterhalb von Ihnen strukturell eine zweite Ebene (Teamleitung, Bereichsverantwortliche), die eigene Rollen und Verantwortung trägt — oder ist die Struktur flach mit Ihnen an jeder Spitze?",
        "ebene": "Kern",
        "unterbereich": "s3b_zweite_ebene",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0b8a72c3-3c97-551c-a571-22dcdd9e25ae",
        "frage_id": "F-M02-007",
        "text": "Für welche Schlüsselrollen — Sie selbst eingeschlossen — gibt es eine geregelte, eingearbeitete Vertretung, die im Ausfall übernehmen könnte?",
        "ebene": "Kern",
        "unterbereich": "s4a_vertretungsregelung",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "34d638cf-ba0f-56c1-b1e7-25259ef269a5",
        "frage_id": "F-M02-008",
        "text": "Wie ist Ihr Fristen- und Posteingangsprozess gegen einen plötzlichen Ausfall abgesichert — würde ein unerwarteter Ausfall (Ihrer oder einer Schlüsselrolle) Fristen und Zeichnung ins Wanken bringen?",
        "ebene": "Kern",
        "unterbereich": "s4c_fristen_ausfall_prozess",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3a4d7c2b-6d5c-5343-8108-ef5b011cdd9f",
        "frage_id": "F-M02-009",
        "text": "Wenn Sie sich für längere Zeit ganz herausnähmen: Würde die Kanzlei strukturell weiterlaufen — Rollen, Verantwortung, Zeichnung greifen — oder käme vieles zum Stillstand, weil es an Ihnen hängt?",
        "ebene": "Kern",
        "unterbereich": "s6a_uebergabefaehige_struktur",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "fcd3057c-3544-522f-95ce-c38eb7b0f861",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "1aa4e53c-7dd5-5580-a74c-af1dde5c69c2",
        "frage_id": "F-M02-010",
        "text": "Trägt Ihre heutige Struktur Wachstum — könnten Sie 20–30 % mehr Mandate aufnehmen, ohne dass die Organisation reißt — oder ist die Struktur schon heute am Anschlag?",
        "ebene": "Vertiefung",
        "unterbereich": "s1c_wachstums_tauglichkeit",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "47604bb9-1e04-5ec1-9cc7-be95b2801447",
        "frage_id": "F-M02-011",
        "text": "Gibt es bei Ihnen Aufgaben, die zwischen Rollen durchfallen („macht keiner\"), oder umgekehrt Doppelzuständigkeiten, bei denen sich zwei im Weg stehen — und wo passiert das am häufigsten?",
        "ebene": "Vertiefung",
        "unterbereich": "s2c_doppel_luecken",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2da2d77f-60f1-5b89-80be-eda3682c3f5f",
        "frage_id": "F-M02-012",
        "text": "Welche der Aufgaben/Rollen, die heute an Ihnen hängen, ließen sich strukturell abkoppeln und einer anderen Rolle fest zuordnen — und was hält Sie strukturell davon ab?",
        "ebene": "Vertiefung",
        "unterbereich": "s3c_rollen_entkopplung",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "36450118-870b-57f6-80e4-d5d9f32f7feb",
        "frage_id": "F-M02-013",
        "text": "Welche Ihrer kritischen Rollen ist heute faktisch nur einfach besetzt — sodass ihr Ausfall sofort ein Loch reißt — und für welche gibt es strukturell eine Rückfallebene?",
        "ebene": "Vertiefung",
        "unterbereich": "s4b_kritische_rollen_redundanz",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "26641641-3c58-5e4d-98a3-11c0db07cc0c",
        "frage_id": "F-M02-014",
        "text": "Wie sauber sind die Übergaben und Schnittstellen zwischen Ihren Bereichen (FiBu → Abschluss, Lohn, Beratung) geregelt — oder gehen an diesen Übergabepunkten regelmäßig Dinge verloren oder werden doppelt gemacht?",
        "ebene": "Vertiefung",
        "unterbereich": "s5a_schnittstellen_uebergaben",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2b638c2b-6c03-52a1-bdd9-75a35ac66907",
        "frage_id": "F-M02-015",
        "text": "Bleibt für den Mandanten die Betreuung kontinuierlich, wenn intern eine Rolle oder Person wechselt — oder merkt der Mandant Brüche (neuer Ansprechpartner ohne Übergabe, verlorener Kontext)?",
        "ebene": "Vertiefung",
        "unterbereich": "s5c_mandanten_kontinuitaet",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "dfe9ee23-99b1-5494-8198-7e8b1e724448",
        "frage_id": "F-M02-016",
        "text": "Passt Ihre Rollenstruktur noch zu einer Kanzlei, in der KI Routine übernimmt — braucht es neue Rollen (Datenqualität, Prüfung, KI-/Prozessverantwortung), und ist dafür strukturell Platz?",
        "ebene": "Vertiefung",
        "unterbereich": "s6b_struktur_ki_wandel",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "058ad4b8-70c3-527d-aa37-38599df0a075",
        "frage_id": "F-M02-017",
        "text": "Ist Ihre Organisationsstruktur bewusst so gestaltet — oder eher über die Jahre historisch gewachsen — und wann haben Sie sie zuletzt aktiv überprüft und angepasst?",
        "ebene": "Vertiefung",
        "unterbereich": "s6c_anpassung_weiterentwicklung",
        "position": 17,
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
  "modul_id": "M-02",
  "modul_key": "m02",
  "modul_kategorie": "Führung & Struktur",
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
    "beschreibung": "Aus den M-02-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "S1",
      "name": "Aufbauorganisation & Struktur",
      "unterpunkte": [
        "Grundstruktur (Teams/Bereiche/Mandantengruppen/Standorte, Einzelkämpfer vs. Team)",
        "Gelebte vs. formale Struktur (Organigramm vorhanden & aktuell vs. läuft anders)",
        "Trägt die Struktur Wachstum/mehr Mandate (skaliert vs. am Anschlag)"
      ]
    },
    {
      "key": "S2",
      "name": "Rollen & Verantwortlichkeiten",
      "unterpunkte": [
        "Klare Rollen/Zuständigkeiten vs. „jeder macht alles\"",
        "Mandatsverantwortung/-zuordnung (fester Ansprechpartner)",
        "Doppelzuständigkeiten & Zuständigkeitslücken"
      ]
    },
    {
      "key": "S3",
      "name": "Inhaber-Rolle in der Struktur (strukturell)",
      "unterpunkte": [
        "Strukturelle Konzentration von Rollen/Zeichnung/Freigaben beim Inhaber (Grenze: als Haltung → M-42)",
        "Zweite Führungs-/Verantwortungsebene strukturell (Grenze: pers. Pipeline → M-26 P6; Entsch.-Delegation → M-03)",
        "Inhaber-Rollen strukturell aufteilbar/entkoppelbar"
      ]
    },
    {
      "key": "S4",
      "name": "Stellvertretung & Ausfall-Redundanz (strukturell)",
      "unterpunkte": [
        "Geregelte, eingearbeitete Vertretung je Schlüsselrolle (Grenze: §69 → M-35, Einarbeitung → M-28)",
        "Kritische Rollen einfach vs. doppelt besetzt strukturell (Grenze: pers. Zweitbesetzung → M-26)",
        "Fristen-/Posteingangs-/Zeichnungs-Prozess gegen Ausfall abgesichert"
      ]
    },
    {
      "key": "S5",
      "name": "Zusammenarbeit & Schnittstellen",
      "unterpunkte": [
        "Schnittstellen/Übergaben zwischen Bereichen/Rollen (FiBu→Abschluss/Lohn/Beratung)",
        "Reibung/Doppelarbeit an Schnittstellen (Grenze: Meetings → M-40, Wissensdok → M-39)",
        "Betreuungskontinuität über Rollen-/Personalwechsel"
      ]
    },
    {
      "key": "S6",
      "name": "Übergabefähige Struktur & Struktur-Wandel",
      "unterpunkte": [
        "Läuft die Struktur ohne den Inhaber (strukturelle Übergabefähigkeit)",
        "Passt die Struktur zu neuen KI-/Digital-Rollen (Grenze: Systemwahl → M-36, Personalbedarf → M-26)",
        "Struktur bewusst weiterentwickelt vs. historisch gewachsen"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M02-001",
      "name": "Rollen-/Zuständigkeits-Matrix",
      "beschreibung": "wer verantwortet was, Mandatszuordnung + Vertretung — Lücken/Doppelungen sichtbar",
      "reifegrad": 2,
      "referenz": "S2; F-M02-003, F-M02-004, F-M02-011"
    },
    {
      "hebel_id": "H-M02-002",
      "name": "Ist-/Soll-Organigramm-Generator",
      "beschreibung": "gelebte vs. formale Struktur gegenüberstellen",
      "reifegrad": 2,
      "referenz": "S1; F-M02-001, F-M02-002"
    },
    {
      "hebel_id": "H-M02-003",
      "name": "Inhaber-Nadelöhr-Analyse",
      "beschreibung": "welche Rollen/Fäden sich strukturell beim Inhaber konzentrieren, Entkopplungs-Kandidaten",
      "reifegrad": 3,
      "referenz": "S3; F-M02-005, F-M02-012"
    },
    {
      "hebel_id": "H-M02-004",
      "name": "Stellvertretungs-/Ausfall-Redundanz-Check",
      "beschreibung": "je Schlüsselrolle: Vertretung vorhanden? Rückfallebene? Fristen-Absicherung",
      "reifegrad": 2,
      "referenz": "S4; F-M02-007, F-M02-008, F-M02-013"
    },
    {
      "hebel_id": "H-M02-005",
      "name": "Schnittstellen-/Übergabe-Landkarte",
      "beschreibung": "Übergabepunkte zwischen Bereichen, Reibungs-/Verlust-Stellen",
      "reifegrad": 2,
      "referenz": "S5; F-M02-014, F-M02-015"
    },
    {
      "hebel_id": "H-M02-006",
      "name": "Wachstums-Struktur-Stresstest",
      "beschreibung": "trägt die Struktur X % mehr Mandate — wo reißt sie zuerst",
      "reifegrad": 3,
      "referenz": "S1c; F-M02-010"
    },
    {
      "hebel_id": "H-M02-007",
      "name": "Übergabefähigkeits-Struktur-Radar",
      "beschreibung": "läuft die Kanzlei strukturell ohne den Inhaber — Gesamtbild über alle Rollen",
      "reifegrad": 4,
      "referenz": "S1–S6; F-M02-005, F-M02-009"
    },
    {
      "hebel_id": "H-M02-008",
      "name": "Zukunfts-Rollen-Designer",
      "beschreibung": "neue KI-/Digital-Rollen in die Struktur einplanen — Datenqualität, Prüfung, Prozessverantwortung",
      "reifegrad": 3,
      "referenz": "S6b; F-M02-016"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-03 · stb_modul_m03 · 9 Kern / 8 Vertiefung / 8 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m03',
  'M-03 – Entscheidungsprozesse & Governance',
  '1.0',
  'M-03 – Entscheidungsprozesse & Governance — StB-KERN-Cut (DEC-242). 17 Fragen (9 Kern / 8 Vertiefung), 8 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-03-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "3ecc6522-5912-5e48-a3fa-f239e6c956aa",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "8dfea096-c2fc-5cf8-a135-298c726ce5fa",
        "frage_id": "F-M03-001",
        "text": "Wie werden Entscheidungen in Ihrer Kanzlei getroffen — laufen sie über feste, klare Wege, oder eher situativ und ad hoc, je nachdem, wer gerade zuständig oder da ist?",
        "ebene": "Kern",
        "unterbereich": "e1a_entscheidungswege",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0ff8c2b1-e446-530b-8ae6-455372918644",
        "frage_id": "F-M03-002",
        "text": "Unterscheiden Sie bewusst zwischen Entscheidungsarten (operativ-fachlich, personell, finanziell, strategisch) — und ist bei jeder Art klar, wer sie treffen darf?",
        "ebene": "Kern",
        "unterbereich": "e1b_entscheidungstypen",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7c82cb34-aa74-5653-8391-39d797412c41",
        "frage_id": "F-M03-003",
        "text": "Laufen bei Ihnen faktisch alle wesentlichen Entscheidungen über den Inhaber — oder gibt es Bereiche, in denen andere eigenständig und verbindlich entscheiden?",
        "ebene": "Kern",
        "unterbereich": "e1c_zentral_vs_verteilt",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a57764de-827a-574b-9af2-f29813ba43b5",
        "frage_id": "F-M03-004",
        "text": "Gibt es definierte Entscheidungs- und Freigabegrenzen (bis zu welchem Betrag, welcher Mandats-/Personalentscheidung darf wer allein entscheiden) — oder ist das nirgends festgelegt?",
        "ebene": "Kern",
        "unterbereich": "e2a_befugnisse_grenzen",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "762b3f91-0719-5d50-ada2-ff4934f9ce1e",
        "frage_id": "F-M03-005",
        "text": "Ist klar, wann und wie eine Entscheidung eskaliert wird — wann etwas an Sie oder die Führung heraufgereicht werden muss und wann nicht?",
        "ebene": "Kern",
        "unterbereich": "e2c_eskalation",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "62d004ee-9d03-56e9-befd-6a6e7a7eea38",
        "frage_id": "F-M03-006",
        "text": "Falls Sie mehrere Gesellschafter/Partner sind: Wie stimmen Sie sich im operativen Alltag ab und treffen gemeinsame Entscheidungen — funktioniert das eingespielt, oder gibt es regelmäßig Reibung/Blockaden?",
        "ebene": "Kern",
        "unterbereich": "e3a_partner_abstimmung",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2c838269-b19f-5301-acef-d2e52639b50d",
        "frage_id": "F-M03-007",
        "text": "Gibt es feste Runden/Meetings, in denen Entscheidungen strukturiert getroffen werden — oder passieren wichtige Entscheidungen eher zwischen Tür und Angel?",
        "ebene": "Kern",
        "unterbereich": "e4a_entscheidungs_meetings",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2aa4b4fb-c0cb-5a70-a3ce-04677b7d17ed",
        "frage_id": "F-M03-008",
        "text": "Werden getroffene Entscheidungen klar ins Team kommuniziert und dann auch umgesetzt — oder versanden Beschlüsse häufig, weil sie nicht ankommen oder nicht nachverfolgt werden?",
        "ebene": "Kern",
        "unterbereich": "e5b_kommunikation_umsetzung",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "028061c5-be01-55b9-b35c-bd2c2c517305",
        "frage_id": "F-M03-009",
        "text": "Wenn Sie für längere Zeit ausfielen: Bliebe Ihre Kanzlei entscheidungsfähig — wüssten die Leute, wer was entscheiden darf — oder blieben wichtige Entscheidungen einfach liegen, bis Sie zurück sind?",
        "ebene": "Kern",
        "unterbereich": "e6a_entscheidungsfaehig_ohne_inhaber",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "ea5b2ce3-3094-5bf8-a819-7aea2cdcecb5",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "e32d6283-f18b-59ea-a18b-f42e499a9770",
        "frage_id": "F-M03-010",
        "text": "Welche Entscheidungen haben Sie formal an Rollen/Personen delegiert — sodass diese wirklich verbindlich entscheiden dürfen, nicht nur vorbereiten — und woran erkennt das Team, wo diese Grenze liegt?",
        "ebene": "Vertiefung",
        "unterbereich": "e2b_delegierte_befugnis",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "32a58863-9284-513f-81f2-0165cf33ddcb",
        "frage_id": "F-M03-011",
        "text": "Gibt es feste Führungs-/Gesellschafterrunden (Jour fixe, Führungskreis), in denen Sie steuern und entscheiden — mit fester Taktung und Agenda — oder passiert das unregelmäßig und anlassbezogen?",
        "ebene": "Vertiefung",
        "unterbereich": "e3b_gremien_runden",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "ddfba012-5169-5231-bffa-ad72569877c0",
        "frage_id": "F-M03-012",
        "text": "Ist bei Ihnen klar getrennt, wann jemand als Gesellschafter (Eigentümerinteresse) und wann als Geschäftsführung (operative Leitung) entscheidet — oder vermischt sich das?",
        "ebene": "Vertiefung",
        "unterbereich": "e3c_rollen_gesellschafter_gf",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "94d5f5a0-fe24-5741-8127-eaad1ca774da",
        "frage_id": "F-M03-013",
        "text": "Kommen Entscheidungen bei Ihnen entscheidungsreif auf den Tisch (Optionen, Zahlen, Empfehlung aufbereitet) — oder müssen Sie vieles selbst erst aufbereiten, bevor überhaupt entschieden werden kann?",
        "ebene": "Vertiefung",
        "unterbereich": "e4b_entscheidungsreife",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a310fb5e-8136-56ed-8235-62b020a60927",
        "frage_id": "F-M03-014",
        "text": "Werden Entscheidungen bei Ihnen zügig getroffen und kommen dann voran — oder bleiben Entscheidungen häufig liegen und ziehen sich, weil der Prozess dafür fehlt?",
        "ebene": "Vertiefung",
        "unterbereich": "e4c_taktung_geschwindigkeit",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "bbcf66ac-f06b-5f11-aa0f-9b5e4ab772dc",
        "frage_id": "F-M03-015",
        "text": "Werden wichtige Entscheidungen und ihre Begründung irgendwo festgehalten — sodass später nachvollziehbar ist, was warum entschieden wurde — oder lebt das nur im Gedächtnis der Beteiligten?",
        "ebene": "Vertiefung",
        "unterbereich": "e5a_dokumentation",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0a5c370f-fc74-5808-a9c2-efc999ec5d26",
        "frage_id": "F-M03-016",
        "text": "Wie verbindlich sind Beschlüsse bei Ihnen — gibt es eine Maßnahmen-/Beschluss-Nachverfolgung (wer macht was bis wann) — oder werden Dinge beschlossen und dann doch nicht umgesetzt?",
        "ebene": "Vertiefung",
        "unterbereich": "e5c_nachverfolgung_verbindlichkeit",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7883d44c-ca9a-570c-a866-085694bc5ea4",
        "frage_id": "F-M03-017",
        "text": "Sind Ihre Entscheidungsregeln und Zuständigkeiten irgendwo dokumentiert (wer entscheidet was, welche Grenzen, welche Eskalation) — oder steckt diese Governance vor allem in Ihrem Kopf?",
        "ebene": "Vertiefung",
        "unterbereich": "e6b_governance_dokumentiert",
        "position": 17,
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
  "modul_id": "M-03",
  "modul_key": "m03",
  "modul_kategorie": "Führung & Struktur",
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
    "beschreibung": "Aus den M-03-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "E1",
      "name": "Entscheidungsstruktur & -wege",
      "unterpunkte": [
        "Wie/wo Entscheidungen getroffen werden (feste Wege vs. ad hoc)",
        "Entscheidungsarten (operativ/personell/finanziell/strategisch) — wer entscheidet was",
        "Zentralisierung beim Inhaber vs. verteilt (Grenze: als Haltung → M-42)"
      ]
    },
    {
      "key": "E2",
      "name": "Befugnisse & Delegation (formal)",
      "unterpunkte": [
        "Definierte Entscheidungs-/Freigabegrenzen (Betrag, Mandat, Personal)",
        "Formal delegierte Entscheidungen (Grenze: Bereitschaft → M-42 U3, Rolle → M-02)",
        "Eskalations-/Rückkopplungswege (wann geht was nach oben)"
      ]
    },
    {
      "key": "E3",
      "name": "Gesellschafter-/Führungs-Governance",
      "unterpunkte": [
        "Operative Partner-/Gesellschafter-Abstimmung im Alltag (Grenze: Stimmrechte/Verträge → M-35 G2a)",
        "Feste Führungs-/Gesellschafterrunden (Jour fixe, Führungskreis)",
        "Trennung Gesellschafter- vs. Geschäftsführungsrolle im Entscheiden"
      ]
    },
    {
      "key": "E4",
      "name": "Meeting- & Abstimmungs-Taktung",
      "unterpunkte": [
        "Feste Runden, in denen entschieden wird (vs. Flurentscheidungen; Grenze: Meetings allg. → M-40)",
        "Kommen Entscheidungen entscheidungsreif aufbereitet",
        "Taktung/Geschwindigkeit prozessual (Grenze: pers. Aufschub-Stil → M-42 U2a)"
      ]
    },
    {
      "key": "E5",
      "name": "Nachvollziehbarkeit & Verbindlichkeit",
      "unterpunkte": [
        "Entscheidungen + Begründung festgehalten (Grenze: Wissensplattform → M-39)",
        "Entscheidungen ins Team kommuniziert & umgesetzt",
        "Maßnahmen-/Beschluss-Nachverfolgung (Verbindlichkeit vs. versanden)"
      ]
    },
    {
      "key": "E6",
      "name": "Governance-Reife & Übergabefähigkeit",
      "unterpunkte": [
        "Bleibt die Kanzlei ohne den Inhaber entscheidungsfähig",
        "Governance/Entscheidungsregeln dokumentiert vs. im Kopf des Inhabers",
        "Governance bewusst weiterentwickelt vs. historisch/ad hoc"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M03-001",
      "name": "Entscheidungs-Kompetenz-Matrix",
      "beschreibung": "welche Entscheidungsart wer treffen/freigeben darf, Grenzen + Eskalation",
      "reifegrad": 2,
      "referenz": "E1/E2; F-M03-002, F-M03-004, F-M03-005"
    },
    {
      "hebel_id": "H-M03-002",
      "name": "Entscheidungswege-Analyse",
      "beschreibung": "zentral vs. verteilt, wo alles über den Inhaber läuft",
      "reifegrad": 2,
      "referenz": "E1; F-M03-001, F-M03-003"
    },
    {
      "hebel_id": "H-M03-003",
      "name": "Delegations-/Freigabe-Designer",
      "beschreibung": "Entscheidungen formal an Rollen delegieren, Grenzen sichtbar machen",
      "reifegrad": 3,
      "referenz": "E2b; F-M03-010"
    },
    {
      "hebel_id": "H-M03-004",
      "name": "Entscheidungs-Meeting-/Jour-fixe-Struktur",
      "beschreibung": "feste Entscheidungsrunden, Agenda, Entscheidungsreife-Check",
      "reifegrad": 2,
      "referenz": "E4; F-M03-007, F-M03-011, F-M03-013"
    },
    {
      "hebel_id": "H-M03-005",
      "name": "Beschluss-/Maßnahmen-Tracker",
      "beschreibung": "getroffene Entscheidungen dokumentieren, Umsetzung nachverfolgen",
      "reifegrad": 2,
      "referenz": "E5; F-M03-008, F-M03-015, F-M03-016"
    },
    {
      "hebel_id": "H-M03-006",
      "name": "Partner-/Gesellschafter-Abstimmungs-Assistent",
      "beschreibung": "operative Abstimmung strukturieren, Blockade-/Deadlock-Früherkennung",
      "reifegrad": 2,
      "referenz": "E3; F-M03-006, F-M03-012 (Grenze: vertragliche Deadlock-Regel → M-35 H-M35-002)"
    },
    {
      "hebel_id": "H-M03-007",
      "name": "Governance-Dokumentations-Generator",
      "beschreibung": "Entscheidungsregeln/Zuständigkeiten aus dem Kopf in ein Governance-Dokument",
      "reifegrad": 3,
      "referenz": "E6b; F-M03-017"
    },
    {
      "hebel_id": "H-M03-008",
      "name": "Governance-/Entscheidungsfähigkeits-Radar",
      "beschreibung": "bleibt die Kanzlei ohne den Inhaber entscheidungsfähig — Gesamtbild Governance-Reife",
      "reifegrad": 4,
      "referenz": "E1–E6; F-M03-003, F-M03-009"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-06 · stb_modul_m06 · 11 Kern / 13 Vertiefung / 11 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m06',
  'M-06 – Liquiditätsplanung & Zahlungsströme',
  '1.0',
  'M-06 – Liquiditätsplanung & Zahlungsströme — StB-KERN-Cut (DEC-242). 24 Fragen (11 Kern / 13 Vertiefung), 11 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-06-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "e5019dd5-263d-50ba-be78-55e1999355d3",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "d9be4a74-5256-51df-bd49-82eb1e1ca7ea",
        "frage_id": "F-M06-001",
        "text": "Wissen Sie zu jedem Zeitpunkt, wie viel Geld Ihrer Kanzlei heute frei verfügbar ist — und wie kommen Sie an diese Zahl (Blick aufs Konto, Tabelle, Tool)?",
        "ebene": "Kern",
        "unterbereich": "l1a_cash_sichtbarkeit",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "1df3291b-b43d-5033-a09a-f9dd49039ba4",
        "frage_id": "F-M06-002",
        "text": "Wie viele Monate könnte Ihre Kanzlei ihre Fixkosten (v. a. Gehälter) aus vorhandenen Reserven decken, wenn drei Monate lang kaum Honorar reinkäme?",
        "ebene": "Kern",
        "unterbereich": "l1b_reserve_runway",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "9ce6ac5b-e3f8-56b9-871d-db46c5201fb3",
        "frage_id": "F-M06-003",
        "text": "Hatten Sie schon Monate mit gutem Ergebnis, in denen das Geld auf dem Konto trotzdem knapp war — und wissen Sie, woran das lag (offene Honorare, Steuern, Entnahmen)?",
        "ebene": "Kern",
        "unterbereich": "l1c_cash_vs_gewinn",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "dfc0e321-7df7-5d4c-8fa1-ed5f675cc8f2",
        "frage_id": "F-M06-004",
        "text": "Führen Sie eine vorausschauende Liquiditätsplanung (erwartete Ein-/Auszahlungen über die nächsten Wochen/Monate) — oder steuern Sie die Kanzlei-Liquidität aus dem aktuellen Kontostand?",
        "ebene": "Kern",
        "unterbereich": "l2a_planungsinstrument",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "daddfee8-0087-5a4e-8249-1b958c46d605",
        "frage_id": "F-M06-005",
        "text": "Wer in Ihrer Kanzlei pflegt die Liquiditätsvorschau, in welchem Rhythmus wird sie aktualisiert — und was passiert mit ihr, wenn diese Person ausfällt?",
        "ebene": "Kern",
        "unterbereich": "l2b_taktung_owner",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "9110268a-09c0-5a71-9237-a3e544df8e20",
        "frage_id": "F-M06-006",
        "text": "Wie viel Zeit vergeht bei Ihnen typischerweise zwischen erbrachter Leistung und gestellter Rechnung — und bei welchen Mandaten/Leistungen bleibt die Abrechnung regelmäßig liegen?",
        "ebene": "Kern",
        "unterbereich": "l3a_rechnungstaktung",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "60b6591b-a2e0-53f2-8334-8370881f5fb0",
        "frage_id": "F-M06-007",
        "text": "Bei welchem Anteil Ihrer Mandate arbeiten Sie mit Vorschüssen oder monatlichen Abschlägen (Dauermandat) statt mit nachträglicher Einzelabrechnung — und wie planbar macht das Ihren Zahlungseingang?",
        "ebene": "Kern",
        "unterbereich": "l3b_vorschuss_abschlag",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "df776867-9b79-574a-9b1a-88df2617d28b",
        "frage_id": "F-M06-008",
        "text": "Wie hoch ist Ihr monatlicher Fixkostenblock (Gehälter, Miete, Software/DATEV) im Verhältnis zum durchschnittlichen Monats-Zahlungseingang — und wie eng wird es, wenn ein großer Eingang später kommt?",
        "ebene": "Kern",
        "unterbereich": "l4a_personal_fixkosten",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "68088563-7aae-5779-8f93-0a782cb9339e",
        "frage_id": "F-M06-009",
        "text": "Legen Sie für eigene Steuervoraus- und -nachzahlungen der Kanzlei gezielt zurück — oder überraschen Sie diese Zahlungen liquiditätsmäßig regelmäßig?",
        "ebene": "Kern",
        "unterbereich": "l4b_eigene_steuern",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "b6a92016-5f9c-5c01-8b5e-02e02c5bbf6e",
        "frage_id": "F-M06-010",
        "text": "Haben Sie eine Kontokorrent-/Kreditlinie als Puffer — und wie oft haben Sie sie in den letzten 12 Monaten tatsächlich in Anspruch genommen?",
        "ebene": "Kern",
        "unterbereich": "l6a_finanzierungslinie",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "f0e12dfb-2fd1-5ec2-a236-6d82cd0bd227",
        "frage_id": "F-M06-011",
        "text": "Nach welcher Logik entnehmen Sie Geld aus der Kanzlei (fester Betrag, nach Bedarf, nach verfügbarem Cash) — und richtet sich die Entnahme nach der Liquiditätslage oder unabhängig davon?",
        "ebene": "Kern",
        "unterbereich": "l6b_inhaber_entnahmen",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "fbeffe7a-2b44-5644-b146-cb5c55a5197a",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "eb6b5c41-1a6e-5e21-8eb9-f997eb99f8da",
        "frage_id": "F-M06-012",
        "text": "Vergleichen Sie regelmäßig geplante mit tatsächlich eingetretener Liquidität — und was tun Sie, wenn die Vorschau danebenlag?",
        "ebene": "Vertiefung",
        "unterbereich": "l2c_soll_ist",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7c5a14b0-c2a8-5fc8-97ee-0c809a1b885d",
        "frage_id": "F-M06-013",
        "text": "Wie läuft Ihr Mahnwesen (ab wann, wie automatisiert) — und welche Mandanten sind chronische Spätzahler?",
        "ebene": "Vertiefung",
        "unterbereich": "l3c_mahnwesen_dso",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "fe58accf-4835-5e4b-a28e-55e65ae93ec9",
        "frage_id": "F-M06-014",
        "text": "Wie viele Tage vergehen im Schnitt zwischen Rechnung und Zahlungseingang (DSO) — und kennen Sie diese Zahl überhaupt?",
        "ebene": "Vertiefung",
        "unterbereich": "l3c_mahnwesen_dso",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "22acc44b-bdff-5df4-9442-aa59acd0f654",
        "frage_id": "F-M06-015",
        "text": "Steuern Sie bewusst, wann Sie größere Rechnungen/Investitionen bezahlen (Timing an Zahlungseingänge koppeln) — oder wird bezahlt, sobald die Rechnung kommt?",
        "ebene": "Vertiefung",
        "unterbereich": "l4c_auszahlungs_timing",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "207d152a-eb10-5791-b6e8-5c4f1e3d6a9a",
        "frage_id": "F-M06-016",
        "text": "Welche Saison-Muster hat Ihr Zahlungseingang übers Jahr (Abschluss-/Erklärungs-Peaks, ruhige Monate) — und wo wird es regelmäßig eng?",
        "ebene": "Vertiefung",
        "unterbereich": "l5a_saison_muster",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7679a691-ce03-5268-ab27-d2d42671856a",
        "frage_id": "F-M06-017",
        "text": "Planen Sie kalkulierbare Sonder-Auszahlungen (Urlaubs-/Weihnachtsgeld, Boni, Sommer-Umsatzdelle) vorausschauend in die Liquidität ein?",
        "ebene": "Vertiefung",
        "unterbereich": "l5a_saison_muster",
        "position": 17,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "d97a1e98-8ef0-5880-a55a-a7ff16f277d7",
        "frage_id": "F-M06-018",
        "text": "Bilden Sie in umsatzstarken Monaten gezielt Rücklagen für die schwachen — oder gleicht sich das eher unstrukturiert aus?",
        "ebene": "Vertiefung",
        "unterbereich": "l5b_planung_schwankung",
        "position": 18,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0c9fe57c-f54c-5a45-aefa-f853e0e2e0cd",
        "frage_id": "F-M06-019",
        "text": "Was würde mit Ihrer Liquidität passieren, wenn Ihr größtes Mandat morgen kündigt oder drei Monate nicht zahlt — haben Sie das je durchgerechnet?",
        "ebene": "Vertiefung",
        "unterbereich": "l6c_stresstest",
        "position": 19,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "17c8be68-2331-5a18-9805-ce705597cd19",
        "frage_id": "F-M06-020",
        "text": "Ab welcher Reservegrenze würden Sie gegensteuern — und welche Hebel hätten Sie konkret (Entnahme stoppen, Linie ziehen, Kosten senken)?",
        "ebene": "Vertiefung",
        "unterbereich": "l6c_stresstest",
        "position": 20,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "209a44e6-6d9e-5b8a-a407-5a3fc37ca9d5",
        "frage_id": "F-M06-021",
        "text": "Sind Bankkonto/Zahlungsverkehr und Kanzlei-Software so verbunden, dass Sie den Liquiditätsstand ohne manuelles Zusammensuchen sehen?",
        "ebene": "Vertiefung",
        "unterbereich": "l1a_cash_sichtbarkeit",
        "position": 21,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "46fa1a2f-6fd2-5adf-ab88-2917023eb4f3",
        "frage_id": "F-M06-022",
        "text": "Bei welchem Anteil Ihres Umsatzes ist der Zahlungseingang planbar wiederkehrend (Abschlag/Lastschrift) vs. unregelmäßig?",
        "ebene": "Vertiefung",
        "unterbereich": "l3b_vorschuss_abschlag",
        "position": 22,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "146cae63-8161-5f26-9984-85edf9e6e547",
        "frage_id": "F-M06-023",
        "text": "Wie stark schwankt Ihr Personalkosten-Auszahlungsblock (Überstunden, Aushilfen, Saisonkräfte) — und ist diese Schwankung in Ihrer Vorschau abgebildet?",
        "ebene": "Vertiefung",
        "unterbereich": "l4a_personal_fixkosten",
        "position": 23,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a195138e-03bb-5c98-8f4e-ce7cc25956b4",
        "frage_id": "F-M06-024",
        "text": "Trennen Sie Kanzlei-Liquidität und private Liquidität sauber — oder fließt das faktisch ineinander?",
        "ebene": "Vertiefung",
        "unterbereich": "l6b_inhaber_entnahmen",
        "position": 24,
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
  "modul_id": "M-06",
  "modul_key": "m06",
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
    "beschreibung": "Aus den M-06-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "L1",
      "name": "Liquiditätsstatus & Reserve",
      "unterpunkte": [
        "Cash-Sichtbarkeit (Verfügbarkeit jederzeit bekannt)",
        "Reserve / Runway (Monate Fixkostendeckung)",
        "Cash ≠ Gewinn (Ergebnis- vs. Liquiditätsverständnis)"
      ]
    },
    {
      "key": "L2",
      "name": "Liquiditätsplanung & Forecast",
      "unterpunkte": [
        "Planungsinstrument & Horizont (rollierende Vorschau)",
        "Taktung & Owner (wer pflegt, wie oft)",
        "Soll-Ist-Abgleich der Vorschau"
      ]
    },
    {
      "key": "L3",
      "name": "Forderungen & Honorareinzug (Inflows)",
      "unterpunkte": [
        "Rechnungstaktung & Leistungs-Verzug (WIP→Rechnung)",
        "Vorschüsse / Abschläge / Dauermandat",
        "Mahnwesen & Zahlungsverhalten (DSO)"
      ]
    },
    {
      "key": "L4",
      "name": "Verbindlichkeiten & Auszahlungen (Outflows)",
      "unterpunkte": [
        "Personal & Fixkosten (größter Block)",
        "Eigene Steuern & Vorauszahlungen",
        "Auszahlungs-Timing / -Steuerung"
      ]
    },
    {
      "key": "L5",
      "name": "Saisonalität & Schwankungen",
      "unterpunkte": [
        "Saison-Muster (Abschluss-/Erklärungssaison, Sommerloch)",
        "Planung / Rücklage gegen Schwankung"
      ]
    },
    {
      "key": "L6",
      "name": "Puffer, Finanzierung & Stresstest",
      "unterpunkte": [
        "Kontokorrent / Finanzierungslinie",
        "Inhaber-Entnahmen vs. Kanzlei-Liquidität",
        "Stress-Szenario (Großmandat-Ausfall / Zahlungsausfall)"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M06-001",
      "name": "Automatische Liquiditäts-Ist-Sicht",
      "beschreibung": "Bank-Feed → Dashboard",
      "reifegrad": 2,
      "referenz": "L1a; F-M06-001, F-M06-021"
    },
    {
      "hebel_id": "H-M06-002",
      "name": "Rollierende Liquiditätsvorschau",
      "beschreibung": "halbautomatisch aus Wiederkehr + Fixkosten",
      "reifegrad": 2,
      "referenz": "L2a; F-M06-004, F-M06-005"
    },
    {
      "hebel_id": "H-M06-003",
      "name": "Rechnungs-Trigger bei Leistungsabschluss",
      "beschreibung": "WIP→Rechnung-Erinnerung",
      "reifegrad": 2,
      "referenz": "L3a; F-M06-006"
    },
    {
      "hebel_id": "H-M06-004",
      "name": "Offene-Posten- & Mahn-Automatik",
      "beschreibung": "",
      "reifegrad": 2,
      "referenz": "L3c; F-M06-013"
    },
    {
      "hebel_id": "H-M06-005",
      "name": "Steuer- & Fixkosten-Rücklagen-Rechner",
      "beschreibung": "automatisch zurücklegen",
      "reifegrad": 2,
      "referenz": "L4b; F-M06-009"
    },
    {
      "hebel_id": "H-M06-006",
      "name": "DSO- / Zahlungsverhalten-Analyse je Mandant",
      "beschreibung": "",
      "reifegrad": 3,
      "referenz": "L3c; F-M06-014, F-M06-022"
    },
    {
      "hebel_id": "H-M06-007",
      "name": "Auszahlungs-Timing-Assistent",
      "beschreibung": "Fälligkeiten an Cash koppeln",
      "reifegrad": 3,
      "referenz": "L4c; F-M06-015"
    },
    {
      "hebel_id": "H-M06-008",
      "name": "Saison-Liquiditäts-Prognose",
      "beschreibung": "Jahresmuster lernen",
      "reifegrad": 3,
      "referenz": "L5; F-M06-016, F-M06-018"
    },
    {
      "hebel_id": "H-M06-009",
      "name": "Liquiditäts-Stresstest / Szenario-Simulation",
      "beschreibung": "Mandatsausfall",
      "reifegrad": 3,
      "referenz": "L6c; F-M06-019, F-M06-020"
    },
    {
      "hebel_id": "H-M06-010",
      "name": "Frühwarnung Liquiditätsengpass",
      "beschreibung": "Schwellenwert-/Anomalie-Alert",
      "reifegrad": 4,
      "referenz": "L1b/L6; F-M06-002, F-M06-020"
    },
    {
      "hebel_id": "H-M06-011",
      "name": "Cash-Impact-Vorschau bei Entscheidungen",
      "beschreibung": "Einstellung/Investition/Entnahme → Liquiditätswirkung",
      "reifegrad": 4,
      "referenz": "L4a/L6b; F-M06-011, F-M06-023"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-07 · stb_modul_m07 · 9 Kern / 13 Vertiefung / 11 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m07',
  'M-07 – KPI-Set & Reporting-Struktur',
  '1.0',
  'M-07 – KPI-Set & Reporting-Struktur — StB-KERN-Cut (DEC-242). 22 Fragen (9 Kern / 13 Vertiefung), 11 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-07-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "5e9788ec-142d-5d49-9997-d29330039141",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "b84f7fe2-ab58-51ad-8a19-b1e912e4237b",
        "frage_id": "F-M07-001",
        "text": "Welche 3–5 Kennzahlen schauen Sie an, um zu beurteilen, ob Ihre Kanzlei operativ gut läuft — und steuern Sie tatsächlich danach oder schauen Sie sie nur an?",
        "ebene": "Kern",
        "unterbereich": "k1a_steuerungs_kpis",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3cffa388-7874-5db9-8324-02553a09c0bb",
        "frage_id": "F-M07-002",
        "text": "Sind diese Kennzahlen eindeutig definiert — würden Sie, Ihre Partner und Ihr Team dieselbe Zahl gleich berechnen — oder gibt es je nach Quelle unterschiedliche Werte?",
        "ebene": "Kern",
        "unterbereich": "k1b_kpi_definition",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "6465507f-0d51-59d3-a58a-b96ae72b490e",
        "frage_id": "F-M07-003",
        "text": "Kennen Sie Ihren Realisierungsgrad — welcher Anteil der geleisteten Beraterstunden am Ende tatsächlich als Honorar abgerechnet wird — und wo geht regelmäßig Honorar verloren?",
        "ebene": "Kern",
        "unterbereich": "k2a_realisierungsgrad",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "193d43a7-c1d8-56cc-bb8a-0ae1bdbfc1ef",
        "frage_id": "F-M07-004",
        "text": "Wissen Sie, wie ausgelastet Ihre einzelnen Mitarbeiter/Berater sind (produktive vs. gesamte Stunden) — und erkennen Sie Über- oder Unterlast früh genug?",
        "ebene": "Kern",
        "unterbereich": "k2b_auslastung",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "6a0f2693-8d38-51be-bf67-866b4fd90a23",
        "frage_id": "F-M07-005",
        "text": "Kennen Sie Ihren Umsatz je Kopf (und ggf. je Mandat) — und wie hat er sich in den letzten Jahren entwickelt?",
        "ebene": "Kern",
        "unterbereich": "k3a_umsatz_kopf",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "547eb261-648a-533d-b2f1-194dfb629223",
        "frage_id": "F-M07-006",
        "text": "Wissen Sie, welche Mandate oder Leistungsarten für Sie wirklich profitabel sind und welche Sie draufzahlen — oder ist das eher Bauchgefühl?",
        "ebene": "Kern",
        "unterbereich": "k3b_rentabilitaet",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "77160d21-f657-54a0-81ae-80992a86dd02",
        "frage_id": "F-M07-007",
        "text": "Welche regelmäßigen Auswertungen/Reports gibt es in Ihrer Kanzlei, und wer bekommt sie — nur Sie, die Partner, auch die Teamleitung?",
        "ebene": "Kern",
        "unterbereich": "k4a_report_set",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3f2e1fe6-592b-5178-b796-861b4d0ecfcf",
        "frage_id": "F-M07-008",
        "text": "Gibt es ein festes Ritual (z. B. monatlicher Termin), in dem diese Kennzahlen besprochen und Maßnahmen abgeleitet werden — oder werden Reports erstellt und dann abgelegt?",
        "ebene": "Kern",
        "unterbereich": "k4b_reporting_ritual",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7a29f8d4-a943-5d47-a23c-7fd3d744e9b9",
        "frage_id": "F-M07-009",
        "text": "Haben Ihre wichtigsten Kennzahlen konkrete Zielwerte (Soll), gegen die Sie den Ist messen — oder schauen Sie nur den Ist-Wert ohne Zielmarke an?",
        "ebene": "Kern",
        "unterbereich": "k5a_zielwerte",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "26c17d06-c699-5c33-9cf8-16a3895b8bbb",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "0f5da97a-6b74-5567-9490-4715f582cbfa",
        "frage_id": "F-M07-010",
        "text": "Bilden Ihre Kennzahlen sowohl die finanzielle (Umsatz, Marge) als auch die operative Seite (Durchlaufzeit, Auslastung, Qualität) ab — oder liegt der Fokus einseitig?",
        "ebene": "Vertiefung",
        "unterbereich": "k1c_finanziell_operativ",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "883396ad-962b-5af5-9370-56e8ad50a18b",
        "frage_id": "F-M07-011",
        "text": "Wie verlässlich erfassen Ihre Leute geleistete Zeit/Leistungen — vollständig und zeitnah, oder lückenhaft/nachträglich geschätzt?",
        "ebene": "Vertiefung",
        "unterbereich": "k2c_zeiterfassung",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "f2867c13-5fac-58c3-9d5b-2142751bc377",
        "frage_id": "F-M07-012",
        "text": "Wo entsteht bei Ihnen die meiste nicht abgerechnete Leistung (Nacharbeit, Kulanz, vergessene Zusatzleistungen, Pauschalen die nicht mehr passen)?",
        "ebene": "Vertiefung",
        "unterbereich": "k2a_realisierungsgrad",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "f6649033-48ff-5371-982a-73d857b0696f",
        "frage_id": "F-M07-013",
        "text": "Kennen Sie den Umsatz-/Ergebnisbeitrag je Leistungsart (FiBu, Lohn, Abschluss, Beratung) — und wissen Sie, womit Sie wachsen wollen?",
        "ebene": "Vertiefung",
        "unterbereich": "k3a_umsatz_kopf",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "355b3c8e-13ff-57e7-a274-0ed8b0cac048",
        "frage_id": "F-M07-014",
        "text": "Haben Sie Transparenz über offene, noch nicht abgerechnete Leistungen (WIP) — und wie alt werden diese, bevor sie zu Honorar werden?",
        "ebene": "Vertiefung",
        "unterbereich": "k3c_wip_offene_leistung",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "34ec7599-0e88-509a-a87c-66d2d11b21f6",
        "frage_id": "F-M07-015",
        "text": "Sehen Sie Ihre Kennzahlen in einem aktuellen Dashboard/Cockpit — oder werden sie manuell aus DATEV/Tabellen zusammengetragen, wenn Sie sie brauchen?",
        "ebene": "Vertiefung",
        "unterbereich": "k4c_dashboard",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "8c208b61-5ab8-5ba5-8259-28f0c3826aee",
        "frage_id": "F-M07-016",
        "text": "Was passiert konkret, wenn eine Kennzahl vom Ziel abweicht — gibt es eine definierte Reaktion/Maßnahme, oder bleibt es bei der Feststellung?",
        "ebene": "Vertiefung",
        "unterbereich": "k5b_abweichungs_reaktion",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "e684d7c0-649e-5b97-8013-0f9f1ec7c0d7",
        "frage_id": "F-M07-017",
        "text": "Vergleichen Sie Ihre Kennzahlen mit Vorjahr, Plan oder Branchen-Benchmarks — und wissen Sie, wo Sie im Branchenvergleich stehen (z. B. Umsatz/Kopf)?",
        "ebene": "Vertiefung",
        "unterbereich": "k5c_benchmark",
        "position": 17,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "d74dd420-847c-5e0b-b274-22d3e2014ca4",
        "frage_id": "F-M07-018",
        "text": "Aus welchen Quellen kommen Ihre Kennzahlen (DATEV, Zeiterfassung, Excel) — und wie sehr vertrauen Sie den Zahlen, ohne sie zu prüfen?",
        "ebene": "Vertiefung",
        "unterbereich": "k6a_datenquelle",
        "position": 18,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a9aeb587-6f02-57ea-9812-cc93340d729d",
        "frage_id": "F-M07-019",
        "text": "Wer in Ihrer Kanzlei ist dafür verantwortlich, dass die Kennzahlen richtig, aktuell und einheitlich sind — oder macht das nebenbei jeder/keiner?",
        "ebene": "Vertiefung",
        "unterbereich": "k6b_kpi_owner",
        "position": 19,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "ff5a81ea-6104-5dfc-917a-3243ec31f1bc",
        "frage_id": "F-M07-020",
        "text": "Wie viel manueller Aufwand steckt heute im Erstellen Ihres Reportings — und was davon ließe sich automatisieren?",
        "ebene": "Vertiefung",
        "unterbereich": "k6c_automatisierung",
        "position": 20,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "6f0d369d-4459-5d54-b97c-f8c2c8090588",
        "frage_id": "F-M07-021",
        "text": "Nutzen Sie Ihre Auslastungszahlen aktiv für Kapazitäts-/Einstellungsentscheidungen — oder werden sie erst betrachtet, wenn es brennt?",
        "ebene": "Vertiefung",
        "unterbereich": "k2b_auslastung",
        "position": 21,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "54b0d765-d519-5127-95dc-31eaf6ae490a",
        "frage_id": "F-M07-022",
        "text": "Haben Sie neben rückblickenden Zahlen auch Frühindikatoren (Pipeline neuer Mandate, offene Angebote, Kündigungen) im Blick?",
        "ebene": "Vertiefung",
        "unterbereich": "k1a_steuerungs_kpis",
        "position": 22,
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
  "modul_id": "M-07",
  "modul_key": "m07",
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
    "beschreibung": "Aus den M-07-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "K1",
      "name": "Kennzahlen-Set & Definition",
      "unterpunkte": [
        "Steuerungs-KPIs (welche Zahlen steuern die Kanzlei)",
        "KPI-Definition / Eindeutigkeit (rechnet jeder gleich)",
        "Finanziell vs. operativ (Balance der Kennzahlen)"
      ]
    },
    {
      "key": "K2",
      "name": "Produktivität & Realisierung",
      "unterpunkte": [
        "Realisierungsgrad (verrechenbar/geleistet, Honorar-Leckage)",
        "Produktive Auslastung je Mitarbeiter",
        "Zeit-/Leistungserfassung als Grundlage"
      ]
    },
    {
      "key": "K3",
      "name": "Umsatz & Rentabilität",
      "unterpunkte": [
        "Umsatz je Kopf / je Mandat",
        "Mandanten-/Leistungs-Rentabilität (Deckungsbeitrag)",
        "Offene Leistungen / WIP-Transparenz"
      ]
    },
    {
      "key": "K4",
      "name": "Reporting-Struktur & Taktung",
      "unterpunkte": [
        "Report-Set & Empfänger",
        "Frequenz & Ritual (Steuerungsmeeting)",
        "Dashboard vs. manuell"
      ]
    },
    {
      "key": "K5",
      "name": "Ziele, Soll-Werte & Benchmarks",
      "unterpunkte": [
        "Zielwerte / Soll je KPI",
        "Abweichungs-Reaktion / Maßnahme",
        "Benchmark (Vorjahr / Plan / Branche)"
      ]
    },
    {
      "key": "K6",
      "name": "Datengrundlage & KPI-Governance",
      "unterpunkte": [
        "Datenquelle & Verlässlichkeit",
        "KPI-Owner & Pflege",
        "Automatisierung der Erhebung"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M07-001",
      "name": "KPI-Cockpit / Live-Dashboard",
      "beschreibung": "DATEV + Zeiterfassung → Cockpit",
      "reifegrad": 2,
      "referenz": "K4c/K1a; F-M07-001, F-M07-015"
    },
    {
      "hebel_id": "H-M07-002",
      "name": "Realisierungsgrad-Auswertung",
      "beschreibung": "automatisch aus Zeit-/Abrechnungsdaten",
      "reifegrad": 2,
      "referenz": "K2a; F-M07-003, F-M07-012"
    },
    {
      "hebel_id": "H-M07-003",
      "name": "Auslastungs-/Kapazitäts-Monitor je Mitarbeiter",
      "beschreibung": "",
      "reifegrad": 2,
      "referenz": "K2b; F-M07-004, F-M07-021"
    },
    {
      "hebel_id": "H-M07-004",
      "name": "WIP- / Offene-Leistungen-Tracker",
      "beschreibung": "Alterung",
      "reifegrad": 2,
      "referenz": "K3c; F-M07-014"
    },
    {
      "hebel_id": "H-M07-005",
      "name": "Automatisiertes Report-Generieren + Kommentar",
      "beschreibung": "",
      "reifegrad": 2,
      "referenz": "K4a; F-M07-007, F-M07-020"
    },
    {
      "hebel_id": "H-M07-006",
      "name": "Mandanten-/Leistungs-Rentabilitäts-Analyse",
      "beschreibung": "",
      "reifegrad": 3,
      "referenz": "K3b; F-M07-006, F-M07-013"
    },
    {
      "hebel_id": "H-M07-007",
      "name": "KPI-Definitions-Katalog / Single Source",
      "beschreibung": "einheitliche Berechnung",
      "reifegrad": 3,
      "referenz": "K1b/K6a; F-M07-002, F-M07-018"
    },
    {
      "hebel_id": "H-M07-008",
      "name": "Ziel-Ist-Abweichungs-Assistent",
      "beschreibung": "Alert + Maßnahmenvorschlag",
      "reifegrad": 3,
      "referenz": "K5a/K5b; F-M07-009, F-M07-016"
    },
    {
      "hebel_id": "H-M07-009",
      "name": "Branchen-Benchmark-Einordnung",
      "beschreibung": "",
      "reifegrad": 3,
      "referenz": "K5c; F-M07-017"
    },
    {
      "hebel_id": "H-M07-010",
      "name": "Frühindikator- / Pipeline-Radar",
      "beschreibung": "vorlaufende Steuerung",
      "reifegrad": 4,
      "referenz": "K1a; F-M07-022"
    },
    {
      "hebel_id": "H-M07-011",
      "name": "Datenqualitäts- / KPI-Konsistenz-Check vor Reporting",
      "beschreibung": "",
      "reifegrad": 4,
      "referenz": "K6a/K6b; F-M07-018, F-M07-019"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-08 · stb_modul_m08 · 9 Kern / 8 Vertiefung / 8 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m08',
  'M-08 – Vertriebsstrategie & Zielkunden',
  '1.0',
  'M-08 – Vertriebsstrategie & Zielkunden — StB-KERN-Cut (DEC-242). 17 Fragen (9 Kern / 8 Vertiefung), 8 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-08-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "5a06bc70-a113-571a-8a1d-853531208b99",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "36ec89d7-6b56-5c54-9eb6-2a7b0da7277f",
        "frage_id": "F-M08-001",
        "text": "Haben Sie ein klares Bild Ihres Wunschmandanten — welche Branchen, Größen und Bedarfe zu Ihnen passen — oder nehmen Sie im Grunde jeden, der anfragt?",
        "ebene": "Kern",
        "unterbereich": "v1a_wunschmandate",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "93b4f243-4366-59a6-ba33-935f152b3113",
        "frage_id": "F-M08-002",
        "text": "Haben Sie einen bewussten Fokus (bestimmte Zielgruppen/Leistungen), auf den Sie Ihren Vertrieb ausrichten — oder ist Ihre Mandantschaft eher bunt zusammengewachsen?",
        "ebene": "Kern",
        "unterbereich": "v1b_fokus_vs_alle",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "620f5bb3-d9f1-544f-99f3-ed27727f9819",
        "frage_id": "F-M08-003",
        "text": "Haben Sie ein konkretes Wachstums-/Vertriebsziel — mehr Mandate, größere, höherwertige — und wissen Sie, in welche Richtung Sie den Bestand entwickeln wollen?",
        "ebene": "Kern",
        "unterbereich": "v2a_wachstumsziel",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "b9cd5f83-88c9-5229-8859-431c8e3ff7b3",
        "frage_id": "F-M08-004",
        "text": "Gewinnen Sie neue Mandate über eine bewusste Vertriebsstrategie — oder kommt Neugeschäft im Wesentlichen über Empfehlung und Zufall, ohne dass Sie es aktiv steuern?",
        "ebene": "Kern",
        "unterbereich": "v2b_strategie_bewusst",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "b21feb31-3a12-5b17-805a-fe1e87ca8ca2",
        "frage_id": "F-M08-005",
        "text": "Woher kommen Ihre neuen Mandate heute überwiegend (Empfehlung, Bestand, aktive Akquise, Online, Zufall) — und wie verlässlich ist diese Quelle für Ihr Wachstum?",
        "ebene": "Kern",
        "unterbereich": "v3a_neugeschaeft_quelle",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "d2731719-b8bd-5ffd-a174-a7025b4525ab",
        "frage_id": "F-M08-006",
        "text": "Betreiben Sie überhaupt aktive Akquise (gezielt auf Wunschmandate zugehen) — oder ist Ihr Vertrieb rein passiv, Sie warten, bis jemand anfragt?",
        "ebene": "Kern",
        "unterbereich": "v3b_aktive_akquise",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "ce4c6fb7-7279-577e-b7fe-27538058813a",
        "frage_id": "F-M08-007",
        "text": "Erkennen Sie bei Ihren Bestandsmandanten aktiv, wo betriebswirtschaftlicher Beratungsbedarf besteht — oder bleibt es bei der Pflicht-Compliance, weil niemand systematisch danach schaut?",
        "ebene": "Kern",
        "unterbereich": "v4a_beratungsbedarf_mandanten",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a97994a0-cf84-5ecb-8d8e-c7185412a8c3",
        "frage_id": "F-M08-008",
        "text": "Bei welchem Anteil Ihrer Mandanten sprechen Sie aktiv über betriebswirtschaftliche Themen statt nur Pflicht-Compliance — und wer beginnt dieses Gespräch, Sie oder der Mandant?",
        "ebene": "Kern",
        "unterbereich": "v4b_wer_beginnt_gespraech",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0866cd54-09df-5028-b1de-dcfd89f81df1",
        "frage_id": "F-M08-009",
        "text": "Was erwarten Ihre Mandanten heute von Ihnen, das über die reine Steuer-/Compliance-Pflicht hinausgeht — und wie gut können Sie diese Erwartung aktuell bedienen?",
        "ebene": "Kern",
        "unterbereich": "v5a_erwartung_verstehen",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "4256cc76-6156-5e2a-bba4-0940609904fa",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "69d191a5-2242-5154-8d7b-9b094e064f51",
        "frage_id": "F-M08-010",
        "text": "Haben Sie Kriterien, nach denen Sie Mandate bewusst annehmen oder ablehnen — oder sagen Sie faktisch zu allem ja, auch zu Mandaten, die schlecht passen oder sich nicht rechnen?",
        "ebene": "Vertiefung",
        "unterbereich": "v1c_mandatsannahme_kriterien",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "ce88c90b-e1b8-5be8-97d6-39e1e6d050b4",
        "frage_id": "F-M08-011",
        "text": "Passt Ihr Wachstums-/Vertriebsziel zu Ihrer Kapazität — könnten Sie neue Mandate überhaupt bedienen, oder müssten Sie eher bremsen, weil das Team schon voll ist?",
        "ebene": "Vertiefung",
        "unterbereich": "v2c_kapazitaet_wachstum",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "9bf19e85-0212-583e-83d1-7213a8808da8",
        "frage_id": "F-M08-012",
        "text": "Gibt es bei Ihnen einen strukturierten Weg vom Erstkontakt bis zum unterschriebenen Mandat (Erstgespräch, Angebot, Nachfassen) — oder läuft jeder Neukontakt individuell und ohne roten Faden?",
        "ebene": "Vertiefung",
        "unterbereich": "v3c_vertriebsprozess",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2ea51959-d2d3-553a-9d53-c3ab57954c39",
        "frage_id": "F-M08-013",
        "text": "Verkaufen Sie systematisch zusätzliche Leistungen an Bestandsmandanten (Cross-/Up-Sell) — oder bleibt viel Potenzial liegen, weil das Mehr-Anbieten niemand aktiv macht?",
        "ebene": "Vertiefung",
        "unterbereich": "v4c_cross_up_sell",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "189521d8-4488-5156-bb40-fefaacdc9677",
        "frage_id": "F-M08-014",
        "text": "Passt Ihr heutiges Leistungsangebot zu dem, was Ihre (Wunsch-)Mandanten erwarten — oder gibt es eine Lücke zwischen dem, was Sie anbieten, und dem, was gefragt ist?",
        "ebene": "Vertiefung",
        "unterbereich": "v5b_angebot_passung",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0a10a0f8-1323-5e3f-b5e3-8b1902d5b219",
        "frage_id": "F-M08-015",
        "text": "Wenn ein Wunschmandant Sie mit anderen Kanzleien vergleicht — wissen Sie, warum er sich für Sie entscheidet, und bringen Sie diesen Grund im Vertriebsgespräch aktiv rüber?",
        "ebene": "Vertiefung",
        "unterbereich": "v5c_wettbewerb_differenzierung",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "53f7a8b5-d6b3-54d1-be4f-8d4795de2aa2",
        "frage_id": "F-M08-016",
        "text": "Steuern Sie Ihren Vertrieb mit Zielen und Kennzahlen (Neumandate, Angebotsquote, Beratungsumsatz) — oder machen Sie Vertrieb rein nach Gefühl, ohne zu messen, was funktioniert?",
        "ebene": "Vertiefung",
        "unterbereich": "v6a_vertriebssteuerung",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "13ad9fd8-9ed8-571a-a854-d239a1b359ed",
        "frage_id": "F-M08-017",
        "text": "Hängt Ihr Neugeschäft ausschließlich an Ihnen als Inhaber — kämen ohne Sie kaum neue Mandate rein — oder gibt es weitere Personen/Wege, über die Vertrieb passiert?",
        "ebene": "Vertiefung",
        "unterbereich": "v6c_neugeschaeft_inhaberabhaengig",
        "position": 17,
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
  "modul_id": "M-08",
  "modul_key": "m08",
  "modul_kategorie": "Vertrieb – Unternehmenssystem",
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
    "beschreibung": "Aus den M-08-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "V1",
      "name": "Zielkunden & Fokus",
      "unterpunkte": [
        "Wunschmandats-/Zielkunden-Definition (Branche, Größe, Bedarf)",
        "Klarer Vertriebs-Fokus vs. „jedes Mandat nehmen\" (Grenze: Spezialisierung als Modell → M-01 b6c)",
        "Bewusste Annahme-/Ablehnungskriterien"
      ]
    },
    {
      "key": "V2",
      "name": "Vertriebsstrategie & Wachstumsziel",
      "unterpunkte": [
        "Wachstums-/Vertriebsziel (mehr/größer/höherwertig — Grenze: Erlös-Modell → M-01)",
        "Bewusste Vertriebsstrategie vs. Empfehlung/Zufall",
        "Vertriebsziel ↔ Kapazität (Grenze: Personalkapazität → M-26)"
      ]
    },
    {
      "key": "V3",
      "name": "Mandantengewinnung & Neugeschäft",
      "unterpunkte": [
        "Woher neue Mandate kommen (Grenze: Kanäle systematisch → M-16)",
        "Aktive Akquise vs. rein passiv",
        "Prozess Erstkontakt→Mandat (Grenze: CRM/Pipeline-Tool → M-10)"
      ]
    },
    {
      "key": "V4",
      "name": "Beratungsverkauf & Cross-/Up-Sell",
      "unterpunkte": [
        "Beratungsbedarf bei Bestandsmandanten erkennen (c1)",
        "Wer beginnt das Beratungsgespräch — Sie oder Mandant",
        "Systematischer Cross-/Up-Sell (Grenze: Retention → M-11)"
      ]
    },
    {
      "key": "V5",
      "name": "Mandanten-Erwartung & Angebots-Passung",
      "unterpunkte": [
        "Erwartung über Compliance hinaus verstehen (c1)",
        "Angebot ↔ Erwartung, Lücke (Grenze: Leistungsportfolio-Modell → M-01)",
        "Vertriebliche Differenzierung im Gespräch (Grenze: Botschaft → M-15)"
      ]
    },
    {
      "key": "V6",
      "name": "Vertriebssteuerung & -reife",
      "unterpunkte": [
        "Vertriebsziele/Kennzahlen/Nachverfolgung (Grenze: KPI-System → M-07)",
        "Wer ist für Vertrieb verantwortlich (Grenze: Rollen/Governance → M-02/M-03)",
        "Hängt Neugeschäft ausschließlich am Inhaber (Grenze: → M-42/M-02)"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M08-001",
      "name": "Wunschmandanten-/Zielkunden-Profil",
      "beschreibung": "ideales Mandantenprofil schärfen: Branche, Größe, Bedarf, Passung",
      "reifegrad": 2,
      "referenz": "V1; F-M08-001, F-M08-002, F-M08-010"
    },
    {
      "hebel_id": "H-M08-002",
      "name": "Vertriebsstrategie-/Wachstums-Planer",
      "beschreibung": "Wachstumsziel + Weg + Kapazitätsabgleich",
      "reifegrad": 2,
      "referenz": "V2; F-M08-003, F-M08-004, F-M08-011"
    },
    {
      "hebel_id": "H-M08-003",
      "name": "Akquise-/Neugeschäfts-Quellen-Analyse",
      "beschreibung": "woher Mandate kommen, wie verlässlich, wo aktiv werden",
      "reifegrad": 2,
      "referenz": "V3; F-M08-005, F-M08-006 (Grenze: Kanal-Tooling → M-16)"
    },
    {
      "hebel_id": "H-M08-004",
      "name": "Beratungsbedarf-Radar Bestandsmandanten",
      "beschreibung": "aus Mandantendaten Beratungs-/Cross-Sell-Chancen erkennen",
      "reifegrad": 3,
      "referenz": "V4; F-M08-007, F-M08-013"
    },
    {
      "hebel_id": "H-M08-005",
      "name": "Beratungsgespräch-/Cross-Sell-Assistent",
      "beschreibung": "Gesprächsleitfaden, wann welche Beratung ansprechen",
      "reifegrad": 2,
      "referenz": "V4b; F-M08-008"
    },
    {
      "hebel_id": "H-M08-006",
      "name": "Angebots-/Passungs-Check",
      "beschreibung": "Angebot vs. Mandanten-Erwartung, Lücken sichtbar",
      "reifegrad": 2,
      "referenz": "V5; F-M08-009, F-M08-014"
    },
    {
      "hebel_id": "H-M08-007",
      "name": "Vertriebsprozess-/Pipeline-Struktur",
      "beschreibung": "Erstkontakt→Mandat strukturieren, Nachfass-Erinnerung",
      "reifegrad": 3,
      "referenz": "V3c; F-M08-012"
    },
    {
      "hebel_id": "H-M08-008",
      "name": "Vertriebs-Reife-Radar",
      "beschreibung": "läuft Neugeschäft systematisch, gesteuert & inhaberunabhängig — Gesamtbild Vertriebsreife",
      "reifegrad": 4,
      "referenz": "V6; F-M08-016, F-M08-017"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-15 · stb_modul_m15 · 9 Kern / 8 Vertiefung / 8 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m15',
  'M-15 – Positionierung & Kernbotschaften',
  '1.0',
  'M-15 – Positionierung & Kernbotschaften — StB-KERN-Cut (DEC-242). 17 Fragen (9 Kern / 8 Vertiefung), 8 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-15-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "4d085283-2f30-5fe9-ae87-7bff1557ec67",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "960c24b8-fafa-5f60-bff9-745b66d1dfff",
        "frage_id": "F-M15-001",
        "text": "Wofür steht Ihre Kanzlei nach außen — wie würden Sie in ein, zwei Sätzen sagen, was Sie ausmacht und für wen Sie da sind?",
        "ebene": "Kern",
        "unterbereich": "m1a_positionierung_kern",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "1c429f42-f4e3-51bc-b69d-c79fce7217b1",
        "frage_id": "F-M15-002",
        "text": "Positionieren Sie sich als Generalist (alles für alle) oder als spezialisierte Kanzlei (Branche, Leistung, Zielgruppe) — und ist das eine bewusste Entscheidung?",
        "ebene": "Kern",
        "unterbereich": "m1b_generalist_spezialist",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "eca0d1fe-918b-525a-b517-819a6d37f5ea",
        "frage_id": "F-M15-003",
        "text": "Haben Sie ein klares Nutzenversprechen — was ein Mandant konkret davon hat, mit Ihnen zu arbeiten, das über „wir machen Ihre Steuer\" hinausgeht?",
        "ebene": "Kern",
        "unterbereich": "m2a_nutzenversprechen",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "b0d1438b-562c-5fe8-b388-132c6f8d3d00",
        "frage_id": "F-M15-004",
        "text": "Gibt es definierte Kernbotschaften, die Sie konsistent nach außen tragen — oder wirkt Ihr Auftritt eher austauschbar wie bei jeder anderen Kanzlei?",
        "ebene": "Kern",
        "unterbereich": "m2b_kernbotschaften",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5757e0a7-76f2-5358-8f8c-789fb7475a0e",
        "frage_id": "F-M15-005",
        "text": "Worin sind Sie erkennbar anders oder besser als vergleichbare Kanzleien in Ihrer Region/Ihrem Feld — und können Sie das konkret benennen?",
        "ebene": "Kern",
        "unterbereich": "m3a_differenzierung",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "ae629a32-9966-5f2f-9dc6-16eaa6084b6e",
        "frage_id": "F-M15-006",
        "text": "Wenn ein Wunschmandant Sie mit drei anderen Kanzleien vergleicht — was ist der eine Grund, warum er Sie nimmt, der nicht „Preis\" oder „Nähe\" ist?",
        "ebene": "Kern",
        "unterbereich": "m3b_warum_uns",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "741af69e-cb08-55af-a3ff-e653782480a6",
        "frage_id": "F-M15-007",
        "text": "Ist Ihre Außenbotschaft auf Ihre Wunschmandanten zugeschnitten — sprechen Sie deren Sprache und deren konkrete Themen an — oder ist sie allgemein „für jeden\"?",
        "ebene": "Kern",
        "unterbereich": "m4a_zielgruppen_ansprache",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "d86255dd-4643-5717-9c77-7c672e53ddcb",
        "frage_id": "F-M15-008",
        "text": "Positionieren Sie sich nach außen erkennbar als betriebswirtschaftlicher Berater/Partner — oder werden Sie primär als Erfüller der Steuer-/Compliance-Pflicht wahrgenommen?",
        "ebene": "Kern",
        "unterbereich": "m4b_beratungs_positionierung",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "bc0467bd-d762-5a07-8c19-a0c9f0d53469",
        "frage_id": "F-M15-009",
        "text": "Ist Ihre Positionierung bewusst geschärft und gewählt — oder eher über die Jahre so entstanden, sodass Sie im Grunde „alles für alle\" machen?",
        "ebene": "Kern",
        "unterbereich": "m6a_bewusst_vs_beliebig",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "aef5b27e-ce3e-585c-968e-7487f0c8162e",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "11906f7a-d1c9-5a5e-9b10-f025651933d4",
        "frage_id": "F-M15-010",
        "text": "Deckt sich Ihr Selbstbild mit dem, wie Ihre Mandanten Sie tatsächlich sehen — haben Sie das je gefragt — oder könnten da Welten dazwischen liegen?",
        "ebene": "Vertiefung",
        "unterbereich": "m1c_selbstbild_fremdbild",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "1f0b880f-29ba-5a0c-aef1-5f2fc15ca686",
        "frage_id": "F-M15-011",
        "text": "Womit belegen Sie Ihr Nutzenversprechen nach außen (Referenzen, konkrete Ergebnisse, Fallbeispiele) — oder bleibt es bei Behauptungen ohne Beweis?",
        "ebene": "Vertiefung",
        "unterbereich": "m2c_beweis_belege",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "67dd6d4e-706b-5fbb-bb15-01c4e936ddbc",
        "frage_id": "F-M15-012",
        "text": "Wissen Sie, wie sich Ihr relevanter Wettbewerb positioniert und wo Sie im Vergleich stehen — oder haben Sie das nie systematisch angeschaut?",
        "ebene": "Vertiefung",
        "unterbereich": "m3c_wettbewerbsbild",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "285cbe4e-52d0-5b0c-88d3-6ba9573b0e3d",
        "frage_id": "F-M15-013",
        "text": "Adressiert Ihre Botschaft die echten Sorgen und Bedarfe Ihrer Zielgruppe (z. B. Digitalisierung, Nachfolge, Liquidität) — oder redet sie an dem vorbei, was Mandanten wirklich umtreibt?",
        "ebene": "Vertiefung",
        "unterbereich": "m4c_relevanz_pain",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "65e345b8-3d04-5ecd-8e88-40d424adab6c",
        "frage_id": "F-M15-014",
        "text": "Sind Ihr Außenauftritt und Ihre Materialien (Website, Kanzleibroschüre, Erstgespräch, Signatur) konsistent zu Ihrer Positionierung — oder sendet jeder Kontaktpunkt eine andere Botschaft?",
        "ebene": "Vertiefung",
        "unterbereich": "m5a_auftritt_konsistenz",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "94497138-62ef-5105-a28e-79de6c96b941",
        "frage_id": "F-M15-015",
        "text": "Können Ihre Mitarbeiter die Positionierung der Kanzlei erklären und tragen sie sie im Mandantenkontakt mit — oder lebt die Positionierung nur in Ihrem Kopf?",
        "ebene": "Vertiefung",
        "unterbereich": "m5c_botschaft_gelebt",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "9814d555-7bc1-57e1-8a78-7e3db1af7db9",
        "frage_id": "F-M15-016",
        "text": "Passt Ihre Positionierung noch zu einer Zukunft, in der KI die Routine übernimmt und Mandanten Beratung erwarten — oder positionieren Sie sich noch über etwas, das an Wert verliert?",
        "ebene": "Vertiefung",
        "unterbereich": "m6b_zukunftsfaehig",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2a67cad7-cedf-5ce6-b72d-83ca2a634fed",
        "frage_id": "F-M15-017",
        "text": "Überprüfen und schärfen Sie Ihre Positionierung regelmäßig — oder ist sie einmal entstanden und seither unverändert, obwohl sich Markt und Mandanten geändert haben?",
        "ebene": "Vertiefung",
        "unterbereich": "m6c_pflege_weiterentwicklung",
        "position": 17,
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
  "modul_id": "M-15",
  "modul_key": "m15",
  "modul_kategorie": "Marketing & Leadgenerierung",
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
    "beschreibung": "Aus den M-15-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "M1",
      "name": "Positionierung & Selbstverständnis",
      "unterpunkte": [
        "Wofür die Kanzlei nach außen steht",
        "Generalist vs. spezialisiert (Grenze: Modell → M-01 b6c, Zielkunden-Fokus → M-08 V1)",
        "Selbstbild vs. Mandanten-Wahrnehmung"
      ]
    },
    {
      "key": "M2",
      "name": "Nutzenversprechen & Kernbotschaften",
      "unterpunkte": [
        "Klares Nutzenversprechen (warum-uns)",
        "Definierte Kernbotschaften vs. austauschbar",
        "Belege/Beweise für das Versprechen (Referenzen, Ergebnisse)"
      ]
    },
    {
      "key": "M3",
      "name": "Differenzierung & Wettbewerb",
      "unterpunkte": [
        "Worin erkennbar anders/besser als andere Kanzleien",
        "Der eine Grund, warum ein Wunschmandant kommt (nicht Preis/Nähe)",
        "Kenntnis des relevanten Wettbewerbs & eigene Position"
      ]
    },
    {
      "key": "M4",
      "name": "Zielgruppen-Botschaft & Relevanz",
      "unterpunkte": [
        "Botschaft auf Zielgruppe zugeschnitten (Grenze: Zielkunden-Definition → M-08 V1)",
        "Positionierung als Berater (nicht nur Compliance) — c1",
        "Botschaft adressiert echte Pains der Zielgruppe"
      ]
    },
    {
      "key": "M5",
      "name": "Außenauftritt & Konsistenz",
      "unterpunkte": [
        "Website/Materialien/Kontaktpunkte konsistent zur Positionierung (Grenze: Kanäle → M-16)",
        "Wahrnehmung als das, was man sein will (Grenze: Reputation → M-18, Kanäle → M-16)",
        "Positionierung intern gelebt/getragen (Team kann sie erklären)"
      ]
    },
    {
      "key": "M6",
      "name": "Positionierungs-Reife & Weiterentwicklung",
      "unterpunkte": [
        "Bewusst geschärft vs. „alles für alle\"",
        "Passt zur Zukunft (Beratung/KI/Spezialisierung) (Grenze: Modell → M-01 b6)",
        "Regelmäßig überprüft/geschärft"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M15-001",
      "name": "Positionierungs-Schärfer",
      "beschreibung": "Positionierung + Nutzenversprechen + Kernbotschaften herausarbeiten",
      "reifegrad": 2,
      "referenz": "M1/M2; F-M15-001, F-M15-003, F-M15-004"
    },
    {
      "hebel_id": "H-M15-002",
      "name": "Differenzierungs-/Warum-uns-Finder",
      "beschreibung": "den einen Grund herausarbeiten, der nicht Preis/Nähe ist",
      "reifegrad": 2,
      "referenz": "M3; F-M15-005, F-M15-006"
    },
    {
      "hebel_id": "H-M15-003",
      "name": "Selbstbild-/Fremdbild-Abgleich",
      "beschreibung": "Mandanten-Feedback strukturiert gegen die eigene Positionierung spiegeln",
      "reifegrad": 3,
      "referenz": "M1c; F-M15-010"
    },
    {
      "hebel_id": "H-M15-004",
      "name": "Zielgruppen-Botschafts-Generator",
      "beschreibung": "Botschaften pro Wunsch-Zielgruppe/Pain formulieren",
      "reifegrad": 2,
      "referenz": "M4; F-M15-007, F-M15-013"
    },
    {
      "hebel_id": "H-M15-005",
      "name": "Beratungs-Positionierungs-Assistent",
      "beschreibung": "von Compliance-Erfüller zu Berater-Wahrnehmung, Botschaften + Belege",
      "reifegrad": 2,
      "referenz": "M4b; F-M15-008, F-M15-011"
    },
    {
      "hebel_id": "H-M15-006",
      "name": "Wettbewerbs-Positionierungs-Analyse",
      "beschreibung": "Positionierung relevanter Kanzleien + eigene Lücke/Chance",
      "reifegrad": 3,
      "referenz": "M3c; F-M15-012"
    },
    {
      "hebel_id": "H-M15-007",
      "name": "Auftritts-Konsistenz-Check",
      "beschreibung": "Website/Materialien/Kontaktpunkte gegen die Positionierung prüfen",
      "reifegrad": 2,
      "referenz": "M5a; F-M15-014, F-M15-015"
    },
    {
      "hebel_id": "H-M15-008",
      "name": "Positionierungs-Reife-Radar",
      "beschreibung": "bewusst geschärft, zukunftsfähig, gelebt, konsistent — Gesamtbild",
      "reifegrad": 4,
      "referenz": "M1–M6; F-M15-006, F-M15-009, F-M15-016"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-16 · stb_modul_m16 · 9 Kern / 8 Vertiefung / 8 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m16',
  'M-16 – Leadgenerierung & Kanäle',
  '1.0',
  'M-16 – Leadgenerierung & Kanäle — StB-KERN-Cut (DEC-242). 17 Fragen (9 Kern / 8 Vertiefung), 8 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-16-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "dc6b4ae8-41a9-50a9-af5d-555468c9efcd",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "cc35b46d-14fe-59d2-b8f4-70030b16fc53",
        "frage_id": "F-M16-001",
        "text": "Über welche Kanäle kommen Ihre Anfragen heute konkret rein (Empfehlung, Website, Google, Messen/Events, Partner/Multiplikatoren, aktive Ansprache) — und wie verteilt sich das ungefähr?",
        "ebene": "Kern",
        "unterbereich": "w1a_kanal_mix",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a20558f8-7f08-5be8-a4e2-1aa76c4aa135",
        "frage_id": "F-M16-002",
        "text": "Wie stark hängt Ihr Neugeschäft an Empfehlung und Mundpropaganda — und was würde passieren, wenn dieser Strom versiegt, weil z. B. ältere Stammmandanten wegfallen?",
        "ebene": "Kern",
        "unterbereich": "w1b_empfehlungs_abhaengigkeit",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "04bd177b-9cdd-5eca-a4b0-e5597892f777",
        "frage_id": "F-M16-003",
        "text": "Läuft Ihre Mandantengewinnung systematisch (planbare, wiederkehrende Kanäle) — oder kommt Neugeschäft eher zufällig, ohne dass Sie steuern könnten, wie viel reinkommt?",
        "ebene": "Kern",
        "unterbereich": "w2a_systematik",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "63ccc87e-a00e-5644-a043-678f82fb0b03",
        "frage_id": "F-M16-004",
        "text": "Gewinnen Sie Mandate eher inbound (Interessenten kommen zu Ihnen) oder outbound (Sie gehen aktiv auf Zielmandate zu) — und welche Richtung funktioniert bei Ihnen überhaupt?",
        "ebene": "Kern",
        "unterbereich": "w2b_inbound_outbound",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "9e632923-e0a9-5990-9f82-99fecaaed02e",
        "frage_id": "F-M16-005",
        "text": "Ist Ihre Website ein aktiver Lead-Kanal (Interessenten finden Sie und melden sich) — oder eher eine digitale Visitenkarte, über die faktisch nichts reinkommt?",
        "ebene": "Kern",
        "unterbereich": "w3a_website_lead",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "dbf09875-85b4-5ba0-8c47-3523cd128dbb",
        "frage_id": "F-M16-006",
        "text": "Bitten Sie aktiv und systematisch um Empfehlungen (bei zufriedenen Mandanten, in passenden Momenten) — oder hoffen Sie eher passiv darauf, dass Empfehlungen von selbst kommen?",
        "ebene": "Kern",
        "unterbereich": "w4a_empfehlung_aktiv",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "bb9131bb-73ce-5bf6-8cf0-6192e16e1fa0",
        "frage_id": "F-M16-007",
        "text": "Wie schnell und verlässlich reagieren Sie auf eine neue Anfrage — meldet sich jemand innerhalb eines Tages verbindlich, oder bleiben Anfragen auch mal liegen?",
        "ebene": "Kern",
        "unterbereich": "w5a_reaktion_geschwindigkeit",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "6da02831-53b0-50e1-b999-8e40cf515dbf",
        "frage_id": "F-M16-008",
        "text": "Werden Interessenten, die nicht sofort Mandant werden, systematisch nachverfolgt — oder versanden solche Kontakte, weil sich niemand mehr meldet?",
        "ebene": "Kern",
        "unterbereich": "w5b_lead_nachverfolgung",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a8f67cfb-8c15-5173-b24f-51f655c804e9",
        "frage_id": "F-M16-009",
        "text": "Wissen Sie, welcher Kanal Ihnen wie viele und welche Mandate bringt — messen Sie die Herkunft Ihrer Anfragen — oder ist das reines Bauchgefühl?",
        "ebene": "Kern",
        "unterbereich": "w6a_messung_steuerung",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "b7506f98-aead-5f90-ae2e-474293c38cf7",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "19f1faa3-72f6-5bf1-8dd3-55b49b730e67",
        "frage_id": "F-M16-010",
        "text": "Welcher Ihrer Kanäle bringt die besten Mandate (passend, rentabel) — und stecken Sie Ihre Energie in die wirksamen Kanäle oder gießen Sie mit der Kanne?",
        "ebene": "Vertiefung",
        "unterbereich": "w1c_kanal_wirksamkeit",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "86c42ff0-fba6-5870-b6af-fbf07c23ece1",
        "frage_id": "F-M16-011",
        "text": "Betreiben Sie Leadgenerierung kontinuierlich — oder erst dann, wenn die Auslastung sinkt und dann hektisch (Feuerwehr-Modus)?",
        "ebene": "Vertiefung",
        "unterbereich": "w2c_kontinuitaet",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "39c0697f-4e28-5ca4-a0f2-187480cf6bfd",
        "frage_id": "F-M16-012",
        "text": "Sind Sie online auffindbar, wenn ein Wunschmandant in Ihrer Region nach einer Kanzlei/Ihrem Spezialthema sucht — oder taucht der Wettbewerb auf und Sie nicht?",
        "ebene": "Vertiefung",
        "unterbereich": "w3b_auffindbarkeit",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "bb937651-52bc-596b-81f2-194fcb84581a",
        "frage_id": "F-M16-013",
        "text": "Wie ist Ihre digitale Präsenz insgesamt aufgestellt (Website, Einträge, Bewertungen, ggf. Fachbeiträge) — passend für eine Kanzlei, die in 5 Jahren noch Mandate gewinnen will?",
        "ebene": "Vertiefung",
        "unterbereich": "w3c_digitale_praesenz",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "1b0f2ac3-94e8-5397-bdc2-7245f56fd9fc",
        "frage_id": "F-M16-014",
        "text": "Nutzen Sie Multiplikatoren und Kooperationen als Lead-Quelle (Banken, Unternehmensberater, Rechtsanwälte, Verbände, Kammern) — oder ist dieses Netzwerk-Potenzial ungenutzt?",
        "ebene": "Vertiefung",
        "unterbereich": "w4b_multiplikatoren_partner",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "689a3237-0b4c-59e2-9228-ffdf7bd70dce",
        "frage_id": "F-M16-015",
        "text": "Pflegen Sie Ihr bestehendes Netzwerk und Ihre Mandantenbasis gezielt als Quelle für Weiterempfehlungen und Zusatzmandate — oder passiert das, wenn überhaupt, nur nebenbei?",
        "ebene": "Vertiefung",
        "unterbereich": "w4c_netzwerk_pflege",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "03ffe575-8e18-5c2d-8cac-80d08b9e5bdf",
        "frage_id": "F-M16-016",
        "text": "Passen die Anfragen, die reinkommen, überhaupt zu Ihren Wunschmandaten — oder ziehen Ihre Kanäle vor allem Leads an, die Sie eigentlich nicht wollen?",
        "ebene": "Vertiefung",
        "unterbereich": "w5c_lead_qualitaet_filter",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "abf1f026-8c57-5a76-aa8a-fde7434b874b",
        "frage_id": "F-M16-017",
        "text": "Gibt es bei Ihnen jemanden, der für Leadgenerierung/Marketing verantwortlich ist (Zeit, Budget, Zuständigkeit) — oder macht das der Inhaber nebenbei, wenn mal Luft ist?",
        "ebene": "Vertiefung",
        "unterbereich": "w6b_kanal_ownership",
        "position": 17,
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
  "modul_id": "M-16",
  "modul_key": "m16",
  "modul_kategorie": "Marketing & Leadgenerierung",
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
    "beschreibung": "Aus den M-16-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "W1",
      "name": "Lead-Quellen & Kanal-Mix",
      "unterpunkte": [
        "Welche Kanäle Anfragen liefern (Grenze: strateg. Vertriebs-Quelle → M-08 V3a)",
        "Abhängigkeit von Empfehlung/Mundpropaganda vs. aktive Kanäle",
        "Welcher Kanal die besten/passendsten Leads bringt"
      ]
    },
    {
      "key": "W2",
      "name": "Systematik & Aktivität",
      "unterpunkte": [
        "Systematische Leadgenerierung vs. Zufall/passiv",
        "Inbound vs. Outbound (Grenze: Akquise-Aktivität → M-08 V3b)",
        "Kontinuierlich vs. nur bei sinkender Auslastung"
      ]
    },
    {
      "key": "W3",
      "name": "Digitale Sichtbarkeit & Website",
      "unterpunkte": [
        "Website als aktiver Lead-Kanal (Grenze: Botschaft → M-15)",
        "Online-Auffindbarkeit (Google/lokal) für Wunschmandate",
        "Digitale Präsenz gesamt (Grenze: Social/Content → M-17)"
      ]
    },
    {
      "key": "W4",
      "name": "Empfehlungs- & Netzwerk-Systematik",
      "unterpunkte": [
        "Aktiv um Empfehlungen bitten vs. passiv hoffen",
        "Multiplikatoren/Kooperationen (Banken, Berater, Verbände, Kammern)",
        "Netzwerk/Bestand als Lead-Quelle (Grenze: Cross-Sell → M-08 V4c)"
      ]
    },
    {
      "key": "W5",
      "name": "Lead-Handling & Conversion",
      "unterpunkte": [
        "Reaktionsgeschwindigkeit/-verlässlichkeit auf Anfragen",
        "Lead-Nachverfolgung (Grenze: CRM/Pipeline → M-10, Abschluss → M-08 V3c)",
        "Passen reinkommende Leads zum Wunschmandat (Fit)"
      ]
    },
    {
      "key": "W6",
      "name": "Kanal-Steuerung & -Reife",
      "unterpunkte": [
        "Leadquellen/Conversion gemessen (Grenze: KPI → M-07, Vertriebssteuerung → M-08 V6a)",
        "Wer verantwortet Leadgen/Marketing (Grenze: Rollen → M-02)",
        "Anpassung an neue/digitale Kanäle (Grenze: Social/Content → M-17)"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M16-001",
      "name": "Kanal-Mix-/Lead-Quellen-Analyse",
      "beschreibung": "welche Kanäle wie viele/welche Mandate bringen, Herkunft sichtbar",
      "reifegrad": 2,
      "referenz": "W1/W6a; F-M16-001, F-M16-009, F-M16-010"
    },
    {
      "hebel_id": "H-M16-002",
      "name": "Leadgen-Systematik-Planer",
      "beschreibung": "planbare, wiederkehrende Kanäle statt Zufall/Feuerwehr",
      "reifegrad": 2,
      "referenz": "W2; F-M16-003, F-M16-011"
    },
    {
      "hebel_id": "H-M16-003",
      "name": "Website-/Auffindbarkeits-Check",
      "beschreibung": "Website als Lead-Kanal + lokale/thematische Sichtbarkeit",
      "reifegrad": 2,
      "referenz": "W3; F-M16-005, F-M16-012"
    },
    {
      "hebel_id": "H-M16-004",
      "name": "Empfehlungs-/Netzwerk-Aktivierung",
      "beschreibung": "systematisch Empfehlungen anstoßen, Multiplikatoren-Landkarte",
      "reifegrad": 2,
      "referenz": "W4; F-M16-006, F-M16-014, F-M16-015"
    },
    {
      "hebel_id": "H-M16-005",
      "name": "Lead-Reaktions-/Nachfass-Assistent",
      "beschreibung": "schnelle, verlässliche Reaktion + Nachverfolgung offener Kontakte",
      "reifegrad": 3,
      "referenz": "W5; F-M16-007, F-M16-008"
    },
    {
      "hebel_id": "H-M16-006",
      "name": "Lead-Fit-Filter",
      "beschreibung": "Anfragen gegen Wunschmandat-Profil prüfen, Fehl-Leads erkennen",
      "reifegrad": 3,
      "referenz": "W5c; F-M16-016"
    },
    {
      "hebel_id": "H-M16-007",
      "name": "Digitale-Präsenz-Radar",
      "beschreibung": "Website/Einträge/Sichtbarkeit für die Zukunft der Mandatsgewinnung",
      "reifegrad": 2,
      "referenz": "W3c; F-M16-013 (Grenze: Content/Social → M-17)"
    },
    {
      "hebel_id": "H-M16-008",
      "name": "Leadgen-Reife-Radar",
      "beschreibung": "systematisch, gemessen, verantwortet, zukunftsfähig — Gesamtbild",
      "reifegrad": 4,
      "referenz": "W1–W6; F-M16-003, F-M16-009, F-M16-017"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-26 · stb_modul_m26 · 11 Kern / 13 Vertiefung / 11 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m26',
  'M-26 – Personalstruktur & strategischer Personalbedarf',
  '1.0',
  'M-26 – Personalstruktur & strategischer Personalbedarf — StB-KERN-Cut (DEC-242). 24 Fragen (11 Kern / 13 Vertiefung), 11 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-26-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "b70a18f4-d207-5fb7-845c-86308028a39d",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "0da8da0d-06b7-5b97-a09b-168c6e6e75fd",
        "frage_id": "F-M26-001",
        "text": "Wie ist Ihr Team heute aufgestellt — wie viele Köpfe bzw. Vollzeitäquivalente, in welchem Voll-/Teilzeit-Verhältnis und über wie viele Standorte verteilt?",
        "ebene": "Kern",
        "unterbereich": "p1a_team_aufstellung",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5909a1c2-b6e1-592f-8b11-057ea4998c56",
        "frage_id": "F-M26-002",
        "text": "Wie verteilt sich Ihr Team über die Qualifikationsebenen (Berufsträger StB/vBP · Steuerfachwirt/Bilanzbuchhalter · Steuerfachangestellte · Azubi · Backoffice) — und wo ist diese Struktur zu kopf- oder zu breitlastig?",
        "ebene": "Kern",
        "unterbereich": "p1b_qualifikationsebenen",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "04e71bcc-40e4-59cf-96dd-3a44bbd1b464",
        "frage_id": "F-M26-003",
        "text": "Wie viele Ihrer Leute dürfen eigenverantwortlich zeichnen/verantworten (Berufsträger) — und was passiert mit der Zeichnungsfähigkeit Ihrer Kanzlei, wenn Sie selbst länger ausfallen?",
        "ebene": "Kern",
        "unterbereich": "p1c_berufstraeger_quote",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2f150379-9cd7-5eb5-9200-b149e03a5770",
        "frage_id": "F-M26-004",
        "text": "Wie ist die Altersverteilung in Ihrem Team — und wie viele Ihrer Leute (Sie eingeschlossen) scheiden in den nächsten 5 Jahren voraussichtlich aus (Ruhestand, absehbarer Wechsel)?",
        "ebene": "Kern",
        "unterbereich": "p2a_altersstruktur_abgaenge",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "da6016cf-a0c0-5c14-99eb-7353e0d59420",
        "frage_id": "F-M26-005",
        "text": "Mussten Sie in den letzten 12 Monaten Mandate ablehnen, abgeben oder auf Warteschleife setzen, weil Ihnen die Leute fehlten — und in welchem Umfang?",
        "ebene": "Kern",
        "unterbereich": "p3a_auslastung_ablehnung",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "8bdefe9a-8130-5857-993f-a244e39a9abf",
        "frage_id": "F-M26-006",
        "text": "Wie voll ist Ihr Team ausgelastet — sind Überstunden bei Ihren Leuten (und bei Ihnen) der Normalzustand oder die Ausnahme, und wie lange geht das schon so?",
        "ebene": "Kern",
        "unterbereich": "p3a_auslastung_ablehnung",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3b4df5b0-a7f3-5e33-be5b-3fa8c0aee878",
        "frage_id": "F-M26-007",
        "text": "An welchen einzelnen Personen hängen bei Ihnen ganze Mandatsblöcke oder kritisches Know-how so stark, dass ein Ausfall dieser Person ein echtes Problem wäre — und wer ist das konkret?",
        "ebene": "Kern",
        "unterbereich": "p3c_schluesselperson_klumpen",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "fdec6c67-27cd-502e-97c7-6b357a9c307b",
        "frage_id": "F-M26-008",
        "text": "Planen Sie Ihren Personalbedarf vorausschauend (wie viele/welche Leute brauche ich in 1–3 Jahren) — oder suchen Sie erst, wenn jemand kündigt oder die Arbeit überläuft?",
        "ebene": "Kern",
        "unterbereich": "p5a_bedarfsplanung",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "9a749bd7-5dc1-5363-8c81-4eef0738b833",
        "frage_id": "F-M26-009",
        "text": "Gibt es in Ihrem Team heute jemanden, der perspektivisch die fachliche Verantwortung / Zeichnung übernehmen könnte, wenn Sie kürzertreten oder übergeben — und wie weit ist diese Person?",
        "ebene": "Kern",
        "unterbereich": "p6a_berufstraeger_nachfolge",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "398ec079-1b10-5fb5-b00a-21d2972a0e7c",
        "frage_id": "F-M26-010",
        "text": "Welche Kompetenz fehlt Ihnen im Team heute am meisten (z. B. Lohn, Beratung, Internationales, Digital/KI) — und woran merken Sie diese Lücke im Alltag?",
        "ebene": "Kern",
        "unterbereich": "p4a_kompetenzluecken",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "6fef04c9-7bee-5a99-bfce-6d04507f612d",
        "frage_id": "F-M26-011",
        "text": "Warum bleiben Ihre Leistungsträger bei Ihnen — und wie groß wäre die Lücke, wenn Ihre zwei, drei wichtigsten Fachkräfte abgeworben würden?",
        "ebene": "Kern",
        "unterbereich": "p2b_leistungstraeger_bindung",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "32e8bafa-9291-5678-87d9-418839b018e8",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "c7b07b41-30ab-5964-9abd-09137b8386a5",
        "frage_id": "F-M26-012",
        "text": "Nutzen Sie Teilzeit-/Flex-Modelle bewusst als Kapazitätshebel (z. B. Rückkehrende aus Elternzeit, Stundenaufstockung) — oder ist Ihre Kapazität faktisch an Vollzeitstellen gebunden?",
        "ebene": "Vertiefung",
        "unterbereich": "p1a_team_aufstellung",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "cbfd39f6-40b5-57eb-90cd-8c62b3f7d7f3",
        "frage_id": "F-M26-013",
        "text": "Für die in den nächsten Jahren absehbaren Abgänge: Ist jeweils Ersatz in Ausbildung, in Sicht oder eingeplant — oder träfe Sie der Abgang unvorbereitet?",
        "ebene": "Vertiefung",
        "unterbereich": "p2a_altersstruktur_abgaenge",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "853c1b06-1f01-5c92-a6ab-1b949c59c610",
        "frage_id": "F-M26-014",
        "text": "Wie hoch ist Ihre Fluktuation, und wie lange bleiben Leute im Schnitt bei Ihnen — kennen Sie diese Zahlen, und wie erklären Sie sich Abgänge der letzten Jahre?",
        "ebene": "Vertiefung",
        "unterbereich": "p2b_leistungstraeger_bindung",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "46fbcd5d-2feb-5db7-a790-fd6e0a784c49",
        "frage_id": "F-M26-015",
        "text": "Welcher Anteil der Team-Zeit geht in produktive, abrechenbare Mandatsarbeit vs. in Verwaltung/Rückfragen/Nacharbeit — und wie viele Mandate trägt ein Berufsträger bei Ihnen?",
        "ebene": "Vertiefung",
        "unterbereich": "p3b_produktive_quote",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "1401467c-dcd7-5420-a324-8a48d83ec200",
        "frage_id": "F-M26-016",
        "text": "Für welche Ihrer kritischen Rollen gibt es eine zweite Person, die einspringen könnte — und welche Rolle ist heute faktisch nur einfach besetzt?",
        "ebene": "Vertiefung",
        "unterbereich": "p3c_schluesselperson_klumpen",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "980ad297-aa3a-5d41-8f8d-2b28eea0c025",
        "frage_id": "F-M26-017",
        "text": "Welche Kompetenzen wird Ihre Kanzlei künftig stärker brauchen (z. B. betriebswirtschaftliche Beratung, Digital-/KI-Kompetenz) — und wie weit ist Ihr heutiges Team davon entfernt?",
        "ebene": "Vertiefung",
        "unterbereich": "p4a_kompetenzluecken",
        "position": 17,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7a3414db-565d-5b95-8f90-e7db414d4686",
        "frage_id": "F-M26-018",
        "text": "Fördern Sie systematisch den Aufstieg (Fachangestellte → Fachwirt/Bilanzbuchhalter → Berufsträger) — oder bleibt Weiterentwicklung dem Zufall / der Eigeninitiative überlassen?",
        "ebene": "Vertiefung",
        "unterbereich": "p4b_qualifizierungspfad",
        "position": 18,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "9ef22c58-00ce-5efb-ab19-d95be13eb317",
        "frage_id": "F-M26-019",
        "text": "Wie verändert Automatisierung/KI Ihren Personalbedarf — welche Rollen/Tätigkeiten schrumpfen (Routine-FiBu), welche wachsen (Prüfung, Beratung, Datenqualität)?",
        "ebene": "Vertiefung",
        "unterbereich": "p5b_ki_wandel_bedarf",
        "position": 19,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "e63a3e18-f348-5862-938a-2639198bb931",
        "frage_id": "F-M26-020",
        "text": "Wenn Sie in den nächsten 2–3 Jahren wachsen wollen (oder Mandate durch Abgänge nachbesetzen müssen) — wie viele und welche Einstellungen bräuchte das konkret, und ist der Markt dafür überhaupt da?",
        "ebene": "Vertiefung",
        "unterbereich": "p5c_wachstum_szenario",
        "position": 20,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a6a8eb3e-77b3-5843-a8b9-c03049225c59",
        "frage_id": "F-M26-021",
        "text": "Wenn Sie selbst 6 Monate ungeplant ausfielen: Bliebe Ihre Kanzlei zeichnungs- und handlungsfähig — oder hängt die Berufsträger-Verantwortung faktisch allein an Ihnen?",
        "ebene": "Vertiefung",
        "unterbereich": "p1c_berufstraeger_quote",
        "position": 21,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "b4c4a47d-a98f-5d8b-8f7e-eaf560dd8cad",
        "frage_id": "F-M26-022",
        "text": "Falls es einen internen Nachfolge-Kandidaten gibt: Was fehlt ihm heute noch (fachliche Reife, Führung, Berufsexamen, Beteiligung) — und in welchem Zeithorizont wäre er übernahmefähig?",
        "ebene": "Vertiefung",
        "unterbereich": "p6a_berufstraeger_nachfolge",
        "position": 22,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "100d18ea-67e8-558d-9230-205cc56aeb32",
        "frage_id": "F-M26-023",
        "text": "Gibt es unterhalb von Ihnen eine Führungs-/Teamleiter-Ebene, die Verantwortung trägt — oder laufen alle wesentlichen Entscheidungen weiterhin über Sie?",
        "ebene": "Vertiefung",
        "unterbereich": "p6b_fuehrungs_pipeline",
        "position": 23,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a193fced-31ef-55ec-b16e-613ef8e6a133",
        "frage_id": "F-M26-024",
        "text": "Was würde mit Ihrer Auslastung und Ihren Mandaten passieren, wenn in den nächsten 12 Monaten zwei Leistungsträger gleichzeitig ausfielen — haben Sie das je durchgerechnet?",
        "ebene": "Vertiefung",
        "unterbereich": "p3a_auslastung_ablehnung",
        "position": 24,
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
  "modul_id": "M-26",
  "modul_key": "m26",
  "modul_kategorie": "HR & Personal",
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
    "beschreibung": "Aus den M-26-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "P1",
      "name": "Ist-Personalstruktur & Rollen",
      "unterpunkte": [
        "Team-Aufstellung (Köpfe/FTE, Voll-/Teilzeit, Standorte)",
        "Qualifikationsebenen (StB/vBP · Steuerfachwirt/Bilanzbuchhalter · Fachangestellte · Azubi · Backoffice)",
        "Berufsträger-/Zeichnungs-Quote (wer darf zeichnen/verantworten)"
      ]
    },
    {
      "key": "P2",
      "name": "Altersstruktur & Bindung",
      "unterpunkte": [
        "Altersverteilung & anstehende Abgänge (5-Jahres-Blick)",
        "Bindung der Leistungsträger / strukturelle Fluktuation"
      ]
    },
    {
      "key": "P3",
      "name": "Kapazität & Auslastung (operatives 83-%-Symptom)",
      "unterpunkte": [
        "Auslastungsgrenze & Mandatsablehnung/-abgabe wegen Personal",
        "Produktive vs. nicht-produktive Zeit / Mandate pro Kopf",
        "Schlüsselperson-/Klumpenrisiko (Bus-Faktor auf Struktur-Ebene)"
      ]
    },
    {
      "key": "P4",
      "name": "Kompetenz-/Skill-Mix & Engpässe",
      "unterpunkte": [
        "Fehlende Kompetenzen (Beratung, Lohn, Internationales, Digital/KI)",
        "Qualifizierungs-/Aufstiegspfad (Fachangestellte → Berufsträger)"
      ]
    },
    {
      "key": "P5",
      "name": "Strategischer Personalbedarf & Kapazitätsplanung",
      "unterpunkte": [
        "Vorausschauende Personalbedarfsplanung (vorhanden ja/nein, Horizont)",
        "KI-/Automatisierungs-Effekt auf künftigen Bedarf (welche Rollen schrumpfen/wachsen)",
        "Bedarf unter Wachstum/Mandatsentwicklung"
      ]
    },
    {
      "key": "P6",
      "name": "Interne (Berufsträger-)Nachfolge & Führungspipeline",
      "unterpunkte": [
        "Personelle Berufsträger-Nachfolge (wer kann zeichnen, wenn Inhaber geht)",
        "Führungs-/Teamleiter-Pipeline & Verantwortungsübergabe"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M26-001",
      "name": "Personalstruktur-Übersicht",
      "beschreibung": "Köpfe/FTE je Qualifikationsebene, Voll-/Teilzeit, Standorte",
      "reifegrad": 1,
      "referenz": "P1a/P1b; F-M26-001, F-M26-002"
    },
    {
      "hebel_id": "H-M26-002",
      "name": "Auslastungs-/Kapazitäts-Heatmap je Mitarbeiter/Team",
      "beschreibung": "Überlast früh sichtbar",
      "reifegrad": 2,
      "referenz": "P3a; F-M26-006, F-M26-005"
    },
    {
      "hebel_id": "H-M26-003",
      "name": "Alters-/Abgangs-Zeitstrahl & Nachbesetzungs-Frühwarnung",
      "beschreibung": "wer geht wann, ist Ersatz in Sicht",
      "reifegrad": 2,
      "referenz": "P2a; F-M26-004, F-M26-013"
    },
    {
      "hebel_id": "H-M26-004",
      "name": "Skill-/Kompetenz-Matrix",
      "beschreibung": "wer kann was, wo ist die Kanzlei nur einfach besetzt",
      "reifegrad": 2,
      "referenz": "P4a/P3c; F-M26-010, F-M26-016"
    },
    {
      "hebel_id": "H-M26-005",
      "name": "Qualifizierungs-/Aufstiegspfad-Planer",
      "beschreibung": "individuelle Entwicklungspläne Fachangestellte → Berufsträger",
      "reifegrad": 2,
      "referenz": "P4b; F-M26-018"
    },
    {
      "hebel_id": "H-M26-006",
      "name": "Mandats-/Wissens-Klumpen-Analyse",
      "beschreibung": "welche Mandate/welcher Umsatz hängen an einer Person",
      "reifegrad": 3,
      "referenz": "P3c; F-M26-007, F-M26-016"
    },
    {
      "hebel_id": "H-M26-007",
      "name": "Nachfolge-/Führungspipeline-Tracker",
      "beschreibung": "interne Kandidaten, Reifegrad, was fehlt noch",
      "reifegrad": 3,
      "referenz": "P6a/P6b; F-M26-009, F-M26-022, F-M26-023"
    },
    {
      "hebel_id": "H-M26-008",
      "name": "Strategische Personalbedarfs-Prognose",
      "beschreibung": "Bedarf aus Mandatsentwicklung + Abgängen + Auslastung",
      "reifegrad": 3,
      "referenz": "P5a/P5c/P2a; F-M26-008, F-M26-020, F-M26-004"
    },
    {
      "hebel_id": "H-M26-009",
      "name": "Fluktuations-/Bindungs-Frühwarnung",
      "beschreibung": "Abwanderungsrisiko der Leistungsträger",
      "reifegrad": 4,
      "referenz": "P2b; F-M26-011, F-M26-014"
    },
    {
      "hebel_id": "H-M26-010",
      "name": "KI-Wandel-Simulator Personalbedarf",
      "beschreibung": "welche Rollen verändert Automatisierung, welche Kapazität wird frei/fehlt",
      "reifegrad": 4,
      "referenz": "P5b; F-M26-019"
    },
    {
      "hebel_id": "H-M26-011",
      "name": "Szenario-Personalplanung",
      "beschreibung": "Wachstum/Abgang/KI → benötigte Einstellungen & Timing, Cash-/Kapazitätswirkung",
      "reifegrad": 4,
      "referenz": "P5c/P5a; F-M26-020, F-M26-024"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-27 · stb_modul_m27 · 11 Kern / 13 Vertiefung / 11 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m27',
  'M-27 – Rekrutierung & Employer Branding',
  '1.0',
  'M-27 – Rekrutierung & Employer Branding — StB-KERN-Cut (DEC-242). 24 Fragen (11 Kern / 13 Vertiefung), 11 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-27-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "80b6abf1-8600-5ed4-94df-89cd67246e6b",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "10c97acb-9c2d-5a15-a21f-5ea257e9d3a6",
        "frage_id": "F-M27-001",
        "text": "Wenn ein guter Bewerber fragt „warum sollte ich ausgerechnet zu Ihnen kommen und nicht zur Kanzlei nebenan?\" — was ist Ihre ehrliche Antwort, und wissen Ihre Mitarbeiter das auch?",
        "ebene": "Kern",
        "unterbereich": "r1a_evp",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "1ad14722-3016-504e-9f55-2f4df25c676b",
        "frage_id": "F-M27-002",
        "text": "Haben Sie ein bewusstes Bild davon, welcher Typ Mitarbeiter zu Ihnen passt (Wunschprofil) — oder nehmen Sie faktisch, wer sich bewirbt?",
        "ebene": "Kern",
        "unterbereich": "r1a_evp",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "c77c8a1e-1c15-5f75-81c8-787840137ddc",
        "frage_id": "F-M27-003",
        "text": "Wie sichtbar sind Sie als Arbeitgeber (Karriere-Seite, Bewertungen auf kununu/Google, Präsenz dort, wo Ihre Zielbewerber suchen) — und wann haben Sie das zuletzt aus Bewerbersicht angeschaut?",
        "ebene": "Kern",
        "unterbereich": "r1b_arbeitgeber_sichtbarkeit",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "9362d592-136b-5a6a-b41d-27f4351bd357",
        "frage_id": "F-M27-004",
        "text": "Über welche Kanäle gewinnen Sie heute tatsächlich Ihre Mitarbeiter (Portale, Empfehlung, Ausbildung, Personalberatung, Zufall) — und welcher bringt die besten Leute?",
        "ebene": "Kern",
        "unterbereich": "r2a_kanaele",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "6fdad457-43c2-5b8f-a723-4868fc78bcce",
        "frage_id": "F-M27-005",
        "text": "Wie stark nutzen Sie Ihr bestehendes Team zur Gewinnung (Mitarbeiter-werben-Mitarbeiter, Netzwerk) — und ist das bei Ihnen ein System oder Zufall?",
        "ebene": "Kern",
        "unterbereich": "r2a_kanaele",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0564d949-7d29-5331-ad3d-ac47674f41eb",
        "frage_id": "F-M27-006",
        "text": "Wie schnell reagieren Sie auf eine Bewerbung, und wie lange dauert der Weg von Bewerbung bis Vertrag — verlieren Sie Kandidaten, weil andere schneller sind?",
        "ebene": "Kern",
        "unterbereich": "r2b_prozess_geschwindigkeit",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "8abe4126-2357-5823-8f80-761b0894a739",
        "frage_id": "F-M27-007",
        "text": "Bilden Sie systematisch aus, und woher kommen Ihre Azubis (Schulen, Praktika, Empfehlung) — oder ist die Nachwuchsgewinnung dem Zufall überlassen?",
        "ebene": "Kern",
        "unterbereich": "r3a_azubi_gewinnung",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "dacce70b-2b10-5d37-b2d2-f9b9dc5a84d6",
        "frage_id": "F-M27-008",
        "text": "Wie leicht oder schwer fällt es Ihnen aktuell, überhaupt geeignete Azubis/Nachwuchs zu finden — und wie hat sich das in den letzten Jahren verändert?",
        "ebene": "Kern",
        "unterbereich": "r3a_azubi_gewinnung",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0db080dc-7963-5f03-bdd5-dab536e676b5",
        "frage_id": "F-M27-009",
        "text": "Wissen Sie, wie Ihre Vergütung und Benefits im Vergleich zu konkurrierenden Kanzleien/Arbeitgebern in Ihrer Region liegen — und ist das eher Stärke oder Schwäche im Wettbewerb um Leute?",
        "ebene": "Kern",
        "unterbereich": "r5a_verguetung_benefits",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "79725577-e024-5cac-9a73-cc1fac9aa9e6",
        "frage_id": "F-M27-010",
        "text": "Rekrutieren Sie vorausschauend/kontinuierlich (auch ohne akute Vakanz, an Ihren Personalbedarf gekoppelt) — oder erst, wenn eine Stelle akut brennt?",
        "ebene": "Kern",
        "unterbereich": "r6a_strategie_planung",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "ac32ad32-7a9f-5e9b-a6f0-c335a4cf1390",
        "frage_id": "F-M27-011",
        "text": "Wie viele Stellen haben Sie in den letzten 12 Monaten gesucht, und wie viele davon konnten Sie tatsächlich besetzen?",
        "ebene": "Kern",
        "unterbereich": "r4b_funnel_conversion",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "1a108833-cca3-52ff-b34a-12a908b3d80a",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "9bdfc806-3e77-547e-92f5-b6b2253d136a",
        "frage_id": "F-M27-012",
        "text": "Welche Flexibilität bieten Sie (Homeoffice, Teilzeit, Vertrauensarbeitszeit, digitales Arbeiten) — und ist Ihr Digitalisierungsgrad eher ein Argument für oder gegen Sie im Werben um Fachkräfte?",
        "ebene": "Vertiefung",
        "unterbereich": "r1c_kultur_flexibilitaet",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "946d6e38-0350-54aa-bc4c-22efa9a2f08a",
        "frage_id": "F-M27-013",
        "text": "Wie würden Ihre eigenen Mitarbeiter Ihre Kanzlei als Arbeitgeber beschreiben, wenn sie ehrlich mit einem Bekannten sprechen — und wissen Sie das?",
        "ebene": "Vertiefung",
        "unterbereich": "r1c_kultur_flexibilitaet",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "899132c4-b0cd-59fd-9493-44e3c8093526",
        "frage_id": "F-M27-014",
        "text": "Nach welchen Kriterien wählen Sie aus (Fachlichkeit, Persönlichkeit, Kulturfit), gibt es Probearbeit/ein strukturiertes Verfahren — und wer trifft die Einstellungsentscheidung?",
        "ebene": "Vertiefung",
        "unterbereich": "r2c_auswahl",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "03261840-88d4-56e8-8b61-eb1579ed27e6",
        "frage_id": "F-M27-015",
        "text": "Wie erleben Bewerber den Kontakt mit Ihnen — schnelle Rückmeldung, wertschätzende Absagen — und haben Sie das je aus deren Sicht getestet?",
        "ebene": "Vertiefung",
        "unterbereich": "r4a_bewerbererlebnis",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "6a6e5e0b-9141-567f-ae67-6d743a1d6f8e",
        "frage_id": "F-M27-016",
        "text": "Haben Sie Transparenz über Ihren Bewerber-Funnel (Bewerbungen → Gespräche → Zusagen → Eintritte) und wissen Sie, an welcher Stelle Sie Kandidaten verlieren?",
        "ebene": "Vertiefung",
        "unterbereich": "r4b_funnel_conversion",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "f89cf386-6550-524a-9847-e21c2f57343f",
        "frage_id": "F-M27-017",
        "text": "Wie viele Ihrer Azubis übernehmen Sie nach der Ausbildung, wie viele bleiben langfristig — und tun Sie während der Ausbildung gezielt etwas für die Bindung?",
        "ebene": "Vertiefung",
        "unterbereich": "r3b_uebernahme_bindung",
        "position": 17,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a0f470ef-7158-58f7-8a29-cafd87bc05f5",
        "frage_id": "F-M27-018",
        "text": "Welche Benefits jenseits des Gehalts setzen Sie ein (bezahlte Weiterbildung, Fahrtkosten/JobRad, Gesundheit, Events) — und welche davon ziehen bei Ihren Zielbewerbern tatsächlich?",
        "ebene": "Vertiefung",
        "unterbereich": "r5a_verguetung_benefits",
        "position": 18,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "52bef673-81ca-52a3-8da1-8a1fdcc56460",
        "frage_id": "F-M27-019",
        "text": "Können Sie Bewerbern eine konkrete Entwicklungs-/Aufstiegsperspektive aufzeigen (Weiterbildung, Verantwortung, Richtung Berufsträger/Partner) — und nutzen Sie das aktiv im Recruiting?",
        "ebene": "Vertiefung",
        "unterbereich": "r5b_entwicklung_perspektive",
        "position": 19,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "f122ee3f-b28b-5ec7-abaa-39bd052f3e85",
        "frage_id": "F-M27-020",
        "text": "Wissen Sie, was Sie eine Einstellung kostet (Anzeigen, Personalberatung, Zeit) und welcher Kanal sich rechnet — oder geben Sie eher ungezielt Geld aus?",
        "ebene": "Vertiefung",
        "unterbereich": "r6b_wirksamkeit_kosten",
        "position": 20,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "fdff33ec-885e-52b3-a5e2-c0b4181bcd08",
        "frage_id": "F-M27-021",
        "text": "Wie aktiv pflegen Sie Ihre Arbeitgeber-Bewertungen (kununu/Google) und reagieren auf negative Bewertungen — oder überlassen Sie Ihr Arbeitgeber-Bild dem Zufall?",
        "ebene": "Vertiefung",
        "unterbereich": "r1b_arbeitgeber_sichtbarkeit",
        "position": 21,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0916ec0d-9898-5ce4-af2f-b7c2486b2227",
        "frage_id": "F-M27-022",
        "text": "Nutzen Sie moderne Beschaffungswege (Social Recruiting, aktive Ansprache auf Plattformen, KI-gestützte Kampagnen) — oder verlassen Sie sich auf die klassische Stellenanzeige und Warten?",
        "ebene": "Vertiefung",
        "unterbereich": "r2a_kanaele",
        "position": 22,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "4cc76305-df20-5ea0-9abe-5605ccb47089",
        "frage_id": "F-M27-023",
        "text": "Gibt es bei Ihnen jemanden, der für Recruiting/Employer Branding verantwortlich ist (Zeit, Budget, Zuständigkeit) — oder macht das der Inhaber nebenbei?",
        "ebene": "Vertiefung",
        "unterbereich": "r6a_strategie_planung",
        "position": 23,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "368fee6c-022d-53e1-bb7e-a897a22c180c",
        "frage_id": "F-M27-024",
        "text": "Wenn Ihr bester Mitarbeiter morgen ein Angebot einer anderen Kanzlei mit 15 % mehr Gehalt bekäme — würde er bleiben, und woran genau würde das liegen?",
        "ebene": "Vertiefung",
        "unterbereich": "r1a_evp",
        "position": 24,
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
  "modul_id": "M-27",
  "modul_key": "m27",
  "modul_kategorie": "HR & Personal",
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
    "beschreibung": "Aus den M-27-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "R1",
      "name": "Arbeitgeber-Positionierung & -Marke (EVP)",
      "unterpunkte": [
        "Arbeitgeber-Nutzenversprechen & Wunsch-Mitarbeiter-Profil",
        "Sichtbarkeit als Arbeitgeber (Karriere-Web, kununu/Google-Bewertungen, Social)",
        "Kultur & Flexibilität (Homeoffice/Teilzeit/Digitalisierungsgrad als Argument)"
      ]
    },
    {
      "key": "R2",
      "name": "Rekrutierungs-Prozess & Kanäle",
      "unterpunkte": [
        "Rekrutierungs-Kanäle (Portale, Empfehlung, Hochschule, Social Recruiting, Personalberatung)",
        "Bewerbungsprozess & Time-to-Hire / Reaktionsgeschwindigkeit",
        "Auswahl-/Eignungsverfahren (Kriterien, Probearbeit, wer entscheidet)"
      ]
    },
    {
      "key": "R3",
      "name": "Nachwuchs & Ausbildung (Azubi-Pipeline)",
      "unterpunkte": [
        "Azubi-/Nachwuchsgewinnung (Schulen, Praktika, dual)",
        "Übernahme nach Ausbildung / frühe Bindung"
      ]
    },
    {
      "key": "R4",
      "name": "Candidate Experience & Bewerber-Funnel",
      "unterpunkte": [
        "Bewerbererlebnis (Erreichbarkeit, Wertschätzung, Absage-Handling)",
        "Funnel-Transparenz (Bewerbungen → Einstellungen, wo bricht es)"
      ]
    },
    {
      "key": "R5",
      "name": "Attraktivitäts-Hebel (Vergütung, Benefits, Perspektive)",
      "unterpunkte": [
        "Vergütungs-/Benefit-Attraktivität im Marktvergleich",
        "Entwicklungs-/Aufstiegsperspektive als Recruiting-Argument"
      ]
    },
    {
      "key": "R6",
      "name": "Rekrutierungs-Strategie & Wirksamkeit",
      "unterpunkte": [
        "Strategie vs. Reaktion (an Personalbedarf M-26 gekoppelt) + Zuständigkeit",
        "Wirksamkeit/Kosten je Einstellung (was funktioniert, was verbrennt Geld)"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M27-001",
      "name": "Arbeitgeber-Profil / EVP-Baukasten",
      "beschreibung": "Nutzenversprechen + Wunschprofil schärfen",
      "reifegrad": 1,
      "referenz": "R1a; F-M27-001, F-M27-002"
    },
    {
      "hebel_id": "H-M27-002",
      "name": "Stellenanzeigen-/Karriereseiten-Generator",
      "beschreibung": "zielgruppengerechte, bewerber-sichtbare Texte",
      "reifegrad": 2,
      "referenz": "R1b/R2a; F-M27-003, F-M27-004"
    },
    {
      "hebel_id": "H-M27-003",
      "name": "Arbeitgeber-Bewertungs-Monitor",
      "beschreibung": "kununu/Google — Alerts + Antwort-Vorschläge",
      "reifegrad": 2,
      "referenz": "R1b; F-M27-003, F-M27-021"
    },
    {
      "hebel_id": "H-M27-004",
      "name": "Multi-Channel-Ausschreibung & Kanal-Verteilung",
      "beschreibung": "ein Vorgang auf mehrere Portale/Social",
      "reifegrad": 2,
      "referenz": "R2a; F-M27-004, F-M27-022"
    },
    {
      "hebel_id": "H-M27-005",
      "name": "Bewerber-Funnel-/ATS-Tracking",
      "beschreibung": "Bewerbungen → Stufen → Zeit, Abbruch sichtbar",
      "reifegrad": 3,
      "referenz": "R4b/R2b; F-M27-011, F-M27-016, F-M27-006"
    },
    {
      "hebel_id": "H-M27-006",
      "name": "Automatisierte Bewerber-Kommunikation",
      "beschreibung": "schnelle Eingangsbestätigung, Status, wertschätzende Absagen",
      "reifegrad": 3,
      "referenz": "R4a/R2b; F-M27-006, F-M27-015"
    },
    {
      "hebel_id": "H-M27-007",
      "name": "Social-Recruiting-/Kampagnen-Assistent",
      "beschreibung": "KI-gestützte Zielgruppen-Ansprache",
      "reifegrad": 3,
      "referenz": "R2a; F-M27-022"
    },
    {
      "hebel_id": "H-M27-008",
      "name": "Azubi-/Nachwuchs-Pipeline-Tracker",
      "beschreibung": "Schulkontakte, Praktika, Übernahme-Verlauf",
      "reifegrad": 2,
      "referenz": "R3; F-M27-007, F-M27-008, F-M27-017"
    },
    {
      "hebel_id": "H-M27-009",
      "name": "Vergütungs-/Benefit-Benchmark",
      "beschreibung": "Marktvergleich Region/Kanzleigröße",
      "reifegrad": 3,
      "referenz": "R5a; F-M27-009, F-M27-018"
    },
    {
      "hebel_id": "H-M27-010",
      "name": "Recruiting-Kanal-ROI-Analyse",
      "beschreibung": "Kosten je Einstellung, welcher Kanal rechnet sich",
      "reifegrad": 4,
      "referenz": "R6b; F-M27-020, F-M27-004"
    },
    {
      "hebel_id": "H-M27-011",
      "name": "Vorausschauende Recruiting-Steuerung",
      "beschreibung": "Bedarf aus Personalplanung → kontinuierlicher Talent-Pool statt Reaktion",
      "reifegrad": 4,
      "referenz": "R6a; F-M27-010, F-M27-011"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-28 · stb_modul_m28 · 11 Kern / 13 Vertiefung / 11 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m28',
  'M-28 – Onboarding & Einarbeitung',
  '1.0',
  'M-28 – Onboarding & Einarbeitung — StB-KERN-Cut (DEC-242). 24 Fragen (11 Kern / 13 Vertiefung), 11 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-28-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "289a1d8f-7bcd-5e4c-beda-b4195fe8c1b1",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "77107595-16e2-53ff-a818-5a713f1df72b",
        "frage_id": "F-M28-001",
        "text": "Haben Sie einen strukturierten Onboarding-/Einarbeitungsplan, den jeder Neue durchläuft — oder läuft Einarbeitung bei Ihnen eher „learning by doing\" und je nachdem, wer gerade Zeit hat?",
        "ebene": "Kern",
        "unterbereich": "o1a_strukturierter_plan",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "b5202ae8-fc15-57a9-9782-0e1b6fe05309",
        "frage_id": "F-M28-002",
        "text": "Wie läuft bei Ihnen der erste Tag / die erste Woche eines Neuen ab — ist Empfang, Vorstellung und Ablauf vorbereitet, oder wird das improvisiert?",
        "ebene": "Kern",
        "unterbereich": "o1b_preboarding_erster_tag",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "79d7810d-f99c-5af2-ac3d-7404c4f7ec85",
        "frage_id": "F-M28-003",
        "text": "Wer ist bei Ihnen für die Einarbeitung eines Neuen verantwortlich (fester Owner, Teamleiter, der Inhaber nebenbei) — und ist klar, wer was übernimmt?",
        "ebene": "Kern",
        "unterbereich": "o1c_verantwortung_owner",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a2427eee-0b24-5f96-ad9c-4c28f7d2c015",
        "frage_id": "F-M28-004",
        "text": "Wie lange dauert es typischerweise, bis eine neue Fachkraft bei Ihnen eigenständig Mandate bearbeiten kann — und woran machen Sie „eigenständig\" fest?",
        "ebene": "Kern",
        "unterbereich": "o2a_einarbeitungszeit",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "513b30c6-13d7-5428-adaa-1a4d417ba176",
        "frage_id": "F-M28-005",
        "text": "Wie werden Neue fachlich eingearbeitet (Mandantenübergabe, DATEV/Tools, Ihre Prozesse und Fristen) — strukturiert, oder Zufall, wer gerade was zeigt?",
        "ebene": "Kern",
        "unterbereich": "o2b_fachliche_vermittlung",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a277faf7-f615-5f41-adef-cc1f273f7b19",
        "frage_id": "F-M28-006",
        "text": "Gibt es in der Einarbeitung Meilensteine/Checkpoints, an denen Sie prüfen, wo der Neue steht — oder merkt man erst am Ergebnis, ob es funktioniert hat?",
        "ebene": "Kern",
        "unterbereich": "o2c_meilensteine",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "16ef59cd-600a-59c9-99a0-e2fdda263086",
        "frage_id": "F-M28-007",
        "text": "Wo findet ein Neuer an Tag 1 die Antwort auf „wie machen wir das hier\" (Checklisten, Muster, Ansprechpartner) — oder muss er sich alles einzeln zusammenfragen?",
        "ebene": "Kern",
        "unterbereich": "o3a_wissenszugang",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "9fddd230-05ff-544a-b9c6-0517c145cd55",
        "frage_id": "F-M28-008",
        "text": "Wenn ein erfahrener Mitarbeiter Sie verlässt: Wie sichern Sie sein Wissen und übergeben seine Mandate geordnet — oder geht vieles mit ihm verloren?",
        "ebene": "Kern",
        "unterbereich": "o3b_wissenstransfer_abgang",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "fa615cca-aa54-5e6b-bc93-ef8856a15847",
        "frage_id": "F-M28-009",
        "text": "Bekommt ein Neuer bei Ihnen einen festen Ansprechpartner/Paten für die erste Zeit — oder muss er sich seine Hilfe selbst suchen?",
        "ebene": "Kern",
        "unterbereich": "o4a_mentoring_pate",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "c62a4ae4-0c75-5cd2-bd24-2d951952622a",
        "frage_id": "F-M28-010",
        "text": "Gibt es in der Probezeit feste Feedback-/Zwischengespräche — und würden Sie eine Fehlbesetzung früh genug merken, um zu reagieren?",
        "ebene": "Kern",
        "unterbereich": "o5a_feedback_probezeit",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "59e09e40-1665-5f8c-8620-6c01c3ce019e",
        "frage_id": "F-M28-011",
        "text": "Was kostet Sie eine Fehlbesetzung, die erst nach der Probezeit auffällt — und ist Ihnen das schon passiert?",
        "ebene": "Kern",
        "unterbereich": "o5b_fruehe_bindung",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "85896c9f-b207-551c-86a5-daca582a5d60",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "cacf2b39-cbab-593c-8db4-7fcf41546e0b",
        "frage_id": "F-M28-012",
        "text": "Ist Ihr Einarbeitungsablauf so dokumentiert, dass er gleich gut funktioniert — egal, wer gerade einarbeitet — oder hängt die Qualität an der einarbeitenden Person?",
        "ebene": "Vertiefung",
        "unterbereich": "o1a_strukturierter_plan",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "97eef543-9021-58ad-b527-d91d5ec4c0de",
        "frage_id": "F-M28-013",
        "text": "Sind am ersten Tag alle Zugänge und die Ausstattung bereit (Arbeitsplatz, Technik, DATEV-Rechte, Logins) — oder verliert der Neue die erste Woche mit Warten?",
        "ebene": "Vertiefung",
        "unterbereich": "o1b_preboarding_erster_tag",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5403f0c2-4759-55c4-8fd9-132ace9988dd",
        "frage_id": "F-M28-014",
        "text": "Bekommen die Einarbeitenden bei Ihnen tatsächlich Zeit dafür eingeräumt — oder läuft Einarbeitung „nebenbei\" zum vollen Tagesgeschäft?",
        "ebene": "Vertiefung",
        "unterbereich": "o1c_verantwortung_owner",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5e44f3dc-f1ea-593f-bd82-d96dbd87b67a",
        "frage_id": "F-M28-015",
        "text": "Wie führen Sie Neue an Mandanten heran (begleitete Übergabe, Schatten-Mitlaufen, gemeinsame Termine) — oder geht es eher direkt ins kalte Wasser?",
        "ebene": "Vertiefung",
        "unterbereich": "o2b_fachliche_vermittlung",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "ec59c4ce-4e92-56a4-861c-ba0aec391b79",
        "frage_id": "F-M28-016",
        "text": "Wie kontrollieren Sie die Qualität der ersten eigenständigen Arbeiten eines Neuen (Vier-Augen, Freigaben) — bis Sie ihm wirklich vertrauen?",
        "ebene": "Vertiefung",
        "unterbereich": "o2c_meilensteine",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "88c792ca-7e9b-555f-8c41-6404439f7d5a",
        "frage_id": "F-M28-017",
        "text": "Wie sorgen Sie dafür, dass ein Neuer sich sozial im Team ankommt und zugehörig fühlt (Vorstellung, Einbindung, informeller Kontakt)?",
        "ebene": "Vertiefung",
        "unterbereich": "o4b_kulturelle_integration",
        "position": 17,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "689eedf6-143e-5b01-954a-fe51e4d5fe58",
        "frage_id": "F-M28-018",
        "text": "Treffen Sie die Übernahme-/Ende-Probezeit-Entscheidung bewusst und auf Basis konkreter Beobachtungen — oder läuft die Probezeit einfach durch?",
        "ebene": "Vertiefung",
        "unterbereich": "o5a_feedback_probezeit",
        "position": 18,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "cf078b07-facd-5bf5-a6e7-dba4c6a770a4",
        "frage_id": "F-M28-019",
        "text": "Kommt es vor, dass Neue in den ersten 6–12 Monaten wieder gehen — und wissen Sie, woran das lag?",
        "ebene": "Vertiefung",
        "unterbereich": "o5b_fruehe_bindung",
        "position": 19,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "dae5700d-9c57-598d-b2b5-7a4009f80a2e",
        "frage_id": "F-M28-020",
        "text": "Unterscheiden Sie das Onboarding nach Zielgruppe (Azubi vs. erfahrene Fachkraft vs. Quereinsteiger) — oder bekommen alle dasselbe?",
        "ebene": "Vertiefung",
        "unterbereich": "o6a_azubi_quereinsteiger",
        "position": 20,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "f4ad8230-46e7-58c4-bee0-1e039904d722",
        "frage_id": "F-M28-021",
        "text": "Wie arbeiten Sie fachfremde Quereinsteiger oder Rückkehrer (z. B. aus Elternzeit) gezielt ein — und funktioniert das?",
        "ebene": "Vertiefung",
        "unterbereich": "o6a_azubi_quereinsteiger",
        "position": 21,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0507ee06-62da-58d8-aff6-9724cb122b5f",
        "frage_id": "F-M28-022",
        "text": "Wie stellen Sie Einarbeitung und Integration sicher, wenn ein Neuer überwiegend remote oder in Teilzeit startet — ohne dass er den Anschluss verliert?",
        "ebene": "Vertiefung",
        "unterbereich": "o6b_remote_teilzeit_onboarding",
        "position": 22,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "c78e6af0-744f-5c07-bfb6-b58d3b4c9075",
        "frage_id": "F-M28-023",
        "text": "Wären Sie auf einen ungeplanten, kurzfristigen Abgang einer Schlüsselperson vorbereitet — ist deren Wissen so dokumentiert, dass jemand übernehmen könnte?",
        "ebene": "Vertiefung",
        "unterbereich": "o3b_wissenstransfer_abgang",
        "position": 23,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "cfe96929-fff1-5a5d-a9b0-5b00fdcbd729",
        "frage_id": "F-M28-024",
        "text": "Haben Ihre Paten/Mentoren tatsächlich Zeit und einen Anreiz für die Betreuung — oder ist das eine zusätzliche Last, die im Alltag untergeht?",
        "ebene": "Vertiefung",
        "unterbereich": "o4a_mentoring_pate",
        "position": 24,
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
  "modul_id": "M-28",
  "modul_key": "m28",
  "modul_kategorie": "HR & Personal",
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
    "beschreibung": "Aus den M-28-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "O1",
      "name": "Onboarding-Prozess & Struktur",
      "unterpunkte": [
        "Strukturierter Onboarding-/Einarbeitungsplan (vorhanden, standardisiert)",
        "Preboarding & erster Tag/erste Woche (Ausstattung, Zugänge, Empfang)",
        "Verantwortung fürs Onboarding (HR/Teamleiter/Inhaber nebenbei)"
      ]
    },
    {
      "key": "O2",
      "name": "Fachliche Einarbeitung & Time-to-Productivity",
      "unterpunkte": [
        "Zeit bis zur Eigenständigkeit",
        "Fachliche Einarbeitung (Mandate, DATEV/Tools, Prozesse, Fristen)",
        "Meilensteine/Checkpoints in der Einarbeitung"
      ]
    },
    {
      "key": "O3",
      "name": "Wissensvermittlung & -zugang",
      "unterpunkte": [
        "Zugang zu Kanzlei-Know-how beim Start („wie machen wir das hier\")",
        "Wissenstransfer bei Ausscheiden/Übergabe (Wissensverlust vermeiden)"
      ]
    },
    {
      "key": "O4",
      "name": "Betreuung & Integration",
      "unterpunkte": [
        "Mentoring/Patensystem/fester Ansprechpartner",
        "Kulturelle/soziale Integration ins Team"
      ]
    },
    {
      "key": "O5",
      "name": "Probezeit-Steuerung & Frühbindung",
      "unterpunkte": [
        "Feedback-/Probezeit-Gespräche, Frühwarnung Fehlbesetzung",
        "Frühe Bindung / Abbruch-Risiko in den ersten Monaten"
      ]
    },
    {
      "key": "O6",
      "name": "Zielgruppen-Onboarding",
      "unterpunkte": [
        "Onboarding für Azubis / Quer-/Wiedereinsteiger (unterschiedliche Pfade)",
        "Onboarding bei Remote/Teilzeit/digitalem Arbeiten"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M28-001",
      "name": "Onboarding-Plan-Generator",
      "beschreibung": "Standard-Einarbeitungsplan pro Rolle: Checklisten, Zeitplan, Meilensteine",
      "reifegrad": 1,
      "referenz": "O1a/O2c; F-M28-001, F-M28-006"
    },
    {
      "hebel_id": "H-M28-002",
      "name": "Preboarding-Aufgaben-/Zugangs-Checkliste",
      "beschreibung": "Technik, DATEV-Rechte, Arbeitsplatz automatisch angestoßen",
      "reifegrad": 2,
      "referenz": "O1b; F-M28-002, F-M28-013"
    },
    {
      "hebel_id": "H-M28-003",
      "name": "Einarbeitungs-Fortschritts-Tracking",
      "beschreibung": "wo steht der Neue, wo hakt es — Meilenstein-Status",
      "reifegrad": 2,
      "referenz": "O2c/O2a; F-M28-006, F-M28-004"
    },
    {
      "hebel_id": "H-M28-004",
      "name": "Mentoring-/Paten-Matching & -Steuerung",
      "beschreibung": "wer betreut wen, Aufgaben/Termine, Belastung sichtbar",
      "reifegrad": 2,
      "referenz": "O4a; F-M28-009, F-M28-024"
    },
    {
      "hebel_id": "H-M28-005",
      "name": "Probezeit-Feedback-Assistent",
      "beschreibung": "strukturierte Zwischengespräche, Frühwarnung Fehlbesetzung",
      "reifegrad": 2,
      "referenz": "O5a; F-M28-010, F-M28-018"
    },
    {
      "hebel_id": "H-M28-006",
      "name": "„Wie machen wir das hier\"-Assistent für Neue",
      "beschreibung": "durchsuchbare Muster/Checklisten statt Kollegen fragen",
      "reifegrad": 3,
      "referenz": "O3a/O4a; F-M28-007, F-M28-009 (nutzt Wissensplattform → M-39)"
    },
    {
      "hebel_id": "H-M28-007",
      "name": "Wissenstransfer-/Offboarding-Assistent",
      "beschreibung": "bei Abgang Mandatswissen strukturiert sichern & übergeben",
      "reifegrad": 3,
      "referenz": "O3b; F-M28-008, F-M28-023 (Grenze M-39)"
    },
    {
      "hebel_id": "H-M28-008",
      "name": "Zielgruppen-Onboarding-Pfade",
      "beschreibung": "Azubi/Quereinsteiger/Remote automatisch differenziert",
      "reifegrad": 3,
      "referenz": "O6; F-M28-020, F-M28-021, F-M28-022"
    },
    {
      "hebel_id": "H-M28-009",
      "name": "Frühfluktuations-Frühwarnung",
      "beschreibung": "Abbruch-Risiko in den ersten Monaten erkennen",
      "reifegrad": 4,
      "referenz": "O5b; F-M28-011, F-M28-019"
    },
    {
      "hebel_id": "H-M28-010",
      "name": "Time-to-Productivity-Analyse",
      "beschreibung": "Einarbeitungsdauer messen, Engpässe/Muster über Einstellungen",
      "reifegrad": 4,
      "referenz": "O2a; F-M28-004, F-M28-016"
    },
    {
      "hebel_id": "H-M28-011",
      "name": "Onboarding-Buddy-Chatbot",
      "beschreibung": "Neue fragen KI statt laufend Kollegen zu unterbrechen",
      "reifegrad": 3,
      "referenz": "O3a; F-M28-007, F-M28-022"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-35 · stb_modul_m35 · 11 Kern / 13 Vertiefung / 11 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m35',
  'M-35 – Gesellschafts-, Nachfolge- & Gesellschafterverträge',
  '1.0',
  'M-35 – Gesellschafts-, Nachfolge- & Gesellschafterverträge — StB-KERN-Cut (DEC-242). 24 Fragen (11 Kern / 13 Vertiefung), 11 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-35-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "ac6566f9-bc99-5568-bba1-7e8aa3563293",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "51c11209-4715-5b1f-b5f8-540da36bb6e5",
        "frage_id": "F-M35-001",
        "text": "In welcher Rechtsform führen Sie Ihre Kanzlei (Einzelkanzlei, GbR/Sozietät, PartG/PartGmbB, StB-GmbH) — und passt diese Form noch zu Größe, Haftungslage und Nachfolgeabsicht?",
        "ebene": "Kern",
        "unterbereich": "g1a_rechtsform",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "d234444a-9882-5362-a46c-bbda51d04818",
        "frage_id": "F-M35-002",
        "text": "Gibt es eine geregelte vertragliche Grundlage (bei mehreren Gesellschaftern: Gesellschaftsvertrag) — und wann wurde sie zuletzt an die heutige Realität angepasst, oder liegt sie unverändert in der Schublade?",
        "ebene": "Kern",
        "unterbereich": "g1b_gv_aktualitaet",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "9244d467-0fe2-5b4a-b9fc-0f5a064ca61e",
        "frage_id": "F-M35-003",
        "text": "Ist Ihre Nachfolge vertraglich/rechtlich überhaupt geregelt — oder existiert sie bisher nur als Absicht im Kopf?",
        "ebene": "Kern",
        "unterbereich": "g3a_nachfolge_geregelt",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "0da5fc80-0925-59ed-bf24-49d26cca66ee",
        "frage_id": "F-M35-004",
        "text": "Welchen Nachfolge-Weg verfolgen Sie (interne Nachfolge, Verkauf, Zusammenschluss/Partneraufnahme) und in welchem Zeithorizont — und ist dieser Weg schon vertraglich unterlegt oder erst Idee?",
        "ebene": "Kern",
        "unterbereich": "g3b_weg_horizont",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "4e612f2e-e968-5837-be32-46721cb3c7d5",
        "frage_id": "F-M35-005",
        "text": "Ist geregelt, wie ein Gesellschafteranteil bei Aus-/Eintritt bewertet und abgefunden wird (Methode, Deckelung, Auszahlungsmodus) — oder wäre das im Ernstfall Streitstoff?",
        "ebene": "Kern",
        "unterbereich": "g4b_bewertung_abfindung",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "97665225-5554-5f94-bbc1-7468a8ee11d8",
        "frage_id": "F-M35-006",
        "text": "Ist für Ihren Ausfall eine berufsrechtliche Vertreterregelung (§69 StBerG) getroffen — ein bestellter/vereinbarter Praxisvertreter, der die Kanzlei fortführen dürfte?",
        "ebene": "Kern",
        "unterbereich": "g5a_vertreterregelung",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "f20d37f2-e26a-5f64-b2e5-35518cbbb1ae",
        "frage_id": "F-M35-007",
        "text": "Kennen Sie den ungefähren Wert Ihrer Kanzlei als Übergabeobjekt und wissen Sie, worauf er sich stützt (Umsatz, Mandantenstruktur, Inhaberabhängigkeit) — oder ist das offen?",
        "ebene": "Kern",
        "unterbereich": "g6a_praxiswert",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "49758086-aef2-5712-b01e-76b6217ef3cf",
        "frage_id": "F-M35-008",
        "text": "Ist im Todesfall geregelt, was mit Ihrer Kanzlei/Ihren Anteilen passiert (Testament, erbrechtliche Nachfolgeklausel) — oder fiele die Kanzlei an eine Erbengemeinschaft, die sie nicht fortführen kann?",
        "ebene": "Kern",
        "unterbereich": "g5b_erbfolge_testament",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "d0c5c2ca-3d94-5fb2-9fbc-8af4bbc9dc7a",
        "frage_id": "F-M35-009",
        "text": "Gibt es Vollmachten/Notfall-Regelungen, die kurzfristige Handlungsfähigkeit sichern, wenn Sie plötzlich ausfallen (Bank, Mandanten, Behörden, Fristen)?",
        "ebene": "Kern",
        "unterbereich": "g5c_vollmachten_notfall",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5bd2a2cb-32e5-5519-9d0b-e2b1b6716f73",
        "frage_id": "F-M35-010",
        "text": "Enthält Ihr Gesellschafts-/Praxisvertrag konkrete Nachfolge-/Fortsetzungsklauseln (was mit dem Anteil bei Ausscheiden/Tod passiert) — oder schweigt der Vertrag dazu?",
        "ebene": "Kern",
        "unterbereich": "g3c_nachfolgeklauseln",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "1d6ba5af-4412-5caa-aa01-1aa9e7ab2061",
        "frage_id": "F-M35-011",
        "text": "Falls ein Verkauf/eine Übergabe ansteht: Sind die Konditionen durchdacht (Mandantenübertragung, Wettbewerbsverbot, Kaufpreis/Earn-out, Übergangsphase mit Ihnen) — oder ist das noch weißes Blatt?",
        "ebene": "Kern",
        "unterbereich": "g6b_uebergabe_konditionen",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "7f76d412-0993-5906-b898-85ed872f8f1b",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "e5b81fd9-251c-5f13-a138-fa4f5e73f306",
        "frage_id": "F-M35-012",
        "text": "Wenn Sie heute neu gründen würden: Wäre Ihre jetzige Rechtsform noch die richtige — oder tragen Sie eine Form mit, die aus Haftungs-/Nachfolgesicht nicht mehr passt?",
        "ebene": "Vertiefung",
        "unterbereich": "g1a_rechtsform",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "c935c37f-07e4-52ee-bb4a-2ea1b797b032",
        "frage_id": "F-M35-013",
        "text": "Ist Ihre Gesellschafterstruktur berufsrechtskonform (StBerG-Anforderungen an Berufsträger-Beteiligung/-Mehrheit) — auch mit Blick auf einen künftigen Partner/Nachfolger?",
        "ebene": "Vertiefung",
        "unterbereich": "g1c_berufsrecht_konformitaet",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "fbeea4dd-6e41-5154-bfe9-44c26e93446c",
        "frage_id": "F-M35-014",
        "text": "Bei mehreren Gesellschaftern: Wie sind Beteiligung, Stimmrechte und Gewinnverteilung geregelt — und passt das noch zum tatsächlichen Beitrag jedes Partners?",
        "ebene": "Vertiefung",
        "unterbereich": "g2a_beteiligung_stimmrechte",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "d9998a46-d0e3-5ccc-afea-eb6708a2bc97",
        "frage_id": "F-M35-015",
        "text": "Gibt es für den Streit-/Pattfall eine Regelung (Schlichtung, Hinauskündigung, Deadlock-Auflösung) — oder wäre ein Gesellschafterkonflikt existenzbedrohend?",
        "ebene": "Vertiefung",
        "unterbereich": "g2b_konfliktregelung",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "4d916102-5d13-5587-b9f3-e4a2076ab8fc",
        "frage_id": "F-M35-016",
        "text": "Ist geregelt, wie ein neuer Partner aufgenommen bzw. ein Gesellschafter ausscheiden kann (Fristen, Bedingungen, Andienungspflicht) — oder müsste das frei verhandelt werden?",
        "ebene": "Vertiefung",
        "unterbereich": "g4a_ein_austritt",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "dfcdd2e8-c093-5235-ba1b-c363fc9988fd",
        "frage_id": "F-M35-017",
        "text": "Nach welcher Methode würde ein Anteil bewertet (Umsatzmethode, Ertragswert, festes Schema) — und ist die Abfindung so gestaltet, dass sie die Kanzlei-Liquidität nicht sprengt?",
        "ebene": "Vertiefung",
        "unterbereich": "g4b_bewertung_abfindung",
        "position": 17,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7d366539-c416-5ba1-8eee-ff54c6e65c5f",
        "frage_id": "F-M35-018",
        "text": "Sind Ihr Testament/Ehevertrag und Ihr Gesellschaftsvertrag aufeinander abgestimmt (keine widersprüchlichen Nachfolgeregelungen) — oder haben Sie das nie zusammen betrachtet?",
        "ebene": "Vertiefung",
        "unterbereich": "g5b_erbfolge_testament",
        "position": 18,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2958a248-8d89-5244-912f-0de23982285d",
        "frage_id": "F-M35-019",
        "text": "Welche drei Faktoren würden heute Ihren Übergabewert am stärksten drücken (Inhaberabhängigkeit, Mandantenkonzentration, Digitalisierungsrückstand) — und tun Sie etwas dagegen?",
        "ebene": "Vertiefung",
        "unterbereich": "g6a_praxiswert",
        "position": 19,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "f2892f4b-901d-5fd1-be29-9383d06d2c05",
        "frage_id": "F-M35-020",
        "text": "Haben Sie eine Vorstellung von der Übergangsphase (wie lange begleiten Sie den Nachfolger, wie werden Mandanten übergeleitet, wann ziehen Sie sich zurück)?",
        "ebene": "Vertiefung",
        "unterbereich": "g6b_uebergabe_konditionen",
        "position": 20,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "aaf0e0fb-e41b-5195-9ae4-082fcf80b995",
        "frage_id": "F-M35-021",
        "text": "Wirkt sich Ihr Güterstand/Ehevertrag auf Ihre Kanzleianteile aus (Zugewinnausgleich im Scheidungs-/Todesfall) — und ist das bewusst geregelt?",
        "ebene": "Vertiefung",
        "unterbereich": "g6c_privat_verzahnung",
        "position": 21,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "04151579-fd46-53ca-8702-37ad9d19e123",
        "frage_id": "F-M35-022",
        "text": "Lebt Ihr Gesellschaftsvertrag die Realität (tatsächliche Rollen, Gewinnverteilung, Entscheidungswege) — oder weicht die gelebte Praxis vom Papier ab?",
        "ebene": "Vertiefung",
        "unterbereich": "g1b_gv_aktualitaet",
        "position": 22,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "67dccb1b-c391-5715-856a-2728370aea0c",
        "frage_id": "F-M35-023",
        "text": "Haben Sie mit den Betroffenen (möglicher Nachfolger, Partner, Familie) über Ihren Nachfolge-Weg gesprochen — oder ist der Plan bisher nur Ihrer?",
        "ebene": "Vertiefung",
        "unterbereich": "g3b_weg_horizont",
        "position": 23,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2a8f60d9-37b6-5023-943d-a6f1efec6355",
        "frage_id": "F-M35-024",
        "text": "Wenn Sie morgen für längere Zeit ausfielen: Wäre rechtlich in Stunden geklärt, wer die Kanzlei fortführt und zeichnet — oder gäbe es ein Vakuum mit Fristen-/Haftungsrisiko?",
        "ebene": "Vertiefung",
        "unterbereich": "g5a_vertreterregelung",
        "position": 24,
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
  "modul_id": "M-35",
  "modul_key": "m35",
  "modul_kategorie": "Recht & Verträge",
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
    "beschreibung": "Aus den M-35-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "G1",
      "name": "Rechtsform & Gesellschaftsvertrag",
      "unterpunkte": [
        "Rechtsform (Einzelkanzlei/GbR/PartG/PartGmbB/StB-GmbH) & Passung",
        "Gesellschaftsvertrag vorhanden & aktuell (gelebt vs. Schublade)",
        "Berufsrechts-Konformität (StBerG: Berufsträger-Beteiligung/-Mehrheit)"
      ]
    },
    {
      "key": "G2",
      "name": "Gesellschafter-Struktur & Beschlussfassung",
      "unterpunkte": [
        "Beteiligungsverhältnisse, Stimmrechte, Gewinnverteilung",
        "Konflikt-/Deadlock-Regelung (Schlichtung, Hinauskündigung)"
      ]
    },
    {
      "key": "G3",
      "name": "Nachfolge-Regelung (Eingang A)",
      "unterpunkte": [
        "Ist die Nachfolge überhaupt vertraglich geregelt",
        "Weg (intern/extern/Verkauf/Zusammenschluss) & Zeithorizont",
        "Nachfolge-/Fortsetzungsklauseln im Vertrag"
      ]
    },
    {
      "key": "G4",
      "name": "Ein-/Austritt & Anteilsbewertung",
      "unterpunkte": [
        "Aufnahme/Ausscheiden von Gesellschaftern (Regeln, Andienung)",
        "Anteilsbewertung & Abfindung (Methode, Deckelung, Auszahlung)"
      ]
    },
    {
      "key": "G5",
      "name": "Notfall-/Ausfallvorsorge (Tod/BU/Krankheit)",
      "unterpunkte": [
        "Vertreterregelung §69 StBerG (Praxis-/Berufsträger-Ausfall)",
        "Erbfolge/Testament bzgl. Kanzlei (verhindert Zersplitterung an Erben)",
        "Vollmachten & Not-Nachfolger (kurzfristige Handlungsfähigkeit)"
      ]
    },
    {
      "key": "G6",
      "name": "Praxiswert, Übergabe-Konditionen & Privat-Verzahnung",
      "unterpunkte": [
        "Praxiswert/Bewertung (Basis für Kaufpreis/Übergabewert)",
        "Übergabe-Konditionen (Mandantenübertragung, Wettbewerbsverbot, Earn-out, Übergangsphase)",
        "Ehe-/Güterstand-/Erbrecht-Wirkung auf Kanzleianteile"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M35-001",
      "name": "Nachfolge-Fahrplan-Generator",
      "beschreibung": "Weg + Zeitachse + Meilensteine + wer wann einzubinden",
      "reifegrad": 2,
      "referenz": "G3; F-M35-003, F-M35-004"
    },
    {
      "hebel_id": "H-M35-002",
      "name": "Vertrags-Lücken-Check Gesellschaftsvertrag",
      "beschreibung": "fehlende Nachfolge-/Ausscheidens-/Deadlock-Klauseln aufdecken",
      "reifegrad": 2,
      "referenz": "G1b/G2b/G3c; F-M35-002, F-M35-010, F-M35-015"
    },
    {
      "hebel_id": "H-M35-003",
      "name": "Notfall-/Ausfall-Vorsorge-Checkliste",
      "beschreibung": "§69-Vertreter, Vollmachten, Fristen-Handlungsfähigkeit",
      "reifegrad": 2,
      "referenz": "G5; F-M35-006, F-M35-009, F-M35-024"
    },
    {
      "hebel_id": "H-M35-004",
      "name": "Rechtsform-Passungs-Check",
      "beschreibung": "aktuelle Form vs. Größe/Haftung/Nachfolgeziel",
      "reifegrad": 2,
      "referenz": "G1a/G1c; F-M35-001, F-M35-013"
    },
    {
      "hebel_id": "H-M35-005",
      "name": "Praxiswert-Indikation",
      "beschreibung": "grobe Bewertung + Werttreiber/-drücker sichtbar",
      "reifegrad": 3,
      "referenz": "G6a; F-M35-007, F-M35-019"
    },
    {
      "hebel_id": "H-M35-006",
      "name": "Übergabewert-Optimierungs-Assistent",
      "beschreibung": "welche Faktoren senken den Wert, konkrete Gegenmaßnahmen",
      "reifegrad": 3,
      "referenz": "G6a; F-M35-019"
    },
    {
      "hebel_id": "H-M35-007",
      "name": "Anteilsbewertungs-/Abfindungs-Simulator",
      "beschreibung": "Methode durchrechnen, Deckelung, Liquiditätswirkung",
      "reifegrad": 3,
      "referenz": "G4b; F-M35-005, F-M35-017"
    },
    {
      "hebel_id": "H-M35-008",
      "name": "Erb-/Vertrags-Konsistenz-Check",
      "beschreibung": "Testament/Ehevertrag vs. Gesellschaftsvertrag auf Widersprüche",
      "reifegrad": 3,
      "referenz": "G5b/G6c; F-M35-008, F-M35-018, F-M35-021"
    },
    {
      "hebel_id": "H-M35-009",
      "name": "Dokument-/Fristen-Tresor Nachfolge",
      "beschreibung": "Verträge/Vollmachten zentral, Ablauf-/Review-Erinnerung",
      "reifegrad": 2,
      "referenz": "G1b/G5c; F-M35-002, F-M35-009"
    },
    {
      "hebel_id": "H-M35-010",
      "name": "Übergabe-Konditionen-Konfigurator",
      "beschreibung": "Wettbewerbsverbot, Earn-out, Übergangsphase strukturieren",
      "reifegrad": 3,
      "referenz": "G6b; F-M35-011, F-M35-020"
    },
    {
      "hebel_id": "H-M35-011",
      "name": "Nachfolge-Reifegrad-Radar",
      "beschreibung": "Gesamtbild Übergabefähigkeit über alle Rechts-/Vertragsdimensionen",
      "reifegrad": 4,
      "referenz": "G1–G6; F-M35-003, F-M35-006, F-M35-007"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-36 · stb_modul_m36 · 9 Kern / 8 Vertiefung / 8 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m36',
  'M-36 – Systemlandschaft & Integrationen',
  '1.0',
  'M-36 – Systemlandschaft & Integrationen — StB-KERN-Cut (DEC-242). 17 Fragen (9 Kern / 8 Vertiefung), 8 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-36-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "6c7553b5-af1b-59b7-bc26-9c3521eb33f5",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "e7629c1a-930c-54d2-ab3d-77e7ca9697ee",
        "frage_id": "F-M36-001",
        "text": "Welche Kern-Systeme setzen Sie in der Kanzlei ein (DATEV, Kanzleisoftware, Dokumentenmanagement, Zeiterfassung, Kommunikation) — und haben Sie einen klaren Überblick, was wofür genutzt wird?",
        "ebene": "Kern",
        "unterbereich": "i1a_kern_systeme",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "09fefc9e-35db-501c-9443-efcb589d3bee",
        "frage_id": "F-M36-002",
        "text": "Ist Ihre Tool-Landschaft geordnet — oder eher gewachsener Wildwuchs mit Insellösungen und einem „Excel-Zoo\" daneben?",
        "ebene": "Kern",
        "unterbereich": "i1b_tool_wildwuchs",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "fd8ece35-6aaa-52ef-a053-c78144d4b129",
        "frage_id": "F-M36-003",
        "text": "Wie gut sind Ihre Systeme miteinander verbunden — fließen Daten automatisch, oder arbeiten die Systeme weitgehend isoliert nebeneinander?",
        "ebene": "Kern",
        "unterbereich": "i2a_integration_grad",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7313f153-0170-5bee-ba0f-06f6b0ebf56d",
        "frage_id": "F-M36-004",
        "text": "Welcher Anteil Ihrer Mandanten liefert Belege noch analog / mit Medienbruch — und wo erfassen Sie mangels Schnittstelle doppelt?",
        "ebene": "Kern",
        "unterbereich": "i2b_medienbrueche",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "8320b6f5-bc0f-534c-a6b3-55944254c305",
        "frage_id": "F-M36-005",
        "text": "Wo setzen Sie KI in Ihrer Kanzlei heute produktiv ein — nur zum Recherchieren, oder auch in FiBu/Belegverarbeitung/Mandantenkommunikation?",
        "ebene": "Kern",
        "unterbereich": "i3a_ki_produktiv",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a7f082b7-b51d-5992-9df8-7dc9c0b18396",
        "frage_id": "F-M36-006",
        "text": "Bei welchem Anteil Ihrer Mandate oder Prozesse ist KI/Automatisierung heute wirklich im Einsatz — flächendeckend, in Pilotinseln, oder faktisch gar nicht?",
        "ebene": "Kern",
        "unterbereich": "i3b_ki_abdeckung",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "3e2d79ca-24ab-5681-9840-43591befaf52",
        "frage_id": "F-M36-007",
        "text": "Welche Routineprozesse in Ihrer Kanzlei laufen automatisiert (z. B. Belegabruf, Buchungsvorschläge, Fristenmonitoring, Mandanten-Erinnerungen) — und welche machen Sie noch komplett manuell?",
        "ebene": "Kern",
        "unterbereich": "i4a_automatisierte_prozesse",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "78b97545-6018-5bb4-a173-b3c2be72b6d6",
        "frage_id": "F-M36-008",
        "text": "Wie würden Sie den Digitalisierungsgrad Ihrer Kanzlei insgesamt einschätzen — durchgehend digital, teils-teils, oder in vielem noch papier-/manuell-getrieben?",
        "ebene": "Kern",
        "unterbereich": "i5a_digitalisierungsgrad",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "50f209e3-56f6-5b65-9f28-8f05b1fdfc74",
        "frage_id": "F-M36-009",
        "text": "Steckt hinter Ihrer System-/IT-Landschaft eine bewusste Digitalisierungsstrategie — oder ist sie über die Jahre gewachsen, ohne dass jemand das Gesamtbild steuert?",
        "ebene": "Kern",
        "unterbereich": "i6b_digital_strategie",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "a10dcfab-45e7-5357-afca-1fedb66472c8",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "b4677f9d-7cc8-5a7c-bd15-8b185e643c86",
        "frage_id": "F-M36-010",
        "text": "Wie ist Ihr Stand bei der DATEV-Cloud-Umstellung (ab Herbst 2026) — haben Sie einen Plan, wie Ihre Systemlandschaft darauf umgestellt wird?",
        "ebene": "Vertiefung",
        "unterbereich": "i1c_datev_cloud_stand",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "99fe2290-791c-5ac1-a3dc-4319eab055e1",
        "frage_id": "F-M36-011",
        "text": "Über welche Schnittstellen kommen Mandantendaten zu Ihnen (Portal, Upload, Bank-Schnittstelle, DATEV Unternehmen online) — oder läuft vieles per Mail/Papier/Schuhkarton?",
        "ebene": "Vertiefung",
        "unterbereich": "i2c_schnittstellen_mandant",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "2a6a0f38-fa03-5c37-946d-96def29855da",
        "frage_id": "F-M36-012",
        "text": "Wo läge in Ihrer Kanzlei das größte ungenutzte Potenzial für KI/Automatisierung — welcher zeitfressende Prozess schreit danach?",
        "ebene": "Vertiefung",
        "unterbereich": "i3c_ki_potenzial",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "bf136ea4-9045-532b-9f61-a38dc8a12a61",
        "frage_id": "F-M36-013",
        "text": "Kennen Sie Ihre digitale Belegquote, und wie automatisiert ist die Belegerfassung (OCR, Buchungsvorschläge, direkte Bankdaten) — oder wird viel noch manuell abgetippt?",
        "ebene": "Vertiefung",
        "unterbereich": "i4b_belegquote_erfassung",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "abff74af-7258-567f-bf06-3e74e3b178f2",
        "frage_id": "F-M36-014",
        "text": "Automatisieren Sie systematisch (Sie schauen aktiv, wo sich Prozesse automatisieren lassen) — oder passiert das nur zufällig, wenn ein Tool es zufällig mitbringt?",
        "ebene": "Vertiefung",
        "unterbereich": "i4c_automatisierungs_stand",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "11bcc194-9f44-5b86-b5ef-32429e503737",
        "frage_id": "F-M36-015",
        "text": "Wie digital sind Ihre Mandanten aufgestellt — nutzen sie Portale/digitale Belege — und wie gehen Sie mit den analog-getriebenen Mandanten um?",
        "ebene": "Vertiefung",
        "unterbereich": "i5b_mandanten_digital",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "d27c891b-fb2c-5fba-9a63-23646a0665d7",
        "frage_id": "F-M36-016",
        "text": "Wie digital arbeiten Sie intern und mit Mandanten zusammen (Portal, sichere Dokumentenübergabe, digitale Signatur, gemeinsame Ablage) — oder dominiert Mail-Anhang und Papier?",
        "ebene": "Vertiefung",
        "unterbereich": "i5c_digitale_zusammenarbeit",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "c140cf8f-0855-5576-89f8-bbbba530082e",
        "frage_id": "F-M36-017",
        "text": "Wer verantwortet bei Ihnen IT und Systemauswahl (interne Rolle, externer Dienstleister, der Inhaber nebenbei) — und ist jemand für die digitale Weiterentwicklung zuständig?",
        "ebene": "Vertiefung",
        "unterbereich": "i6a_it_ownership",
        "position": 17,
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
  "modul_id": "M-36",
  "modul_key": "m36",
  "modul_kategorie": "IT, Daten & Tools",
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
    "beschreibung": "Aus den M-36-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "I1",
      "name": "Systemlandschaft & Kern-Tools",
      "unterpunkte": [
        "Kern-Systeme (DATEV, Kanzleisoftware, DMS, Zeiterfassung) (Grenze: KPIs → M-07)",
        "Geordnete Tool-Landschaft vs. Wildwuchs/Insellösungen/Excel-Zoo",
        "DATEV-Cloud-Umstellung (ab Herbst 2026) — Stand/Plan (Grenze: als Sicherheit/§203 → M-38)"
      ]
    },
    {
      "key": "I2",
      "name": "Integration & Medienbrüche",
      "unterpunkte": [
        "Integrationsgrad vs. isolierte Systeme",
        "Medienbrüche/Doppelerfassung",
        "Schnittstellen zum Mandanten (Portal/Bank/Upload vs. Mail/Papier)"
      ]
    },
    {
      "key": "I3",
      "name": "KI-Einsatz (produktiv)",
      "unterpunkte": [
        "Wo KI produktiv (FiBu/Beleg/Kommunikation, nicht nur Recherche)",
        "Bei welchem Anteil Mandate/Prozesse KI im Einsatz",
        "Größtes ungenutztes KI-/Automatisierungs-Potenzial (Grenze: Modelleffekt → M-01, Personal → M-26)"
      ]
    },
    {
      "key": "I4",
      "name": "Prozess-Automatisierung",
      "unterpunkte": [
        "Welche Routineprozesse automatisiert vs. manuell",
        "Digitale Belegquote & automatisierte Erfassung (Grenze: als DATEV-Cloud/Compliance → M-38)",
        "Systematisch automatisieren vs. Einzelfall"
      ]
    },
    {
      "key": "I5",
      "name": "Digitale Reife & Mandanten-Digitalisierung",
      "unterpunkte": [
        "Digitalisierungsgrad der Kanzlei insgesamt",
        "Digitalisierungsgrad der Mandanten (analoge Belege, Portal)",
        "Digitale Zusammenarbeit intern/mit Mandanten (Grenze: sichere Übergabe → M-38)"
      ]
    },
    {
      "key": "I6",
      "name": "IT-Steuerung & Zukunftsfähigkeit",
      "unterpunkte": [
        "Wer verantwortet IT/Systemauswahl (Grenze: Rollen → M-02)",
        "Bewusste IT-/Digitalisierungs-Strategie vs. gewachsen",
        "Zukunftsfähigkeit der Landschaft (KI-/DATEV-Cloud-fähig) (Grenze: Sicherheit/Backup → M-38)"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M36-001",
      "name": "Systemlandschafts-Landkarte",
      "beschreibung": "alle Systeme + Integrationen + Insellösungen sichtbar machen",
      "reifegrad": 2,
      "referenz": "I1/I2; F-M36-001, F-M36-002, F-M36-003"
    },
    {
      "hebel_id": "H-M36-002",
      "name": "Medienbruch-/Doppelerfassungs-Radar",
      "beschreibung": "wo analog/doppelt erfasst wird, Integrations-Kandidaten",
      "reifegrad": 2,
      "referenz": "I2b; F-M36-004, F-M36-011"
    },
    {
      "hebel_id": "H-M36-003",
      "name": "KI-Einsatz-Assessment",
      "beschreibung": "wo KI heute produktiv läuft + größte ungenutzte Potenziale",
      "reifegrad": 3,
      "referenz": "I3; F-M36-005, F-M36-006, F-M36-012"
    },
    {
      "hebel_id": "H-M36-004",
      "name": "Prozess-Automatisierungs-Finder",
      "beschreibung": "Routineprozesse mit Automatisierungspotenzial identifizieren + priorisieren",
      "reifegrad": 3,
      "referenz": "I4; F-M36-007, F-M36-013, F-M36-014"
    },
    {
      "hebel_id": "H-M36-005",
      "name": "DATEV-Cloud-Readiness-Check",
      "beschreibung": "Stand + Plan für die Umstellung, systemseitig",
      "reifegrad": 2,
      "referenz": "I1c; F-M36-010 (Grenze: Sicherheit/§203 → M-38)"
    },
    {
      "hebel_id": "H-M36-006",
      "name": "Belegquote-/digitale-Erfassungs-Optimierer",
      "beschreibung": "Belegquote heben, Erfassung automatisieren",
      "reifegrad": 3,
      "referenz": "I4b; F-M36-013"
    },
    {
      "hebel_id": "H-M36-007",
      "name": "Mandanten-Digitalisierungs-Assistent",
      "beschreibung": "Mandanten auf digitale Belege/Portale heben",
      "reifegrad": 2,
      "referenz": "I5b; F-M36-015, F-M36-016"
    },
    {
      "hebel_id": "H-M36-008",
      "name": "KI-/Digital-Readiness-Radar",
      "beschreibung": "Systemlandschaft, Integration, KI-Einsatz, DATEV-Cloud-Fähigkeit — Gesamtbild",
      "reifegrad": 4,
      "referenz": "I1–I6; F-M36-005, F-M36-009, F-M36-010"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-38 · stb_modul_m38 · 9 Kern / 8 Vertiefung / 8 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m38',
  'M-38 – IT-Sicherheit, Backups & Ausfallrisiken',
  '1.0',
  'M-38 – IT-Sicherheit, Backups & Ausfallrisiken — StB-KERN-Cut (DEC-242). 17 Fragen (9 Kern / 8 Vertiefung), 8 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-38-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "785fda23-85b1-5b10-a179-a0633a3b0cc0",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "cbacbbd1-bb46-5324-8b7a-de3f8851e599",
        "frage_id": "F-M38-001",
        "text": "Wie schützen Sie die sensiblen Mandantendaten in Ihrer Kanzlei technisch (verschlüsselte Ablage, sichere Übertragung, Zugriffsschutz) — oder liegen viele Daten faktisch ungeschützt auf Laufwerken und in Mail-Postfächern?",
        "ebene": "Kern",
        "unterbereich": "t1a_mandantendaten_schutz",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "17be70ba-df1b-5cc5-9d74-2f054a6fd789",
        "frage_id": "F-M38-002",
        "text": "Haben Sie eine klare Regel, welche KI-Tools mit Mandantenbezug erlaubt sind und welche nicht — im Hinblick auf das Mandantengeheimnis (§203 StGB)?",
        "ebene": "Kern",
        "unterbereich": "t1b_ki_tool_regel_203",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "aba295ee-54dd-54eb-928f-accf3c961d41",
        "frage_id": "F-M38-003",
        "text": "Gibt es ein klares Rollen-/Rechtekonzept — wer in Ihrer Kanzlei auf welche Daten und Systeme zugreifen darf — oder hat faktisch fast jeder Zugriff auf fast alles?",
        "ebene": "Kern",
        "unterbereich": "t2a_berechtigungskonzept",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "808baa25-f1ff-5d40-a1d9-1443f42551ba",
        "frage_id": "F-M38-004",
        "text": "Wie sicher sind Ihre Zugänge (starke Passwörter, Mehr-Faktor-Authentifizierung) — oder gibt es geteilte Passwörter, Notizzettel und Konten, die mehrere nutzen?",
        "ebene": "Kern",
        "unterbereich": "t2b_passwort_zugaenge",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "bb491514-7d70-5ffc-8efe-2badbcb2dd0f",
        "frage_id": "F-M38-005",
        "text": "Haben Sie eine Backup-Strategie, die klar regelt, was wie oft und wohin gesichert wird — oder verlassen Sie sich darauf, dass „das der Dienstleister/die Cloud schon macht\"?",
        "ebene": "Kern",
        "unterbereich": "t3a_backup_strategie",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "06dcdcd7-eaa9-522b-a117-4563c3315d24",
        "frage_id": "F-M38-006",
        "text": "Haben Sie schon einmal getestet, ob sich Ihre Daten aus dem Backup tatsächlich wiederherstellen lassen — oder wissen Sie nur, dass „irgendwas gesichert wird\"?",
        "ebene": "Kern",
        "unterbereich": "t3b_wiederherstellung_getestet",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "733f0c14-a5cf-5201-81ef-44989f8ae170",
        "frage_id": "F-M38-007",
        "text": "Welche IT-Ausfälle würden Ihre Kanzlei am härtesten treffen (Server, Internet, DATEV, zentrale Software) — und wie lange könnten Sie ohne diese Systeme überhaupt arbeiten?",
        "ebene": "Kern",
        "unterbereich": "t4a_it_ausfallrisiko",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "50a8e259-e90d-5018-b676-7e7b1a69139d",
        "frage_id": "F-M38-008",
        "text": "Gibt es einen Notfallplan für einen IT-Ausfall oder Sicherheitsvorfall (wer tut was, wen rufen Sie an) — oder würden Sie im Ernstfall improvisieren?",
        "ebene": "Kern",
        "unterbereich": "t4b_notfallplan",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "aac105d3-1460-566a-9f7d-fe251cb5bce8",
        "frage_id": "F-M38-009",
        "text": "Wer ist bei Ihnen für IT-Sicherheit verantwortlich (interne Rolle, IT-Dienstleister, faktisch niemand) — und kümmert sich jemand aktiv darum, oder läuft es „bis etwas passiert\"?",
        "ebene": "Kern",
        "unterbereich": "t6a_security_ownership",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "7d250535-e8dd-53ae-82a7-8e3e00078f37",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "a3924861-9583-55cb-b3c6-4ea4c7fc1b11",
        "frage_id": "F-M38-010",
        "text": "Ist Ihre Datenverarbeitung DSGVO-konform aufgesetzt (Verarbeitungsverzeichnis, AV-Verträge mit Dienstleistern, Löschkonzept) — oder ist das seit Einführung nie wirklich sauber gemacht worden?",
        "ebene": "Vertiefung",
        "unterbereich": "t1c_dsgvo_compliance",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "39e86d41-1d56-5374-8013-9595d804d8f5",
        "frage_id": "F-M38-011",
        "text": "Werden bei einem Mitarbeiter-Austritt zuverlässig alle Zugänge und Rechte entzogen (Systeme, DATEV, Mail, Cloud) — oder existieren noch aktive Konten von längst ausgeschiedenen Personen?",
        "ebene": "Vertiefung",
        "unterbereich": "t2c_offboarding_zugaenge",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "15829dad-f69a-587c-97f4-a31122efe8d4",
        "frage_id": "F-M38-012",
        "text": "Was würde konkret passieren, wenn Ihre Kanzleidaten morgen durch Ransomware verschlüsselt oder durch einen Hardware-Crash zerstört wären — wie schnell wären Sie wieder arbeitsfähig?",
        "ebene": "Vertiefung",
        "unterbereich": "t3c_datenverlust_szenario",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "48fee960-5b9f-5f72-936f-112f417b1122",
        "frage_id": "F-M38-013",
        "text": "Wie schnell wären Sie nach einem IT-Ausfall wieder handlungsfähig, ohne dass Fristen platzen — Stunden, Tage, oder ist das völlig offen?",
        "ebene": "Vertiefung",
        "unterbereich": "t4c_handlungsfaehigkeit",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "88040b8e-5cf1-5785-9771-3faec67955e1",
        "frage_id": "F-M38-014",
        "text": "Welche technischen Schutzmaßnahmen haben Sie (Firewall, Virenschutz/Endpoint, aktuelle Updates, sichere Mail) — und wer stellt sicher, dass das aktuell bleibt?",
        "ebene": "Vertiefung",
        "unterbereich": "t5a_cyber_schutz",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "e699f3bd-8066-51a6-ba90-109917c08343",
        "frage_id": "F-M38-015",
        "text": "Sind Ihre Mitarbeiter für Cyber-Risiken sensibilisiert (Phishing-Mails erkennen, keine Daten leichtfertig teilen) — oder wäre ein täuschend echtes Phishing bei Ihnen wahrscheinlich erfolgreich?",
        "ebene": "Vertiefung",
        "unterbereich": "t5b_awareness_team",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "bb38ca6c-7ea4-5634-b9d6-29ed9ff9fa92",
        "frage_id": "F-M38-016",
        "text": "Hatten Sie schon einmal einen Sicherheitsvorfall (Phishing, Datenverlust, Angriff) — und was haben Sie daraus abgeleitet, oder blieb es folgenlos?",
        "ebene": "Vertiefung",
        "unterbereich": "t5c_vorfall_erfahrung",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "994188dc-ce11-56c6-bf24-c321dd301a8d",
        "frage_id": "F-M38-017",
        "text": "Betrachten Sie die DATEV-Cloud-Umstellung auch aus Sicherheits-/Datenschutz-Sicht (wo liegen Daten, wer hat Zugriff, §203) — oder nur als technische Umstellung?",
        "ebene": "Vertiefung",
        "unterbereich": "t6b_datev_cloud_sicherheit",
        "position": 17,
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
  "modul_id": "M-38",
  "modul_key": "m38",
  "modul_kategorie": "IT, Daten & Tools",
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
    "beschreibung": "Aus den M-38-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "T1",
      "name": "Datensicherheit & Mandantengeheimnis (§203)",
      "unterpunkte": [
        "Technischer Schutz sensibler Mandantendaten (Verschlüsselung, sichere Übertragung/Ablage)",
        "Regel, welche KI-Tools mit Mandantenbezug erlaubt sind (§203/Schatten-KI)",
        "DSGVO-Konformität (Verarbeitungsverzeichnis, AV-Verträge, Löschkonzept)"
      ]
    },
    {
      "key": "T2",
      "name": "Zugriffs- & Berechtigungskonzept",
      "unterpunkte": [
        "Rollen-/Rechtekonzept (wer sieht/darf was)",
        "Passwort-/Zugangs-Sicherheit (MFA, geteilte Passwörter)",
        "Zugänge bei Austritt entzogen (Grenze: personelles Offboarding → M-28/M-26)"
      ]
    },
    {
      "key": "T3",
      "name": "Backup & Datensicherung",
      "unterpunkte": [
        "Backup-Strategie (was/wie oft/wohin)",
        "Wiederherstellung getestet (nicht nur „läuft\")",
        "Datenverlust-Szenario (Ransomware, Hardware-Crash)"
      ]
    },
    {
      "key": "T4",
      "name": "Ausfall & Notfallplan (IT)",
      "unterpunkte": [
        "Kritische IT-Ausfallrisiken (Server, Internet, DATEV, zentrale Systeme)",
        "Notfallplan/Runbook für IT-Ausfall (Grenze: §69/Struktur → M-35/M-02)",
        "Wiederanlauf-Zeit / Handlungsfähigkeit bei IT-Ausfall"
      ]
    },
    {
      "key": "T5",
      "name": "Cyber-Bedrohung & Awareness",
      "unterpunkte": [
        "Technische Schutzmaßnahmen (Firewall, Endpoint, Updates, sichere Mail)",
        "Mitarbeiter-Awareness (Phishing, Social Engineering)",
        "Bisherige Sicherheitsvorfälle / Vorbereitung"
      ]
    },
    {
      "key": "T6",
      "name": "Sicherheits-Steuerung & Reife",
      "unterpunkte": [
        "Wer verantwortet IT-Sicherheit (Grenze: allg. IT-Ownership → M-36 i6a)",
        "DATEV-Cloud aus Sicherheits-/Datenschutz-Sicht (Grenze: System-Readiness → M-36 i1c)",
        "Bewusste Sicherheits-Strategie vs. „wird schon nichts passieren\""
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M38-001",
      "name": "Mandantendaten-/§203-Schutz-Check",
      "beschreibung": "sensible Daten + KI-Tool-Regel mit Mandantenbezug prüfen",
      "reifegrad": 2,
      "referenz": "T1; F-M38-001, F-M38-002"
    },
    {
      "hebel_id": "H-M38-002",
      "name": "Berechtigungs-/Zugriffs-Analyse",
      "beschreibung": "Rollen-/Rechtekonzept, verwaiste Konten, Passwort-Sicherheit",
      "reifegrad": 2,
      "referenz": "T2; F-M38-003, F-M38-004, F-M38-011"
    },
    {
      "hebel_id": "H-M38-003",
      "name": "Backup-/Wiederherstellungs-Check",
      "beschreibung": "Backup-Strategie + Restore-Test-Plan",
      "reifegrad": 2,
      "referenz": "T3; F-M38-005, F-M38-006"
    },
    {
      "hebel_id": "H-M38-004",
      "name": "IT-Notfallplan-/Runbook-Generator",
      "beschreibung": "Ausfallrisiken + Notfallplan + Wiederanlauf",
      "reifegrad": 3,
      "referenz": "T4; F-M38-007, F-M38-008, F-M38-013"
    },
    {
      "hebel_id": "H-M38-005",
      "name": "Ransomware-/Datenverlust-Szenario-Simulation",
      "beschreibung": "Auswirkung + Vorbereitung durchspielen",
      "reifegrad": 3,
      "referenz": "T3c; F-M38-012"
    },
    {
      "hebel_id": "H-M38-006",
      "name": "Phishing-/Awareness-Trainer",
      "beschreibung": "Mitarbeiter-Sensibilisierung, simulierte Phishing-Checks",
      "reifegrad": 3,
      "referenz": "T5b; F-M38-015"
    },
    {
      "hebel_id": "H-M38-007",
      "name": "DSGVO-/Compliance-Check",
      "beschreibung": "Verarbeitungsverzeichnis, AV-Verträge, Löschkonzept strukturieren",
      "reifegrad": 2,
      "referenz": "T1c; F-M38-010"
    },
    {
      "hebel_id": "H-M38-008",
      "name": "IT-Sicherheits-Reife-Radar",
      "beschreibung": "Datenschutz, Zugriff, Backup, Ausfall, Awareness — Gesamtbild",
      "reifegrad": 4,
      "referenz": "T1–T6; F-M38-001, F-M38-005, F-M38-009"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-39 · stb_modul_m39 · 9 Kern / 8 Vertiefung / 8 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m39',
  'M-39 – Zentrale Wissensplattform & Dokumenttypen',
  '1.0',
  'M-39 – Zentrale Wissensplattform & Dokumenttypen — StB-KERN-Cut (DEC-242). 17 Fragen (9 Kern / 8 Vertiefung), 8 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-39-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "2d1603d7-3b13-5bd6-988d-e85c174bca39",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "8c159089-1f39-5997-bb8e-d7f6e43627cb",
        "frage_id": "F-M39-001",
        "text": "Wie viele Ihrer wiederkehrenden Kernprozesse (Jahresabschluss, Fristen, Mandanten-Onboarding) laufen dokumentiert und identisch — egal, wer sie ausführt — oder macht jeder es ein bisschen anders?",
        "ebene": "Kern",
        "unterbereich": "n1a_kernprozesse_dokumentiert",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a7b78049-8694-5f32-9732-0273ea42d393",
        "frage_id": "F-M39-002",
        "text": "Gibt es für Ihre wiederkehrenden Routineaufgaben Standards und Checklisten — oder verlässt sich alles auf Erfahrung und „das weiß der Kollege\"?",
        "ebene": "Kern",
        "unterbereich": "n1b_standard_checklisten",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "6cc04ab9-a096-52f1-a28f-1e2f7f750991",
        "frage_id": "F-M39-003",
        "text": "Welche Arten von Wissen halten Sie überhaupt fest (Prozesse, Checklisten, Vorlagen, Playbooks, fachliche Musterlösungen) — oder existiert das meiste nur in Köpfen und verstreuten Dateien?",
        "ebene": "Kern",
        "unterbereich": "n2a_wissensarten",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7769e3c2-203f-59b3-b492-9c46755b979d",
        "frage_id": "F-M39-004",
        "text": "Ist Ihr fachliches Spezial-Know-how (knifflige Auslegungen, Musterlösungen, Branchenwissen) irgendwo dokumentiert — oder steckt es ausschließlich in den Köpfen einzelner Personen?",
        "ebene": "Kern",
        "unterbereich": "n2b_fachwissen_ablage",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "28af1da1-3e58-5500-93ee-3a897cb8806e",
        "frage_id": "F-M39-005",
        "text": "Gibt es bei Ihnen eine zentrale Stelle, an der Wissen liegt — oder ist es über Laufwerke, Mail-Postfächer, Ordner und Köpfe verstreut?",
        "ebene": "Kern",
        "unterbereich": "n3a_zentrale_plattform",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "8358c953-bdaf-5a3c-a75a-14784f921b12",
        "frage_id": "F-M39-006",
        "text": "Findet ein Mitarbeiter das Wissen, das er braucht, schnell selbst — oder muss er in der Praxis doch immer jemanden fragen, weil man nichts wiederfindet?",
        "ebene": "Kern",
        "unterbereich": "n3b_auffindbarkeit",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "85fcb7a2-79c6-54bf-9ebe-bdb2e103ce44",
        "frage_id": "F-M39-007",
        "text": "Wird Ihr dokumentiertes Wissen gepflegt und aktuell gehalten — gibt es eine Routine dafür — oder veraltet vieles, sobald es einmal geschrieben wurde?",
        "ebene": "Kern",
        "unterbereich": "n4a_pflege_routine",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "4891f7ca-63cd-553f-9619-39c1528d07a1",
        "frage_id": "F-M39-008",
        "text": "Ist kritisches Wissen so dokumentiert, dass jemand übernehmen könnte, wenn eine Schlüsselperson ausfällt — oder ginge mit ihr viel unwiederbringlich verloren?",
        "ebene": "Kern",
        "unterbereich": "n5a_wissenssicherung",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5c167b96-13dc-5c4b-8712-19d8c801c334",
        "frage_id": "F-M39-009",
        "text": "Ist Ihre Wissensablage bewusst aufgebaut und strukturiert — oder eher historisch gewachsen und chaotisch, sodass sie kaum jemand aktiv nutzt?",
        "ebene": "Kern",
        "unterbereich": "n6a_wissens_reife",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "a552eb97-5fed-5b96-90f3-770273691ecf",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "abcde38d-4812-5aa1-bf4d-3e4a058f5017",
        "frage_id": "F-M39-010",
        "text": "Wenn Sie einen Ihrer Kernprozesse hernehmen: Würde er genauso ablaufen, wenn die Person, die ihn „immer macht\", drei Wochen ausfällt — oder hängt der Prozess faktisch an dieser Person?",
        "ebene": "Vertiefung",
        "unterbereich": "n1c_bus_faktor",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a7159729-9fe3-52c4-a338-ba562a5d84dd",
        "frage_id": "F-M39-011",
        "text": "Haben Sie zentrale Vorlagen, Muster und Textbausteine (Anschreiben, Mandantenkommunikation, Standard-Dokumente) — oder baut jeder seine eigenen immer wieder neu?",
        "ebene": "Vertiefung",
        "unterbereich": "n2c_vorlagen_muster",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "1d9b9f96-1464-5004-b357-bde0c12c47a6",
        "frage_id": "F-M39-012",
        "text": "Können sich Ihre Mitarbeiter auf das dokumentierte Wissen verlassen — ist es aktuell und widerspruchsfrei — oder kursieren mehrere veraltete Versionen nebeneinander?",
        "ebene": "Vertiefung",
        "unterbereich": "n3c_aktualitaet",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "dfd79847-a241-58f7-a477-99290b57f8c2",
        "frage_id": "F-M39-013",
        "text": "Gibt es jemanden, der für die Wissensplattform verantwortlich ist (Struktur, Pflege, Qualität) — oder ist das niemandes Job und verwaist deshalb?",
        "ebene": "Vertiefung",
        "unterbereich": "n4b_wissens_ownership",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "4260a5ea-aa78-5742-bac9-835bce2606a9",
        "frage_id": "F-M39-014",
        "text": "Tragen Ihre Mitarbeiter aktiv Wissen bei (halten fest, was sie gelernt haben) — oder ist Wissensdokumentation eine lästige Einbahnstraße, die kaum jemand freiwillig macht?",
        "ebene": "Vertiefung",
        "unterbereich": "n4c_beitrag_kultur",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "541d4caa-40b5-515b-84c3-8a2ab70c0fc1",
        "frage_id": "F-M39-015",
        "text": "Ist mandantenspezifisches Wissen (Besonderheiten, Historie, Absprachen) zentral festgehalten — oder weiß nur der jeweilige Betreuer, „wie dieser Mandant tickt\"?",
        "ebene": "Vertiefung",
        "unterbereich": "n5b_mandantenwissen",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "8b94f9b5-e574-5b1e-8a03-4f18c07ea275",
        "frage_id": "F-M39-016",
        "text": "Nutzen Sie (oder könnten Sie) KI, um Ihr Wissen durchsuchbar und sofort abrufbar zu machen (Fragen stellen statt Ordner durchsuchen) — oder ist Ihr Wissen dafür gar nicht aufbereitet?",
        "ebene": "Vertiefung",
        "unterbereich": "n6b_ki_wissensnutzung",
        "position": 16,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "724cf96a-c14e-5a5f-b4f0-1aa8100b4842",
        "frage_id": "F-M39-017",
        "text": "Wird Ihre Wissensbasis bewusst weiterentwickelt (neue Erkenntnisse, Lessons Learned fließen ein) — oder ist sie einmal entstanden und wird seither kaum noch angefasst?",
        "ebene": "Vertiefung",
        "unterbereich": "n6c_weiterentwicklung",
        "position": 17,
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
  "modul_id": "M-39",
  "modul_key": "m39",
  "modul_kategorie": "Wissensmanagement & Kommunikation",
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
    "beschreibung": "Aus den M-39-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "N1",
      "name": "Prozess-Dokumentation & Standards",
      "unterpunkte": [
        "Wiederkehrende Kernprozesse dokumentiert + identisch ausführbar",
        "Standards/Checklisten für Routineaufgaben",
        "Prozess läuft unabhängig von der ausführenden Person (Bus-Faktor)"
      ]
    },
    {
      "key": "N2",
      "name": "Wissensarten & Dokumenttypen",
      "unterpunkte": [
        "Welche Wissensarten/Dokumenttypen existieren",
        "Fachliches Know-how dokumentiert vs. im Kopf",
        "Vorlagen/Muster/Textbausteine zentral verfügbar"
      ]
    },
    {
      "key": "N3",
      "name": "Zentrale Plattform & Auffindbarkeit",
      "unterpunkte": [
        "Zentrale Wissensablage vs. verstreut (Grenze: techn. DMS → M-36)",
        "Wissen schnell auffindbar (Struktur, Suche)",
        "Wissen aktuell vs. veraltet/widersprüchlich"
      ]
    },
    {
      "key": "N4",
      "name": "Pflege & Verantwortung",
      "unterpunkte": [
        "Pflege-Routine (wer aktualisiert wann)",
        "Wer verantwortet die Wissensplattform (Grenze: Rollen → M-02)",
        "Mitarbeiter tragen aktiv Wissen bei vs. Einbahnstraße"
      ]
    },
    {
      "key": "N5",
      "name": "Wissenssicherung bei Personalwechsel",
      "unterpunkte": [
        "Kritisches Wissen übergabefähig dokumentiert (Grenze: Offboarding → M-28, Klumpen → M-26)",
        "Mandantenspezifisches Wissen zentral vs. personengebunden",
        "Wissen bleibt bei Abgang erhalten (Grenze: pers. Nachfolge → M-26, Onboarding-Transfer → M-28)"
      ]
    },
    {
      "key": "N6",
      "name": "Wissens-Reife & KI-Nutzung",
      "unterpunkte": [
        "Bewusst aufgebaute Plattform vs. historisch/chaotisch",
        "KI-gestützte Wissensnutzung (durchsuchbar, Q&A) (Grenze: KI-Systemwahl → M-36)",
        "Wissensbasis bewusst weiterentwickelt"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M39-001",
      "name": "Prozess-Dokumentations-Generator",
      "beschreibung": "Kernprozesse als Standard/Checkliste festhalten",
      "reifegrad": 2,
      "referenz": "N1; F-M39-001, F-M39-002, F-M39-010"
    },
    {
      "hebel_id": "H-M39-002",
      "name": "Wissens-Inventar",
      "beschreibung": "welche Wissensarten/Dokumenttypen existieren, welche fehlen",
      "reifegrad": 2,
      "referenz": "N2; F-M39-003, F-M39-004"
    },
    {
      "hebel_id": "H-M39-003",
      "name": "Zentrale-Wissensplattform-Struktur",
      "beschreibung": "Aufbau + Auffindbarkeit + Struktur",
      "reifegrad": 2,
      "referenz": "N3; F-M39-005, F-M39-006"
    },
    {
      "hebel_id": "H-M39-004",
      "name": "Wissens-Pflege-/Aktualitäts-Radar",
      "beschreibung": "veraltete/widersprüchliche Inhalte finden, Pflege-Routine",
      "reifegrad": 3,
      "referenz": "N3c/N4; F-M39-007, F-M39-012"
    },
    {
      "hebel_id": "H-M39-005",
      "name": "Vorlagen-/Textbaustein-Bibliothek",
      "beschreibung": "zentrale Muster/Templates generieren & pflegen",
      "reifegrad": 2,
      "referenz": "N2c; F-M39-011"
    },
    {
      "hebel_id": "H-M39-006",
      "name": "Wissenssicherungs-Assistent",
      "beschreibung": "kritisches/mandantenspezifisches Wissen dokumentieren, bevor es verloren geht",
      "reifegrad": 3,
      "referenz": "N5; F-M39-008, F-M39-015 (Grenze: Offboarding → M-28)"
    },
    {
      "hebel_id": "H-M39-007",
      "name": "KI-Wissens-Assistent",
      "beschreibung": "durchsuchbares Q&A über die Wissensbasis „wie machen wir das hier\"",
      "reifegrad": 4,
      "referenz": "N6b; F-M39-016 (Grenze: KI-Systemwahl → M-36)"
    },
    {
      "hebel_id": "H-M39-008",
      "name": "Wissens-Reife-Radar",
      "beschreibung": "dokumentiert, zentral, gepflegt, gesichert, KI-nutzbar — Gesamtbild",
      "reifegrad": 4,
      "referenz": "N1–N6; F-M39-001, F-M39-005, F-M39-009"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

-- ── M-42 · stb_modul_m42 · 8 Kern / 8 Vertiefung / 8 KI-Hebel ──
INSERT INTO public.template (slug, name, version, description, blocks, metadata)
VALUES (
  'stb_modul_m42',
  'M-42 – Unternehmer-Rolle & Entscheidungsklarheit',
  '1.0',
  'M-42 – Unternehmer-Rolle & Entscheidungsklarheit — StB-KERN-Cut (DEC-242). 16 Fragen (8 Kern / 8 Vertiefung), 8 KI-Hebel (Reifegrad 1-4). Quelle: docs/stb-vertikale/M-42-seed-source.md (SLC-170b, Modus A /module-author).',
  $blocks$[
  {
    "id": "f63a8300-403d-5346-92eb-6379556913a4",
    "key": "stufe1_kern",
    "title": {
      "de": "Stufe 1 – Kern",
      "en": "Stage 1 – Core",
      "nl": "Fase 1 – Kern"
    },
    "description": "Pflicht-Kernfragen.",
    "order": 1,
    "required": true,
    "weight": 1.0,
    "questions": [
      {
        "id": "1a729b24-f333-57e2-9b80-7d4a83375d51",
        "frage_id": "F-M42-001",
        "text": "Wenn Sie eine typische Arbeitswoche anschauen: Wie viel Ihrer Zeit arbeiten Sie *im* Tagesgeschäft mit (selbst Mandate bearbeiten, fachlich einspringen) und wie viel *am* Unternehmen (Richtung, Aufbau, Führung) — und mit welcher Rolle identifizieren Sie sich eigentlich?",
        "ebene": "Kern",
        "unterbereich": "u1a_rolle_heute",
        "position": 1,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "fd7fc6cb-b397-577e-885d-a6f485ad7474",
        "frage_id": "F-M42-002",
        "text": "Wie stark ist Ihr Selbstverständnis mit der Kanzlei verschmolzen — würden Sie sagen „die Kanzlei bin ich\", und was bliebe von Ihrer Rolle/Identität, wenn Sie sie eines Tages nicht mehr führen?",
        "ebene": "Kern",
        "unterbereich": "u1b_identitaet_verschmelzung",
        "position": 2,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "16f8383c-6634-5745-8eef-350aa2b974b8",
        "frage_id": "F-M42-003",
        "text": "Bei welchen Entscheidungen haben Sie das Gefühl, dass letztlich nur Sie sie richtig treffen können — und wie viele Dinge landen deshalb am Ende doch wieder bei Ihnen auf dem Tisch?",
        "ebene": "Kern",
        "unterbereich": "u2b_entscheidungs_hoarding",
        "position": 3,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "216bf35f-7ad9-5f4b-be7e-e4166b324ccc",
        "frage_id": "F-M42-004",
        "text": "Woran merken Sie bei sich selbst, dass Sie etwas nicht wirklich abgeben, sondern nur „ausleihen\" — holen Sie Aufgaben oder Entscheidungen zurück, sobald es nicht so läuft wie bei Ihnen?",
        "ebene": "Kern",
        "unterbereich": "u3a_delegationsfaehigkeit",
        "position": 4,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "64b06132-13d9-5194-8288-112012afcc02",
        "frage_id": "F-M42-005",
        "text": "Wie sehr vertrauen Sie darauf, dass Ihr Team Mandate fachlich in Ihrer Qualität bearbeitet — und wo sitzt bei Ihnen die größere Angst: dass fachlich etwas schiefgeht, oder dass Sie die Kontrolle verlieren?",
        "ebene": "Kern",
        "unterbereich": "u3b_vertrauen_kontrolle",
        "position": 5,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "31c3a2fa-1695-5c7b-b0dd-a9e41bf91673",
        "frage_id": "F-M42-006",
        "text": "Ganz ehrlich zu sich selbst: Wollen Sie eigentlich loslassen — kürzertreten, übergeben, sich zurückziehen — oder ist das eher etwas, von dem Sie glauben, dass Sie es „irgendwann müssen\"?",
        "ebene": "Kern",
        "unterbereich": "u4a_loslass_bereitschaft",
        "position": 6,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "e96663b8-da14-5a05-b53a-f7f6354b1f6d",
        "frage_id": "F-M42-007",
        "text": "Wenn Sie selbstkritisch draufschauen: Wie viel der Abhängigkeit der Kanzlei von Ihnen — dass Mandate, Wissen und Entscheidungen an Ihnen kleben — ist über die Jahre durch Ihre eigene Haltung entstanden (alles selbst machen, alles kontrollieren, unersetzlich sein)?",
        "ebene": "Kern",
        "unterbereich": "u6a_haltung_ursache_abhaengigkeit",
        "position": 7,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "ecefe4e0-7dfe-5459-8d9b-7e75a372c67e",
        "frage_id": "F-M42-008",
        "text": "Haben Sie ein klares Bild davon, wie Ihr eigenes Berufs-/Lebensbild in 5–10 Jahren aussehen soll (weiter voll dabei, reduzierte Rolle, ganz raus) — oder ist diese Frage für Sie persönlich noch unbeantwortet?",
        "ebene": "Kern",
        "unterbereich": "u5a_persoenliches_zielbild",
        "position": 8,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      }
    ]
  },
  {
    "id": "a70df918-ac68-57dc-bcd0-679e347de6cd",
    "key": "stufe2_vertiefung",
    "title": {
      "de": "Stufe 2 – Vertiefung",
      "en": "Stage 2 – Deep-dive",
      "nl": "Fase 2 – Verdieping"
    },
    "description": "Optionale Vertiefungsfragen.",
    "order": 2,
    "required": false,
    "weight": 1.0,
    "questions": [
      {
        "id": "8bcca621-97c0-5a1a-9b77-ce0fd39cf96b",
        "frage_id": "F-M42-009",
        "text": "Wie wichtig ist Ihnen das Gefühl, in der Kanzlei gebraucht und unersetzlich zu sein — und was würde es mit Ihnen machen, wenn der Laden eines Tages auch ohne Sie rundliefe?",
        "ebene": "Vertiefung",
        "unterbereich": "u1c_unverzichtbarkeit_motiv",
        "position": 9,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "1d8a7e0e-798c-5f22-9eef-a8f4532c5b76",
        "frage_id": "F-M42-010",
        "text": "Wie treffen Sie Entscheidungen — eher klar und zügig oder eher abwägend und aufschiebend — und welche wichtige Entscheidung schieben Sie gerade konkret vor sich her?",
        "ebene": "Vertiefung",
        "unterbereich": "u2a_entscheidungsstil",
        "position": 10,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "872c2223-1256-50fb-aed4-e0fee9016fc7",
        "frage_id": "F-M42-011",
        "text": "Haben Sie Klarheit darüber, welche zwei, drei Dinge in Ihrer Rolle wirklich nur Sie voranbringen können — oder verlieren Sie sich im Tagesgeschäft an Dingen, die auch andere erledigen könnten?",
        "ebene": "Vertiefung",
        "unterbereich": "u2c_prioritaeten_klarheit",
        "position": 11,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "7b94f1b8-a95b-5c07-bd4d-849f5e17f49d",
        "frage_id": "F-M42-012",
        "text": "Dürfen Ihre Leute Dinge anders machen als Sie — auch wenn dabei mal ein Fehler passiert — oder erwarten Sie im Kern, dass es so gemacht wird, wie Sie es tun würden?",
        "ebene": "Vertiefung",
        "unterbereich": "u3c_fehlertoleranz",
        "position": 12,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "5fcc46b1-1929-550f-ad31-6bc1dc3c0f04",
        "frage_id": "F-M42-013",
        "text": "Wenn Sie an die Zeit *nach* der aktiven Kanzleiführung denken: Gibt es da eine Vorstellung, worauf Sie sich freuen — oder eher eine Leere/Sorge vor Bedeutungsverlust, die das Thema lieber wegschieben lässt?",
        "ebene": "Vertiefung",
        "unterbereich": "u4b_angst_danach",
        "position": 13,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "4dc67442-265d-5fc1-8e42-55e648fb8293",
        "frage_id": "F-M42-014",
        "text": "Gibt es in Ihrem Leben etwas jenseits der Kanzlei — Aufgaben, Interessen, Menschen — das Ihnen Sinn und Struktur geben würde, wenn die Kanzlei weniger Raum einnimmt?",
        "ebene": "Vertiefung",
        "unterbereich": "u5b_wozu_jenseits_kanzlei",
        "position": 14,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "a79c0575-6e10-58b9-b969-a26ecea4b561",
        "frage_id": "F-M42-015",
        "text": "Arbeiten Sie aktiv darauf hin, sich in Teilen selbst überflüssig zu machen (Wissen teilen, Mandate übergeben, Verantwortung abgeben) — oder ist das eher ein Vorsatz als gelebte Praxis?",
        "ebene": "Vertiefung",
        "unterbereich": "u6b_sich_ueberfluessig_machen",
        "position": 15,
        "owner_dependency": false,
        "deal_blocker": false,
        "sop_trigger": false,
        "ko_hart": false,
        "ko_soft": false
      },
      {
        "id": "d6388eb5-b3a6-5018-a36e-789c8e21b1ff",
        "frage_id": "F-M42-016",
        "text": "Das Thema Übergabe/Kürzertreten begleitet viele Inhaber jahrelang als „noch nicht dran\": Was ist bei Ihnen der ehrliche Grund, dass es (noch) nicht weitergeht — Zeit, kein Nachfolger, oder eigentlich fehlende innere Bereitschaft?",
        "ebene": "Vertiefung",
        "unterbereich": "u4c_aufschub_haltung",
        "position": 16,
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
  "modul_id": "M-42",
  "modul_key": "m42",
  "modul_kategorie": "Persönliche Kompetenz-Module",
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
    "beschreibung": "Aus den M-42-Antworten leitet der Synthese-Worker (module_output_synthesis) je relevantes Thema ein Liefer-Triple ab: Entscheidung (was zu entscheiden ist) / Standard (welche Norm/Routine gilt) / Implementierungsschritt (konkreter naechster Schritt). KI-Hebel werden als output_kind='ki_hebel' mit reifegrad 1-4 ausgegeben. Werte gemaess modul_output.output_kind-CHECK (MIG-124)."
  },
  "themenmodell": [
    {
      "key": "U1",
      "name": "Rollen-Selbstverständnis & Identität",
      "unterpunkte": [
        "Rolle heute — operative Fachkraft/Macher vs. gestaltender Unternehmer (IM vs. AM Unternehmen)",
        "Identität/Selbstwert mit der Kanzlei verschmolzen („die Kanzlei bin ich\")",
        "Gebrauchtwerden-/Unersetzlichkeits-Motiv"
      ]
    },
    {
      "key": "U2",
      "name": "Entscheidungsklarheit & Entscheidungs-Haltung",
      "unterpunkte": [
        "Entscheidungsstil — klar/zügig vs. abwägen/aufschieben",
        "Entscheidungs-Hoarding als Haltung („nur ich kann das richtig\")",
        "Prioritäten-Klarheit — am Wichtigen vs. im Tagesgeschäft verlieren (Haltung, keine Zeittools)"
      ]
    },
    {
      "key": "U3",
      "name": "Loslassen & Delegation (Vertrauen/Kontrolle)",
      "unterpunkte": [
        "Delegationsfähigkeit — abgeben vs. zurückholen/Micromanagement",
        "Vertrauen ins Team vs. Kontroll-/Qualitätsangst",
        "Fehlertoleranz — andere dürfen es anders/mit Fehlern machen"
      ]
    },
    {
      "key": "U4",
      "name": "Übergabe-/Loslass-Bereitschaft (emotional)",
      "unterpunkte": [
        "Innere Bereitschaft zu übergeben/kürzertreten",
        "Angst vor Bedeutungsverlust/Leere danach, Bild vom „danach\"",
        "Emotionaler Aufschub („noch nicht dran\"), ehrlicher Grund"
      ]
    },
    {
      "key": "U5",
      "name": "Persönliche Vision & Zukunfts-Wozu",
      "unterpunkte": [
        "Eigenes 5–10-Jahr-Berufs-/Lebensbild (voll dabei / reduziert / raus)",
        "Sinn/Aufgabe/Struktur jenseits der Kanzlei",
        "Persönliche Belastung/Gesundheit/Balance als Handlungsdruck"
      ]
    },
    {
      "key": "U6",
      "name": "Haltung → Wirkung auf die Kanzlei (Brücke f1)",
      "unterpunkte": [
        "Eigene Haltung als Ursache der Inhaberabhängigkeit",
        "Aktiv daran arbeiten, dass es ohne den Inhaber läuft (Haltung)",
        "Inhaber als Verhaltens-/Kultur-Vorbild fürs Loslassen"
      ]
    }
  ],
  "ki_hebel": [
    {
      "hebel_id": "H-M42-001",
      "name": "Rollen-Spiegel",
      "beschreibung": "Selbst-Einordnung IM- vs. AM-Unternehmen, Zeitverwendungs-Reflexion + Muster-Feedback",
      "reifegrad": 2,
      "referenz": "U1a/U2c; F-M42-001, F-M42-011"
    },
    {
      "hebel_id": "H-M42-002",
      "name": "Loslass-Readiness-Check",
      "beschreibung": "strukturierter Reflexions-Fragebogen zur emotionalen Übergabe-Bereitschaft, Reifegrad-Radar Person",
      "reifegrad": 2,
      "referenz": "U4; F-M42-006, F-M42-013, F-M42-016"
    },
    {
      "hebel_id": "H-M42-003",
      "name": "Delegations-/Rückhol-Tracker",
      "beschreibung": "welche Aufgaben & Entscheidungen holt der Inhaber zurück — Muster sichtbar machen",
      "reifegrad": 2,
      "referenz": "U2b/U3a; F-M42-003, F-M42-004"
    },
    {
      "hebel_id": "H-M42-004",
      "name": "Entscheidungs-Journal & Aufschub-Radar",
      "beschreibung": "verschleppte Entscheidungen erfassen, Muster + sanfter Nudge",
      "reifegrad": 2,
      "referenz": "U2a; F-M42-010"
    },
    {
      "hebel_id": "H-M42-005",
      "name": "Inhaberabhängigkeits-Ursachen-Analyse",
      "beschreibung": "verknüpft die eigene Haltung mit der strukturellen f1-Diagnose, macht selbstverursachte Klumpen sichtbar",
      "reifegrad": 3,
      "referenz": "U6a; F-M42-007"
    },
    {
      "hebel_id": "H-M42-006",
      "name": "Persönliches Zielbild-/Zukunfts-Sparring",
      "beschreibung": "Reflexions-Dialog zum eigenen 5–10-Jahr-Bild jenseits der Kanzlei",
      "reifegrad": 3,
      "referenz": "U5; F-M42-008, F-M42-014"
    },
    {
      "hebel_id": "H-M42-007",
      "name": "„Sich-überflüssig-machen\"-Fahrplan",
      "beschreibung": "persönliche Loslass-Schritte in konkrete Wochen-/Monatsvorsätze übersetzen, Fortschritt tracken",
      "reifegrad": 3,
      "referenz": "U6b; F-M42-015"
    },
    {
      "hebel_id": "H-M42-008",
      "name": "Übergabe-Reife-Radar Person",
      "beschreibung": "Gesamtbild persönliche Übergabefähigkeit über alle 6 Bereiche — Haltungs-Gegenstück zum M-35 Nachfolge-Reifegrad-Radar",
      "reifegrad": 4,
      "referenz": "U1–U6; F-M42-006, F-M42-007, F-M42-016"
    }
  ]
}$metadata$::jsonb
)
ON CONFLICT (slug, version) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  blocks      = EXCLUDED.blocks,
  metadata    = EXCLUDED.metadata,
  updated_at  = now();

COMMIT;
