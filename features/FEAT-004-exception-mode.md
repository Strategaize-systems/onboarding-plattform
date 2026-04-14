# FEAT-004 — Exception Mode Prompt Layer

- Status: planned
- Version: V1
- Created: 2026-04-14

## Purpose
Kunden haben waehrend des Questionnaires oft Gedanken, die nicht in die strukturierten Fragen passen, aber relevant sind. Der Exception-Mode ist ein duenner zusaetzlicher Prompt-Layer, der diese Freitext-Beitraege einfaengt und in die Capture Session einspielt.

## Why it matters
Ohne Exception-Mode geht wertvolle Information verloren oder landet in E-Mails ausserhalb des Systems. Der Modus ist billig zu implementieren (Prompt-Layer + ein Feld) und schliesst eine wichtige UX-Luecke.

## In Scope
- Zusaetzliches "Exception"-Feld pro Block (Freitext, optional)
- Prompt-Layer fuer den KI-Chat, der Exception-Eintraege erkennt und in die Verdichtung einspielt
- Versionierung des Exception-Texts ueber den Block-Checkpoint (FEAT-003)
- UI-Element im Questionnaire, das klar sichtbar macht: "Hier kannst du abseits der Fragen ergaenzen"

## Out of Scope
- Eigenes Exception-Dashboard (wird bei Bedarf in V2+ gebaut)
- Auto-Kategorisierung von Exceptions (V2 als Teil der Verdichtung)
- Sprach-Input fuer Exceptions (spaeter mit Voice-Infrastruktur)

## Success Criteria
- tenant_admin kann pro Block einen Exception-Text eingeben
- Der Text ist im Block-Checkpoint gespeichert und wird in die KI-Verdichtung einbezogen
- Knowledge Units aus Exception-Eintraegen sind im Debrief-UI als solche markiert (Quelle: exception)

## Related
- DEC-004 (KI-first)
- FEAT-003 (Questionnaire), FEAT-005 (Verdichtung)
- SC-1 (Ende-zu-Ende Kunde)
