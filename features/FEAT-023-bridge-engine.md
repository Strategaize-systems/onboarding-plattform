# FEAT-023 — Blueprint-to-Employee Bridge Engine

**Version:** V4
**Status:** planned
**Created:** 2026-04-23

## Zweck
Aus dem Blueprint-Output des Geschaeftsfuehrers (Knowledge Units, Diagnose) generiert die Bridge-Engine automatisch Vorschlaege fuer Mitarbeiter-Capture-Aufgaben. Der tenant_admin reviewed, editiert und gibt sie frei. Erst dann werden sie fuer Mitarbeiter sichtbar.

## Hintergrund
Ohne diese Bridge muesste der GF jede Mitarbeiter-Aufgabe manuell zusammenstellen — kein Kunde tut das in der Realitaet. Die Bridge ist das zentrale Differenzierungs-Feature von V4.

## In Scope
- Bridge-Engine als Worker-Job (on-demand, vom tenant_admin getriggert — siehe Q20 in PRD)
- Input: GF-Blueprint-Output (KUs + Diagnose) + Template-Kontext
- Output: Liste vorgeschlagener Mitarbeiter-Capture-Aufgaben (Block-Vorschlag + Mitarbeiter-Zuordnung)
- Review-UI fuer tenant_admin: Vorschlaege durchgehen, editieren, freigeben oder ablehnen
- Freigegebene Aufgaben werden zu echten Capture-Sessions mit `employee`-Owner
- Cost-Logging pro Bridge-Aufruf (Token, geschaetzte EUR-Kosten)

## Out of Scope
- Auto-Push von Aufgaben ohne Freigabe (Scope-Schutz, Vertrauen)
- Bridge-Re-Run mit Diff-View (welche Aufgaben sind seit letztem Lauf neu?) — V4.1 wenn Bedarf
- Bridge-Engine-Tuning-UI (Prompt-Editor) — spaeter
- Mehr als ein Mitarbeiter pro generierter Aufgabe — V4 = 1:1

## Akzeptanzkriterien (Skizze)
- tenant_admin mit ≥1 submitted Block kann Bridge ausloesen
- Bridge produziert ≥3 Vorschlaege pro Bridge-Lauf (bei realistischem Blueprint-Input)
- Vorschlaege haben sinnvolle Mitarbeiter-Zuordnung (nicht "alle an alle")
- tenant_admin kann freigeben/ablehnen
- Cost-Log pro Bridge-Lauf sichtbar

## Abhaengigkeiten
- Vorbedingung: FEAT-022 (employee-Rolle existiert), V3-Pipeline (KUs + Diagnose vorhanden)
- Folge-Voraussetzung fuer: FEAT-024

## Verweise
- PRD V4-Sektion (Problem 2, SC-V4-2, SC-V4-8, R15)
- DEC offen — Q17 Bridge-Mechanismus (KI vs. Template-Mapping vs. Hybrid), Q20 Bridge-Trigger
