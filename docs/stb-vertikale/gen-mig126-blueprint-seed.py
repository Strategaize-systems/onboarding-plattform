#!/usr/bin/env python3
# Generator MIG-126 — StB Kanzlei-Blueprint Seed (stb_blueprint_kanzlei v1.0)
# SLC-170b Welle 1 (FEAT-092 Blueprint, BL-519) — DEC-234 / DEC-242 / DEC-244
#
# Erzeugt deterministisch sql/migrations/126_v10_stb_blueprint_seed.sql aus
# der abgenommenen Quelle docs/stb-vertikale/M-BP-seed-source.md.
#
# Determinismus:
#   - uuid5(NAMESPACE_URL, "strategaize/template/stb_blueprint_kanzlei/<kind>/<id>")
#     -> NS enthaelt den Slug (S7.2): F-BP-IDs distinkt von exit_readiness.
#   - json.dumps(ensure_ascii=False, indent=2) -> stabiler, lesbarer Output.
#   - Re-Run erzeugt byte-identisches SQL.
#
# Reproduzieren:  python docs/stb-vertikale/gen-mig126-blueprint-seed.py

import json
import uuid

SLUG = "stb_blueprint_kanzlei"
VERSION = "1.0"
NS = uuid.NAMESPACE_URL
ID_PREFIX = f"strategaize/template/{SLUG}"


def qid(frage_id: str) -> str:
    return str(uuid.uuid5(NS, f"{ID_PREFIX}/q/{frage_id}"))


def bid(block_key: str) -> str:
    return str(uuid.uuid5(NS, f"{ID_PREFIX}/block/{block_key}"))


# --- Baustein 2: Fragebogen (Capture-Bloecke) -----------------------------
# (frage_id, unterbereich=subtopic-key, text)  — Texte verbatim aus M-BP §4
KERN = [
    ("F-BP-001", "a1_selbststeuerung", "Welche Zahlen Ihrer eigenen Kanzlei (nicht die Ihrer Mandanten) schauen Sie regelmäßig an — und woran erkennen Sie daran, ob die Kanzlei wirtschaftlich gut läuft?"),
    ("F-BP-002", "a1_selbststeuerung", "Verstehen Sie, wie diese Zahlen zustande kommen — welche Treiber, Leistungen und Prozesse in Ihrer Kanzlei dahinterstehen?"),
    ("F-BP-003", "a1_selbststeuerung", "Wissen Sie, an welchen konkreten Stellschrauben Sie drehen können, um diese Zahlen aktiv zu verbessern — und steuern Sie heute tatsächlich danach, oder läuft es nebenher mit?"),
    ("F-BP-004", "a2_erloesmix_marge", "Wie verteilt sich Ihr Honorarumsatz zwischen Pflicht-Compliance (FiBu, Lohn, Abschluss, Erklärung) und echter betriebswirtschaftlicher Beratung — und wie viel der Beratung rechnen Sie separat ab?"),
    ("F-BP-005", "b1_personalengpass", "Wie viele Stellen haben Sie in den letzten 12 Monaten gesucht, wie viele tatsächlich besetzt — und mussten Sie deshalb schon Mandate ablehnen oder abgeben?"),
    ("F-BP-006", "b2_bindung_wissen", "Wenn Ihre erfahrenste Fachkraft morgen kündigt — wie viel kritisches Mandantenwissen ginge verloren, und wie lange braucht eine neue Kraft bei Ihnen bis zur Eigenständigkeit?"),
    ("F-BP-007", "c1_beratungsverschiebung", "Was erwarten Ihre Mandanten heute von Ihnen, das über die reine Steuer-/Compliance-Pflicht hinausgeht — und wie gut können Sie diese Erwartung aktuell bedienen?"),
    ("F-BP-008", "c2_positionierung", "Wenn ein Wunschmandant Sie mit drei anderen Kanzleien vergleicht — was ist der eine Grund, warum er Sie nimmt, der nicht „Preis“ oder „Nähe“ ist?"),
    ("F-BP-009", "d1_ki_einsatz", "Wo setzen Sie KI in Ihrer Kanzlei heute produktiv ein — nur zum Recherchieren, oder auch in FiBu/Belegverarbeitung/Mandantenkommunikation — und bei welchem Anteil Ihrer Mandate?"),
    ("F-BP-010", "d2_systemlandschaft", "Kennen Sie Ihre digitale Belegquote, haben Sie einen Plan für die DATEV-Cloud-Umstellung ab Herbst 2026 — und eine klare Regel, welche KI-Tools mit Mandantenbezug erlaubt sind?"),
    ("F-BP-011", "e1_prozesse_wissen", "Wie viele Ihrer wiederkehrenden Kernprozesse (Jahresabschluss, Fristen, Mandanten-Onboarding) laufen dokumentiert und identisch — egal wer sie ausführt — und wo findet ein Neuer an Tag 1 „wie machen wir das hier“?"),
    ("F-BP-012", "e2_stellvertretung_fristen", "Für welche Schlüsselrollen — Sie selbst eingeschlossen — gibt es eine eingearbeitete Stellvertretung, und wie ist Ihr Fristen-/Posteingangsprozess gegen Ausfall abgesichert?"),
    ("F-BP-013", "f1_inhaberabhaengigkeit", "Welcher Anteil Ihrer Mandate würde bei Ihrem Ausscheiden zu Ihnen persönlich halten statt zur Kanzlei — und bei welchen Ihrer größten Mandate sind ausschließlich Sie auskunftsfähig?"),
    ("F-BP-014", "f2_nachfolge", "Welche konkrete Nachfolge-Strategie haben Sie (interne Nachfolge, Verkauf, Zusammenschluss), in welchem Zeithorizont — und welche drei Faktoren würden heute Ihren Übergabewert am stärksten drücken?"),
    ("F-BP-015", "g1_zukunftsstandort", "Die Branche konsolidiert (PE-Aufkäufe, Plattform-Kanzleien) bei gleichzeitigem KI-Umbruch — wo sehen Sie Ihre Kanzlei in 5 Jahren: übergabe-/aufkauffähig, spezialisiert-unabhängig, oder vom Wandel überrollt?"),
]

VERTIEFUNG = [
    ("F-BP-016", "a2_erloesmix_marge", "Wie viel Prozent Ihres Honorarpotenzials lassen Sie schätzungsweise liegen (Pro-bono-Drift, vergessene Mehrleistungen) — und was passiert mit Ihrem Umsatz, wenn KI Ihre FiBu-Zeit halbiert?"),
    ("F-BP-017", "b1_personalengpass", "Wie hat sich Ihr Personalkostenanteil am Umsatz in den letzten 3–5 Jahren entwickelt — und welcher Anteil Ihrer und der Teamzeit geht ins reine Tagesgeschäft statt in höherwertige Beratung?"),
    ("F-BP-018", "c1_beratungsverschiebung", "Bei welchem Anteil Ihrer Mandanten sprechen Sie aktiv über betriebswirtschaftliche Themen statt nur Pflicht-Compliance — und wer beginnt dieses Gespräch, Sie oder der Mandant?"),
    ("F-BP-019", "d1_ki_einsatz", "Welcher Anteil Ihrer Mandanten liefert Belege noch analog / mit Medienbruch — und wo erfassen Sie mangels Schnittstelle doppelt?"),
    ("F-BP-020", "f1_inhaberabhaengigkeit", "Was würde konkret mit Ihren drei größten Mandaten passieren, wenn Sie drei Monate ungeplant ausfielen — wer könnte einspringen, und woran würde der Mandant es merken?"),
]


def question(frage_id, unterbereich, text, ebene, position):
    return {
        "id": qid(frage_id),
        "frage_id": frage_id,
        "text": text,
        "ebene": ebene,
        "unterbereich": unterbereich,
        "position": position,
        "owner_dependency": False,
        "deal_blocker": False,
        "sop_trigger": False,
        "ko_hart": False,
        "ko_soft": False,
    }


pos = 0
kern_questions = []
for fid, ub, txt in KERN:
    pos += 1
    kern_questions.append(question(fid, ub, txt, "Kern", pos))
vertiefung_questions = []
for fid, ub, txt in VERTIEFUNG:
    pos += 1
    vertiefung_questions.append(question(fid, ub, txt, "Vertiefung", pos))

blocks = [
    {
        "id": bid("stufe1_kern"),
        "key": "stufe1_kern",
        "title": {"de": "Stufe 1 – Kern", "en": "Stage 1 – Core", "nl": "Fase 1 – Kern"},
        "description": "Pflicht-Kernfragen zur Kanzlei-Standortbestimmung (der Gratis-Test, ~15–20 Min, KI-Capture mit Rückfragen/Voice).",
        "order": 1,
        "required": True,
        "weight": 1.0,
        "questions": kern_questions,
    },
    {
        "id": bid("stufe2_vertiefung"),
        "key": "stufe2_vertiefung",
        "title": {"de": "Stufe 2 – Vertiefung", "en": "Stage 2 – Deep-Dive", "nl": "Fase 2 – Verdieping"},
        "description": "Optionale Vertiefungsfragen (nicht Teil des automatischen 15-Fragen-Pfads; adaptiv bei Ampel gelb/rot der gekoppelten Kern-Frage, V1-Fallback optionaler Block).",
        "order": 2,
        "required": False,
        "weight": 1.0,
        "questions": vertiefung_questions,
    },
]

# --- Baustein 3: Diagnose-Schema (Bloecke A–G -> Unterthemen) --------------
SUBTOPIC_NAME = {
    "a1_selbststeuerung": "Eigene Kanzlei-Steuerung (Zahlen kennen → verstehen → beeinflussen)",
    "a2_erloesmix_marge": "Erlös-Mix & Marge (Compliance vs. Beratung, Honorar-Leckage)",
    "b1_personalengpass": "Stellenbesetzung & Auslastungsgrenze",
    "b2_bindung_wissen": "Mitarbeiterbindung & Einarbeitung",
    "c1_beratungsverschiebung": "Beratung statt nur Compliance (geänderte Mandanten-Erwartung)",
    "c2_positionierung": "Positionierung & Mandantengewinnung",
    "d1_ki_einsatz": "KI-Einsatz & Prozess-Automatisierung",
    "d2_systemlandschaft": "Systemlandschaft & Datensicherheit (DATEV-Cloud, §203, Belegquote)",
    "e1_prozesse_wissen": "Standardprozesse & Wissensplattform (Bus-Faktor)",
    "e2_stellvertretung_fristen": "Stellvertretung, Fristen & Ausfallrisiko",
    "f1_inhaberabhaengigkeit": "Inhaberabhängigkeit & Mandatsbindung",
    "f2_nachfolge": "Nachfolge-Strategie & Übergabewert",
    "g1_zukunftsstandort": "Strategische Position im Strukturwandel (Konsolidierungs-Exposure)",
}

# Diagnose-Block -> [(subtopic_key, [question_keys])]   (M-BP §5a)
DIAG_BLOCKS = {
    "A": [("a1_selbststeuerung", ["F-BP-001", "F-BP-002", "F-BP-003"]),
          ("a2_erloesmix_marge", ["F-BP-004", "F-BP-016"])],
    "B": [("b1_personalengpass", ["F-BP-005", "F-BP-017"]),
          ("b2_bindung_wissen", ["F-BP-006"])],
    "C": [("c1_beratungsverschiebung", ["F-BP-007", "F-BP-018"]),
          ("c2_positionierung", ["F-BP-008"])],
    "D": [("d1_ki_einsatz", ["F-BP-009", "F-BP-019"]),
          ("d2_systemlandschaft", ["F-BP-010"])],
    "E": [("e1_prozesse_wissen", ["F-BP-011"]),
          ("e2_stellvertretung_fristen", ["F-BP-012"])],
    "F": [("f1_inhaberabhaengigkeit", ["F-BP-013", "F-BP-020"]),
          ("f2_nachfolge", ["F-BP-014"])],
    "G": [("g1_zukunftsstandort", ["F-BP-015"])],
}

diag_schema_blocks = {}
for blk, subs in DIAG_BLOCKS.items():
    diag_schema_blocks[blk] = {
        "subtopics": [
            {"key": k, "name": SUBTOPIC_NAME[k], "question_keys": qks}
            for k, qks in subs
        ]
    }

# Felder: 1:1 Reuse aus exit_readiness (MIG-051) — renderer-/engine-kompatibel.
diagnosis_schema = {
    "blocks": diag_schema_blocks,
    "fields": [
        {"key": "ist_situation", "label": "Beschreibung Ist-Situation", "type": "text"},
        {"key": "ampel", "label": "Ampel", "type": "enum", "options": ["green", "yellow", "red"]},
        {"key": "reifegrad", "label": "Reifegrad", "type": "number", "min": 0, "max": 10},
        {"key": "risiko", "label": "Risiko", "type": "number", "min": 0, "max": 10},
        {"key": "hebel", "label": "Hebel", "type": "number", "min": 0, "max": 10},
        {"key": "relevanz_90d", "label": "90-Tage-Relevanz", "type": "enum", "options": ["high", "medium", "low"]},
        {"key": "empfehlung", "label": "Empfehlung / Massnahme", "type": "text"},
        {"key": "belege", "label": "Belege / Zitate / Quelle", "type": "text"},
        {"key": "owner", "label": "Owner (Intern)", "type": "text"},
        {"key": "aufwand", "label": "Aufwand", "type": "enum", "options": ["S", "M", "L"]},
        {"key": "naechster_schritt", "label": "Naechster Schritt", "type": "text"},
        {"key": "abhaengigkeiten", "label": "Abhaengigkeiten/Blocker", "type": "text"},
        {"key": "zielbild", "label": "Zielbild (DOD)", "type": "text"},
    ],
}

# --- Baustein 3: Diagnose-Prompt (StB §5d; Reifegrad 1–4 auf 0–10 gemappt) -
system_prompt = (
    "Du bist ein erfahrener Kanzlei- und Nachfolge-Berater, der die deutsche "
    "Steuerberatungsbranche von innen kennt: Personalmangel (Höchstwert aller Branchen), "
    "KI-Umbruch, Nachfolgewelle (überaltert, kaum Nachfolger), geänderte Mandanten-Erwartung "
    "(strategischer Partner statt nur Compliance).\n\n"
    "Du erstellst aus den verdichteten Antworten einer Kanzlei eine strukturierte Standortbestimmung "
    "pro Unterthema eines Diagnose-Blocks. Sie muss:\n"
    "- Evidenzbasiert sein: jede Bewertung stützt sich auf konkrete Aussagen der Kanzlei.\n"
    "- Ehrlich sein: Zielgruppe ist die zahlen-affinste überhaupt — keine falschen Zahlen, keine "
    "Plattitüden, kein Beschönigen. Schwächen klar, aber respektvoll und lösungsorientiert benennen.\n"
    "- Handlungsorientiert sein: konkrete Empfehlung + nächster Schritt. Operative Wirk-Schicht, "
    "kein DATEV-Organisationshandbuch.\n"
    "- Priorisierend sein: Ampel, Reifegrad und 90-Tage-Relevanz fokussieren das Folgegespräch.\n\n"
    "Worauf besonders achten: (1) Inhaberabhängigkeit — kleben Mandate/Wissen/Entscheidungen am Inhaber? "
    "(2) Personal-Nadelöhr — Kapazität, Mandatsablehnung, operative Schere. (3) KI-/Digital-Readiness — "
    "produktiv vs. nur Oberfläche, DATEV-Cloud 2026, §203/Schatten-KI, Belegquote. (4) Geänderte "
    "Mandanten-Erwartung — Beratung vs. reine Compliance. (5) Zahlen-Souveränität (a1) — kennt der Inhaber "
    "seine Zahlen nicht nur, sondern versteht er ihre Entstehung und beeinflusst er sie aktiv (Brücke zur "
    "Mandantenberatung)? (6) Übergabefähigkeit — 5–10 Jahre Vorlauf, dokumentiert/vertreten. "
    "(7) Fristen-/Haftungsrisiko.\n\n"
    "Bewertungs-Skalen:\n"
    "- Ampel: green = dokumentiert, vertreten, übergabefähig (übersteht Inhaberwechsel/Betriebsprüfung ohne "
    "Bruch). yellow = funktioniert heute, aber personen-/inhaberabhängig, nicht dokumentiert, kippt unter "
    "Druck (Personalausfall, Wachstum, Übergabe, Betriebsprüfung). red = blockiert die Übergabefähigkeit "
    "ODER ist existenz-/haftungskritisch (Fristenprozess ungesichert, keine Stellvertretung, Nachfolge "
    "ungeklärt bei Inhaber > 60, Mandate kleben ausschließlich am Inhaber, KI mit Mandantenbezug ohne "
    "§203-Regel) — akuter Handlungsbedarf.\n"
    "- Reifegrad 0–10, gemappt auf die 4 Kanzlei-Stufen: Stufe 1 'nicht vorhanden/chaotisch' (läuft rein "
    "über den Inhaber/Bauchgefühl, nichts dokumentiert) ≈ 0–2; Stufe 2 'rudimentär' (Ansätze vorhanden, "
    "aber lückenhaft, personenabhängig, nicht verbindlich) ≈ 3–4; Stufe 3 'funktioniert, aber fragil' "
    "(etablierte Routine, hängt an einzelnen Köpfen, hält den Stresstest nicht stand) ≈ 5–7; Stufe 4 "
    "'professionell/übergabefähig' (dokumentiert, vertreten, skalierbar, übersteht Inhaberwechsel + "
    "Betriebsprüfung) ≈ 8–10.\n"
    "- Risiko: 0 = kein Risiko, 10 = existenz-/haftungskritisch oder übergabeverhindernd.\n"
    "- Hebel: 0 = Verbesserung bringt wenig, 10 = maximale Wirkung auf Übergabefähigkeit/Zukunftsstandort.\n"
    "- Relevanz 90d: high = in 90 Tagen angehen (Pflicht bei Ampel rot), medium = 3–6 Monate, low = später.\n"
    "- Aufwand: S = Stunden/Tage, M = Wochen, L = Monate.\n\n"
    "Wo eine Antwort unklar oder lückenhaft ist, benenne die Lücke (Ampel gelb/rot, niedrige Confidence) "
    "statt zu raten — keine erfundenen Fakten.\n\n"
    "Antworte IMMER mit einem JSON-Objekt im vorgegebenen Format. Antworte NUR mit dem JSON — kein "
    "Markdown, keine Erklärungen."
)

output_instructions = (
    "Das JSON-Objekt muss folgende Struktur haben:\n"
    "{\n"
    '  "block_key": "[Block-Key A–G]",\n'
    '  "block_title": "[Block-Titel]",\n'
    '  "subtopics": [\n'
    "    {\n"
    '      "key": "[subtopic_key]",\n'
    '      "name": "[Subtopic-Name]",\n'
    '      "fields": {\n'
    '        "ist_situation": "...",\n'
    '        "ampel": "green|yellow|red",\n'
    '        "reifegrad": 0-10,\n'
    '        "risiko": 0-10,\n'
    '        "hebel": 0-10,\n'
    '        "relevanz_90d": "high|medium|low",\n'
    '        "empfehlung": "...",\n'
    '        "belege": "...",\n'
    '        "owner": "",\n'
    '        "aufwand": "S|M|L",\n'
    '        "naechster_schritt": "...",\n'
    '        "abhaengigkeiten": "...",\n'
    '        "zielbild": "..."\n'
    "      }\n"
    "    }\n"
    "  ]\n"
    "}\n"
    "Verwende die exakten subtopic keys und field keys wie vorgegeben."
)

field_instructions = {
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
    "zielbild": "Soll-Zustand / Definition of Done für dieses Unterthema in Kanzlei-Worten.",
}

diagnosis_prompt = {
    "system_prompt": system_prompt,
    "output_instructions": output_instructions,
    "field_instructions": field_instructions,
}

# --- Baustein 1: Themenbaum (metadata.themenmodell) -----------------------
BLOCK_NAME = {
    "A": "Kanzlei-Steuerung & Geschäftsmodell",
    "B": "Personal & Kapazität",
    "C": "Mandanten-Erwartung & Beratung",
    "D": "KI- & Digital-Readiness",
    "E": "Prozesse, Wissen & Ausfallsicherheit",
    "F": "Nachfolge & Übergabefähigkeit",
    "G": "Zukunfts-Standort",
}
themenmodell = [
    {
        "key": blk,
        "name": BLOCK_NAME[blk],
        "unterpunkte": [SUBTOPIC_NAME[k] for k, _ in subs],
    }
    for blk, subs in DIAG_BLOCKS.items()
]

# --- Baustein 4: Routing-Map (metadata.routing) — M-BP §6 -----------------
# Aktivierung: Ampel gelb/rot -> Modul vorschlagen (Inhalt im bezahlten Blueprint).
# Gelesen in SLC-172 MT-2 (deterministisches Modul-Routing).
ROUTING_RAW = [
    ("A", "a1_selbststeuerung", "m07", "m06"),
    ("A", "a2_erloesmix_marge", "m01", "m04"),
    ("B", "b1_personalengpass", "m26", "m27"),
    ("B", "b2_bindung_wissen", "m28", "m27"),
    ("C", "c1_beratungsverschiebung", "m08", "m15"),
    ("C", "c2_positionierung", "m15", "m16"),
    ("D", "d1_ki_einsatz", "m36", "m07"),
    ("D", "d2_systemlandschaft", "m38", "m36"),
    ("E", "e1_prozesse_wissen", "m39", "m02"),
    ("E", "e2_stellvertretung_fristen", "m02", "m28"),
    ("F", "f1_inhaberabhaengigkeit", "m42", "m03"),
    ("F", "f2_nachfolge", "m35", "m01"),
    ("G", "g1_zukunftsstandort", "m01", "m42"),
]
routing = [
    {
        "block": blk,
        "subtopic": sub,
        "activate_when": {"ampel": ["yellow", "red"]},
        "primary_modul_key": prim,
        "secondary_modul_key": sec,
    }
    for blk, sub, prim, sec in ROUTING_RAW
]

metadata = {
    "modul_id": "M-BP",
    "modul_key": "bp",
    "modul_kategorie": "Führung & Struktur / Blueprint",
    "modul_marker": "diagnostic",  # Diagnostik-Einstieg, KEIN Routing-Ziel (M-BP §1)
    "themenmodell": themenmodell,
    "routing": routing,
    "source_ref": (
        "M-BP Seed-Source: docs/stb-vertikale/M-BP-seed-source.md (v1.0). "
        "IP-Quelle (DEC-234, neuer StB-Inhalt): docs/STB_VERTIKALE_KANZLEI_PAINS_2026-06-23.md "
        "+ docs/STB_VERTIKALE_ZUKUNFT_BRANCHE_2026-06-23.md. Generator: "
        "docs/stb-vertikale/gen-mig126-blueprint-seed.py."
    ),
}

name = "Kanzlei-Blueprint – Standortbestimmung & Routing"
description = (
    "Kanzlei-Blueprint (Diagnostik + Routing) für die StB-Vertikale — der Gratis-Test-Einstieg. "
    "Liefert Standortbestimmung (Ampel/Reifegrad/Empfehlung je Unterthema) über die ganze Kanzlei "
    "+ deterministisches Routing auf die 17 Kern-Fachmodule; KEIN Liefer-Triple/KI-Hebel-Katalog "
    "(das liefern die Fachmodule, M-04 ff.). 20 Fragen (15 Kern / 5 Vertiefung), 7 Diagnose-Blöcke "
    "(A–G) / 13 Unterthemen, 13 Routing-Ziele. Quelle: M-BP-seed-source.md (DEC-234 / DEC-244)."
)


def dq(tag: str, obj) -> str:
    return f"${tag}$" + json.dumps(obj, ensure_ascii=False, indent=2) + f"${tag}$"


SQL = f"""-- Migration 126: V10 StB-Vertikale Kanzlei-Blueprint-Seed — stb_blueprint_kanzlei v1.0
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
--   (3) modul_key='bp' passt NICHT in die ^m\\d{{2}}$-/stb_modul_-Konvention der Fachmodule
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
--   DB_CONTAINER=$(docker ps --format '{{{{.Names}}}}' | grep ^supabase-db)
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
  '{SLUG}',
  '{name}',
  '{VERSION}',
  '{description}',
  {dq('blocks', blocks)}::jsonb,
  {dq('metadata', metadata)}::jsonb,
  {dq('dschema', diagnosis_schema)}::jsonb,
  {dq('dprompt', diagnosis_prompt)}::jsonb
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
"""

OUT = "sql/migrations/126_v10_stb_blueprint_seed.sql"
with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(SQL)
print(f"wrote {OUT} ({len(SQL)} bytes)")
print(f"blocks: {len(blocks)}  questions: {len(kern_questions)+len(vertiefung_questions)}  diag_blocks: {len(diag_schema_blocks)}  routing: {len(routing)}")
