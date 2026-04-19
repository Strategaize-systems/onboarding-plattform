# FEAT-014 — Second Template + Switcher UI

- Status: planned
- Version: V2
- Created: 2026-04-19

## Purpose
Beweist die Template-Flexibilitaet der Plattform in der Praxis. Ein zweites Template wird angelegt (Thema TBD — siehe Q6), eine Template-Auswahl-UI wird gebaut, und template-spezifische Owner-Erhebung wird moeglich (DEC-012).

## Why it matters
V1 hat das Datenmodell template-ready gebaut (DEC-003, SC-3), aber nie produktiv bewiesen. Ohne ein zweites Template bleibt die Plattform ein Exit-Readiness-Tool. Mit Template-Switcher wird sie zur generischen Wissenserhebungs-Plattform. Das ist zentral fuer den Produkt-Pitch: "Eine Plattform, viele Use-Cases."

## How it works

### Template-Auswahl
1. **Session-Erstellung:** strategaize_admin erstellt neue Capture-Session und waehlt Template aus Dropdown.
2. **Template-Laden:** Bloecke und Fragen werden aus dem gewaehlten Template geladen.
3. **Template-Lock:** Nach Session-Start kann das Template nicht mehr gewechselt werden (Antworten sind template-spezifisch).

### Template-Verwaltung
- Templates werden ueber Migrations angelegt (V2 kein Admin-UI fuer Template-Erstellung)
- Jedes Template hat: Name, Beschreibung, Bloecke, Fragen, SOP-Prompt (FEAT-012), Owner-Erhebungs-Felder (DEC-012)
- Template-Tabelle existiert bereits (V1 Migration 021)

### Template-spezifische Owner-Erhebung (DEC-012)
- DEC-012 hat Owner-Profil aus V1 entfernt und fuer V2 template-spezifisch geplant
- Jedes Template kann eigene "Owner-Fragen" definieren (z.B. Exit-Readiness: Alter, Jahre als Inhaber; Immobilien: Portfolio-Groesse, Strategie)
- Owner-Fragen werden als spezielle Fragen im ersten Block dargestellt (kein separater Profile-Flow)
- Antworten fliessen in den Kontext fuer Verdichtung + SOP-Generierung

### Zweites Template
Thema wird in Q6 entschieden. Kandidaten:
- **Immobilien-Onboarding:** Synergie mit ImmoCheckheft-Vision. Bloecke: Portfolio-Analyse, Marktposition, Akquise-Strategie, Mieterverwaltung, Instandhaltung, Finanzierung.
- **Mitarbeiter-Discovery:** Generischer Use-Case. Bloecke: Rolle, Prozesse, Tools, Wissensquellen, Verbesserungsvorschlaege.
- **User-definiert:** User liefert Thema, KI generiert Template-Entwurf.

## In Scope
- Template-Switcher-UI bei Session-Erstellung
- Template-Lock nach Session-Start
- Zweites Template (Content: Bloecke, Fragen, Bewertungskriterien)
- Template-spezifische Owner-Felder (DEC-012)
- SOP-Prompt pro Template (FEAT-012)
- Migration fuer zweites Template

## Out of Scope
- Template-Editor-UI (V3, V2 nur per Migration)
- Template-Marketplace oder -Sharing (V4+)
- Template-Versionierung (V3)
- Dynamische Template-Generierung durch KI (V3+)

## Success Criteria
- Zweites Template ist verfuegbar und inhaltlich vollstaendig
- strategaize_admin kann bei Session-Erstellung Template waehlen
- Template-spezifische Bloecke/Fragen werden korrekt geladen
- Owner-Felder sind template-spezifisch
- SOP-Generierung funktioniert fuer beide Templates
- Bestehende Exit-Readiness-Sessions bleiben unveraendert

## Dependencies
- Template-Tabelle (bereits V1, Migration 021)
- FEAT-012 (template-spezifischer SOP-Prompt)
- Q6 (Thema-Entscheidung)
- Q11 (Content-Erstellungsprozess)

## Related
- DEC-003 (Template-ready Design), DEC-012 (Owner-Profile V2+)
- SC-3 (Template-Flexibilitaet verifiziert)
