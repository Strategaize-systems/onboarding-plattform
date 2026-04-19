-- Migration 051: Template diagnosis_schema + diagnosis_prompt columns + Exit-Readiness seed
-- SLC-023 MT-2 — Template-driven diagnosis structure (FEAT-016, DEC-023)

-- (1) Add columns
ALTER TABLE template ADD COLUMN IF NOT EXISTS diagnosis_schema jsonb DEFAULT NULL;
ALTER TABLE template ADD COLUMN IF NOT EXISTS diagnosis_prompt jsonb DEFAULT NULL;

-- (2) Seed Exit-Readiness diagnosis_schema
-- 9 blocks, 36 subtopics (thematically grouped from unterbereich), 13 assessment fields
UPDATE template
SET diagnosis_schema = '{
  "blocks": {
    "A": {
      "subtopics": [
        { "key": "a1_grundverstaendnis", "name": "Grundverstaendnis Geschaeftsmodell", "question_keys": ["F-BP-001", "F-BP-002", "F-BP-003"] },
        { "key": "a2_leistung_angebot", "name": "Leistung & Angebot", "question_keys": ["F-BP-004", "F-BP-005"] },
        { "key": "a3_wirtschaftlichkeit", "name": "Geld & Wirtschaftlichkeit", "question_keys": ["F-BP-006", "F-BP-007"] },
        { "key": "a4_positionierung", "name": "Positionierung & Wettbewerb", "question_keys": ["F-BP-008"] },
        { "key": "a5_kundenzugang", "name": "Kundenzugang & Nachfrage", "question_keys": ["F-BP-011", "F-BP-012"] }
      ]
    },
    "B": {
      "subtopics": [
        { "key": "b1_fuehrungsstruktur", "name": "Fuehrungsstruktur", "question_keys": ["F-BP-015", "F-BP-016", "F-BP-017"] },
        { "key": "b2_rollen_verantwortung", "name": "Rollen & Verantwortung", "question_keys": ["F-BP-018", "F-BP-019", "F-BP-020"] },
        { "key": "b3_entscheidungswege", "name": "Entscheidungswege", "question_keys": ["F-BP-021", "F-BP-022"] },
        { "key": "b4_transparenz", "name": "Transparenz & Klarheit", "question_keys": ["F-BP-023"] },
        { "key": "b5_stellvertretung", "name": "Stellvertretung & Ausfall", "question_keys": ["F-BP-025", "F-BP-026"] }
      ]
    },
    "C": {
      "subtopics": [
        { "key": "c1_kernablaeufe", "name": "Kernablaeufe", "question_keys": ["F-BP-029", "F-BP-030", "F-BP-031"] },
        { "key": "c2_ablaufrealitaet", "name": "Ablaufrealitaet", "question_keys": ["F-BP-032", "F-BP-033", "F-BP-034"] },
        { "key": "c3_engpaesse", "name": "Engpaesse & Reibung", "question_keys": ["F-BP-035", "F-BP-036", "F-BP-037"] },
        { "key": "c4_uebergaben", "name": "Uebergaben & Schnittstellen", "question_keys": ["F-BP-038"] },
        { "key": "c5_ausnahmen", "name": "Ausnahmen & Sonderfaelle", "question_keys": ["F-BP-041"] },
        { "key": "c6_stabilitaet", "name": "Stabilitaet & Ausfall", "question_keys": ["F-BP-043", "F-BP-044"] }
      ]
    },
    "D": {
      "subtopics": [
        { "key": "d1_wirtschaftliche_orientierung", "name": "Wirtschaftliche Orientierung", "question_keys": ["F-BP-045", "F-BP-046", "F-BP-047"] },
        { "key": "d2_steuerungslogik", "name": "Steuerungslogik", "question_keys": ["F-BP-048", "F-BP-049"] },
        { "key": "d3_leistungsbeitrag", "name": "Produkt- & Leistungsbeitrag", "question_keys": ["F-BP-050", "F-BP-051"] },
        { "key": "d4_transparenz", "name": "Transparenz & Verstaendnis", "question_keys": ["F-BP-052"] },
        { "key": "d5_abhaengigkeiten", "name": "Abhaengigkeiten", "question_keys": ["F-BP-054"] },
        { "key": "d6_zukunftssteuerung", "name": "Zukunftssteuerung", "question_keys": ["F-BP-056"] }
      ]
    },
    "E": {
      "subtopics": [
        { "key": "e1_systeme", "name": "Eingesetzte Systeme", "question_keys": ["F-BP-058"] },
        { "key": "e2_nutzung", "name": "Nutzung im Alltag", "question_keys": ["F-BP-059", "F-BP-060"] },
        { "key": "e3_workarounds", "name": "Workarounds", "question_keys": ["F-BP-061"] },
        { "key": "e4_tool_vielfalt", "name": "Tool-Vielfalt & Komplexitaet", "question_keys": ["F-BP-062", "F-BP-063"] },
        { "key": "e5_abhaengigkeit", "name": "Abhaengigkeit & Wissen", "question_keys": ["F-BP-064"] }
      ]
    },
    "F": {
      "subtopics": [
        { "key": "f1_wissensquellen", "name": "Wissensquellen", "question_keys": ["F-BP-068"] },
        { "key": "f2_weitergabe", "name": "Weitergabe", "question_keys": ["F-BP-069"] },
        { "key": "f3_verlust", "name": "Verlust & Abhaengigkeit", "question_keys": ["F-BP-070"] },
        { "key": "f4_lernen", "name": "Lernen im Alltag", "question_keys": ["F-BP-071"] },
        { "key": "f5_aktualitaet", "name": "Aktualitaet", "question_keys": ["F-BP-073"] }
      ]
    },
    "G": {
      "subtopics": [
        { "key": "g1_informationswege", "name": "Informationswege", "question_keys": ["F-BP-074"] },
        { "key": "g2_klarheit", "name": "Klarheit", "question_keys": ["F-BP-075"] },
        { "key": "g3_missverstaendnisse", "name": "Wiederholung & Missverstaendnisse", "question_keys": ["F-BP-076"] },
        { "key": "g4_transparenz", "name": "Transparenz", "question_keys": ["F-BP-077"] },
        { "key": "g5_entscheidungsinfo", "name": "Entscheidungsinformation", "question_keys": ["F-BP-078"] }
      ]
    },
    "H": {
      "subtopics": [
        { "key": "h1_rekrutierung", "name": "Rekrutierung", "question_keys": ["F-BP-080"] },
        { "key": "h2_einarbeitung", "name": "Einarbeitung", "question_keys": ["F-BP-081"] },
        { "key": "h3_entlastung", "name": "Entlastung", "question_keys": ["F-BP-082"] },
        { "key": "h4_wachstum", "name": "Wachstum", "question_keys": ["F-BP-083"] },
        { "key": "h5_uebergabefaehigkeit", "name": "Uebergabefaehigkeit", "question_keys": ["F-BP-084"] },
        { "key": "h6_belastung", "name": "Belastung", "question_keys": ["F-BP-085"] }
      ]
    },
    "I": {
      "subtopics": [
        { "key": "i1_vertragsrealitaet", "name": "Vertragsrealitaet", "question_keys": ["F-BP-086"] },
        { "key": "i2_abhaengigkeiten", "name": "Abhaengigkeiten", "question_keys": ["F-BP-087"] },
        { "key": "i3_uebergabe_haftung", "name": "Uebergabe & Haftung", "question_keys": ["F-BP-088"] },
        { "key": "i4_dokumentation", "name": "Dokumentation", "question_keys": ["F-BP-089"] },
        { "key": "i5_regelwerke", "name": "Regelwerke", "question_keys": ["F-BP-090"] },
        { "key": "i6_externe_wahrnehmung", "name": "Externe Wahrnehmung", "question_keys": ["F-BP-091"] }
      ]
    }
  },
  "fields": [
    { "key": "ist_situation", "label": "Beschreibung Ist-Situation", "type": "text" },
    { "key": "ampel", "label": "Ampel", "type": "enum", "options": ["green", "yellow", "red"] },
    { "key": "reifegrad", "label": "Reifegrad", "type": "number", "min": 0, "max": 10 },
    { "key": "risiko", "label": "Risiko", "type": "number", "min": 0, "max": 10 },
    { "key": "hebel", "label": "Hebel", "type": "number", "min": 0, "max": 10 },
    { "key": "relevanz_90d", "label": "90-Tage-Relevanz", "type": "enum", "options": ["high", "medium", "low"] },
    { "key": "empfehlung", "label": "Empfehlung / Massnahme", "type": "text" },
    { "key": "belege", "label": "Belege / Zitate / Quelle", "type": "text" },
    { "key": "owner", "label": "Owner (Intern)", "type": "text" },
    { "key": "aufwand", "label": "Aufwand", "type": "enum", "options": ["S", "M", "L"] },
    { "key": "naechster_schritt", "label": "Naechster Schritt", "type": "text" },
    { "key": "abhaengigkeiten", "label": "Abhaengigkeiten/Blocker", "type": "text" },
    { "key": "zielbild", "label": "Zielbild (DOD)", "type": "text" }
  ]
}'::jsonb
WHERE slug = 'exit_readiness';

-- (3) Seed Exit-Readiness diagnosis_prompt (uses $dprompt$ quoting to avoid single-quote issues)
UPDATE template
SET diagnosis_prompt = $dprompt${
  "system_prompt": "Du bist ein erfahrener M&A-Berater und strategischer Analyst. Du erstellst aus verdichteten Knowledge Units eine strukturierte Diagnose pro Unterthema eines Analyse-Blocks.\n\nDeine Diagnose dient als Meeting-Vorbereitung fuer ein Gespraech zwischen strategaize-Berater und Auftraggeber (Geschaeftsfuehrer, Inhaber). Sie muss:\n- Evidenzbasiert sein: Jede Bewertung muss sich auf konkrete Knowledge Units stuetzen\n- Ehrlich sein: Keine beschoenigenden Formulierungen, klare Benennung von Schwaechen\n- Handlungsorientiert sein: Klare Empfehlungen und naechste Schritte\n- Priorisierend sein: Ampel, Reifegrad und 90-Tage-Relevanz helfen bei der Fokussierung im Meeting\n\nAntworte IMMER mit einem JSON-Objekt im vorgegebenen Format. Antworte NUR mit dem JSON — kein Markdown, keine Erklaerungen.",
  "output_instructions": "Das JSON-Objekt muss folgende Struktur haben:\n{\n  \"block_key\": \"[Block-Key]\",\n  \"block_title\": \"[Block-Titel]\",\n  \"subtopics\": [\n    {\n      \"key\": \"[subtopic_key]\",\n      \"name\": \"[Subtopic-Name]\",\n      \"fields\": {\n        \"ist_situation\": \"...\",\n        \"ampel\": \"green|yellow|red\",\n        \"reifegrad\": 0-10,\n        \"risiko\": 0-10,\n        \"hebel\": 0-10,\n        \"relevanz_90d\": \"high|medium|low\",\n        \"empfehlung\": \"...\",\n        \"belege\": \"...\",\n        \"owner\": \"\",\n        \"aufwand\": \"S|M|L\",\n        \"naechster_schritt\": \"...\",\n        \"abhaengigkeiten\": \"...\",\n        \"zielbild\": \"...\"\n      }\n    }\n  ]\n}",
  "field_instructions": {
    "ist_situation": "Beschreibe den aktuellen Zustand basierend auf den Knowledge Units. Was funktioniert? Was fehlt? Was ist unklar? Beziehe dich auf konkrete Aussagen aus den KUs.",
    "ampel": "Bewerte den Zustand: green = solide, funktioniert, kein akuter Handlungsbedarf. yellow = funktioniert teilweise, aber Handlungsbedarf erkennbar. red = kritisch, blockiert Exit-Readiness oder birgt erhebliches Risiko.",
    "reifegrad": "Bewerte den Reifegrad von 0 (nicht vorhanden / chaotisch) bis 10 (Best Practice / vollstaendig professionalisiert). Orientiere dich an: 0-2 = nicht vorhanden, 3-4 = rudimentaer, 5-6 = funktioniert aber fragil, 7-8 = solide, 9-10 = professionell/vorbildlich.",
    "risiko": "Bewerte das Risiko von 0 (kein Risiko) bis 10 (existenzielles Risiko fuer Exit/Uebernahme). Betrachte: Was passiert, wenn dieser Bereich bei einer Due Diligence geprueft wird?",
    "hebel": "Bewerte den Hebel von 0 (Verbesserung bringt wenig) bis 10 (Verbesserung hat maximale Wirkung auf Exit-Readiness). Hohes Risiko + hoher Hebel = hoechste Prioritaet.",
    "relevanz_90d": "Bewerte die 90-Tage-Relevanz: high = muss in den naechsten 90 Tagen angegangen werden. medium = sollte in 3-6 Monaten angegangen werden. low = kann spaeter adressiert werden oder ist bereits ausreichend.",
    "empfehlung": "Konkrete Massnahme oder Empfehlung. Nicht vage, sondern spezifisch (z.B. Stellenbeschreibungen fuer die 3 Schluesselrollen erstellen).",
    "belege": "Zitiere oder referenziere die relevanten Knowledge Units, die diese Bewertung stuetzen. Format: KU: [Titel] — [relevantes Zitat oder Zusammenfassung].",
    "owner": "Lasse dieses Feld leer. Es wird im Meeting vom Auftraggeber gefuellt.",
    "aufwand": "Schaetze den Aufwand: S = wenige Stunden/Tage, M = einige Wochen, L = mehrere Monate oder signifikanter Ressourceneinsatz.",
    "naechster_schritt": "Der allererste konkrete Schritt. Nicht der ganze Plan, sondern: Was ist morgen zu tun?",
    "abhaengigkeiten": "Gibt es Abhaengigkeiten zu anderen Unterthemen oder externen Faktoren? Leer lassen wenn keine.",
    "zielbild": "Wie sieht der Soll-Zustand aus? Definition of Done fuer dieses Unterthema."
  }
}$dprompt$::jsonb
WHERE slug = 'exit_readiness';
