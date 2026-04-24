-- Migration 069: template.employee_capture_schema + handbook_schema + Exit-Readiness Content-Seed
-- SLC-033 MT-5 — V4 Schema-Fundament (FEAT-022, FEAT-026, DEC-034, DEC-038)
-- NOTE: Explicit public. schema prefix required — search_path has storage before public (IMP-103)
--
-- Content-Auswahl (Begruendung):
--   subtopic_bridges: 4 Subtopics aus den operativ-mitarbeiternahen Bloecken:
--     C (Prozesse/Kernablaeufe), E (Systeme), F (Wissen), G (Kommunikation).
--     Bloecke A (Geschaeftsmodell), B (Fuehrung), D (Zahlen), H (Personal-Strategie),
--     I (Vertraege/Compliance) sind GF-Themen und werden per skip_if/frei gelassen —
--     R15-Mitigation: Bridge-Output fokussiert auf Bereiche, wo Mitarbeiter-Sicht
--     echten Mehrwert liefert.
--   free_form_slot: max_proposals=3 per DEC-034.
--   handbook_sections: 8 Sektionen abgeleitet aus den 9 Analyse-Bloecken,
--     plus 'operatives_tagesgeschaeft' fuer employee-KUs (DEC-038, ARCHITECTURE.md Beispiel).

BEGIN;

-- =============================================
-- 1. ADD COLUMNS (idempotent)
-- =============================================
ALTER TABLE public.template
  ADD COLUMN IF NOT EXISTS employee_capture_schema jsonb DEFAULT NULL;

ALTER TABLE public.template
  ADD COLUMN IF NOT EXISTS handbook_schema jsonb DEFAULT NULL;

-- =============================================
-- 2. UPDATE exit_readiness: employee_capture_schema
-- =============================================
UPDATE public.template
SET employee_capture_schema = $schema$
{
  "subtopic_bridges": [
    {
      "subtopic_key": "c1_kernablaeufe",
      "block_template": {
        "title": "Mitarbeiter-Sicht: Kernablaeufe im Tagesgeschaeft",
        "description": "Wie fuehlen sich die wichtigsten Prozesse aus operativer Sicht an?",
        "questions": [
          { "id": "EM-C1-1", "text": "Was sind die 3 wichtigsten Schritte in deinem typischen Tag?", "required": true },
          { "id": "EM-C1-2", "text": "Wo verlierst du am haeufigsten Zeit oder musst improvisieren?", "required": false },
          { "id": "EM-C1-3", "text": "Welche Teile deiner Arbeit sind klar geregelt, welche nicht?", "required": false }
        ]
      },
      "typical_employee_role_hints": ["Operations Manager", "Teamleiter", "Projektleiter"],
      "skip_if": null
    },
    {
      "subtopic_key": "e2_nutzung",
      "block_template": {
        "title": "Mitarbeiter-Sicht: Systemnutzung im Alltag",
        "description": "Wie funktionieren die eingesetzten Tools in der taeglichen Arbeit?",
        "questions": [
          { "id": "EM-E2-1", "text": "Welche Tools nutzt du taeglich, und wie gut funktionieren sie fuer dich?", "required": true },
          { "id": "EM-E2-2", "text": "Wo machst du Workarounds ausserhalb der offiziellen Systeme?", "required": false }
        ]
      },
      "typical_employee_role_hints": ["Sachbearbeiter", "Vertriebsmitarbeiter", "Administrator"],
      "skip_if": null
    },
    {
      "subtopic_key": "f2_weitergabe",
      "block_template": {
        "title": "Mitarbeiter-Sicht: Wissensweitergabe und Einarbeitung",
        "description": "Wie wird Wissen im Team geteilt und wo entstehen Luecken?",
        "questions": [
          { "id": "EM-F2-1", "text": "Wie hast du gelernt, was du heute weisst? Formelle Schulung, Learning-by-Doing, Kollegen?", "required": true },
          { "id": "EM-F2-2", "text": "Wo wuerde es knirschen, wenn du morgen nicht mehr da waerst?", "required": true }
        ]
      },
      "typical_employee_role_hints": ["Schluesselmitarbeiter", "Mentor", "Erfahrener Mitarbeiter"],
      "skip_if": null
    },
    {
      "subtopic_key": "g1_informationswege",
      "block_template": {
        "title": "Mitarbeiter-Sicht: Informationsfluss im Unternehmen",
        "description": "Wie erreichen dich die Informationen, die du fuer deine Arbeit brauchst?",
        "questions": [
          { "id": "EM-G1-1", "text": "Wie erfaehrst du normalerweise wichtige Neuigkeiten oder Entscheidungen im Unternehmen?", "required": true },
          { "id": "EM-G1-2", "text": "Wo fehlt dir Information, die du fuer deine Arbeit brauchen wuerdest?", "required": false }
        ]
      },
      "typical_employee_role_hints": ["Teamleiter", "Abteilungsleiter", "Mitarbeiter"],
      "skip_if": null
    }
  ],
  "free_form_slot": {
    "max_proposals": 3,
    "system_prompt_addendum": "Generiere bis zu 3 zusaetzliche Mitarbeiter-Aufgaben fuer Themen, die das Template nicht abdeckt. Nur wenn die GF-Antworten klare Hinweise auf operative Bereiche geben, die nicht in den subtopic_bridges enthalten sind. Jeder Vorschlag muss einen konkreten Titel, eine Beschreibung und mindestens 2 Fragen enthalten."
  }
}
$schema$::jsonb
WHERE slug = 'exit_readiness';

-- =============================================
-- 3. UPDATE exit_readiness: handbook_schema
-- =============================================
UPDATE public.template
SET handbook_schema = $schema$
{
  "sections": [
    {
      "key": "geschaeftsmodell_und_markt",
      "title": "Geschaeftsmodell & Markt",
      "order": 1,
      "sources": [
        { "type": "knowledge_unit", "filter": { "block_keys": ["A"], "exclude_source": ["employee_questionnaire"] } },
        { "type": "diagnosis", "filter": { "block_keys": ["A"], "min_status": "confirmed" } },
        { "type": "sop", "filter": { "block_keys": ["A"] } }
      ],
      "render": {
        "subsections_by": "subtopic",
        "intro_template": "Dieser Abschnitt beschreibt das Geschaeftsmodell aus Sicht der Geschaeftsfuehrung."
      }
    },
    {
      "key": "fuehrung_und_organisation",
      "title": "Fuehrung & Organisation",
      "order": 2,
      "sources": [
        { "type": "knowledge_unit", "filter": { "block_keys": ["B"], "exclude_source": ["employee_questionnaire"] } },
        { "type": "diagnosis", "filter": { "block_keys": ["B"], "min_status": "confirmed" } },
        { "type": "sop", "filter": { "block_keys": ["B"] } }
      ],
      "render": {
        "subsections_by": "subtopic",
        "intro_template": "Fuehrungsstruktur, Rollen, Entscheidungswege und Stellvertretung."
      }
    },
    {
      "key": "prozesse_und_ablaeufe",
      "title": "Prozesse & Ablaeufe",
      "order": 3,
      "sources": [
        { "type": "knowledge_unit", "filter": { "block_keys": ["C"], "exclude_source": ["employee_questionnaire"] } },
        { "type": "diagnosis", "filter": { "block_keys": ["C"], "min_status": "confirmed" } },
        { "type": "sop", "filter": { "block_keys": ["C"] } }
      ],
      "render": {
        "subsections_by": "subtopic",
        "intro_template": "Kernablaeufe, Engpaesse, Uebergaben und Stabilitaet der Prozesse."
      }
    },
    {
      "key": "wirtschaftliche_steuerung",
      "title": "Wirtschaftliche Steuerung",
      "order": 4,
      "sources": [
        { "type": "knowledge_unit", "filter": { "block_keys": ["D"], "exclude_source": ["employee_questionnaire"] } },
        { "type": "diagnosis", "filter": { "block_keys": ["D"], "min_status": "confirmed" } },
        { "type": "sop", "filter": { "block_keys": ["D"] } }
      ],
      "render": {
        "subsections_by": "subtopic",
        "intro_template": "Kennzahlen, Steuerungslogik, Transparenz und Abhaengigkeiten."
      }
    },
    {
      "key": "operatives_tagesgeschaeft",
      "title": "Operatives Tagesgeschaeft (Mitarbeiter-Perspektive)",
      "order": 5,
      "sources": [
        { "type": "knowledge_unit", "filter": { "source_in": ["employee_questionnaire"] } }
      ],
      "render": {
        "subsections_by": "block_key",
        "intro_template": "Dieser Abschnitt fasst die Sicht der Mitarbeiter auf das operative Tagesgeschaeft zusammen."
      }
    },
    {
      "key": "systeme_und_wissen",
      "title": "Systeme & Wissen",
      "order": 6,
      "sources": [
        { "type": "knowledge_unit", "filter": { "block_keys": ["E", "F"], "exclude_source": ["employee_questionnaire"] } },
        { "type": "diagnosis", "filter": { "block_keys": ["E", "F"], "min_status": "confirmed" } },
        { "type": "sop", "filter": { "block_keys": ["E", "F"] } }
      ],
      "render": {
        "subsections_by": "block_key",
        "intro_template": "Tools, Nutzung, Wissensquellen und Weitergabe."
      }
    },
    {
      "key": "kommunikation_und_personal",
      "title": "Kommunikation & Personal",
      "order": 7,
      "sources": [
        { "type": "knowledge_unit", "filter": { "block_keys": ["G", "H"], "exclude_source": ["employee_questionnaire"] } },
        { "type": "diagnosis", "filter": { "block_keys": ["G", "H"], "min_status": "confirmed" } },
        { "type": "sop", "filter": { "block_keys": ["G", "H"] } }
      ],
      "render": {
        "subsections_by": "block_key",
        "intro_template": "Informationswege, Rekrutierung, Einarbeitung und Uebergabefaehigkeit."
      }
    },
    {
      "key": "vertraege_und_compliance",
      "title": "Vertraege & Compliance",
      "order": 8,
      "sources": [
        { "type": "knowledge_unit", "filter": { "block_keys": ["I"], "exclude_source": ["employee_questionnaire"] } },
        { "type": "diagnosis", "filter": { "block_keys": ["I"], "min_status": "confirmed" } },
        { "type": "sop", "filter": { "block_keys": ["I"] } }
      ],
      "render": {
        "subsections_by": "subtopic",
        "intro_template": "Vertragsrealitaet, Abhaengigkeiten, Dokumentation und Regelwerke."
      }
    }
  ],
  "cross_links": [
    {
      "from_section": "operatives_tagesgeschaeft",
      "to_section": "prozesse_und_ablaeufe",
      "anchor_match": "subtopic_key"
    },
    {
      "from_section": "operatives_tagesgeschaeft",
      "to_section": "systeme_und_wissen",
      "anchor_match": "subtopic_key"
    },
    {
      "from_section": "operatives_tagesgeschaeft",
      "to_section": "kommunikation_und_personal",
      "anchor_match": "subtopic_key"
    }
  ]
}
$schema$::jsonb
WHERE slug = 'exit_readiness';

COMMIT;
