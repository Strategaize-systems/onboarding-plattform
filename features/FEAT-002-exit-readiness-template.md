# FEAT-002 — Exit-Readiness Template

- Status: planned
- Version: V1
- Created: 2026-04-14

## Purpose
Erstes aktives Template der Plattform. Liefert den verkaufbaren Inhalt: strukturierte Exit-Readiness-Bloecke, Fragen und Kontext-Texte. Content-Basis ist Blueprint V3.4.

## Why it matters
Ohne Template kein Produkt. Die Template-Struktur im Datenmodell existiert aus FEAT-001, aber ohne konkreten Inhalt gibt es keinen Use-Case und nichts zu testen.

## In Scope
- Template-Eintrag "Exit-Readiness" in der Template-Tabelle (ID, Name, Version, Metadata)
- Bloecke mit Questions, Reihenfolge, Pflicht/Optional-Flags
- Content-Import aus Blueprint V3.4 (Questions + Block-Struktur)
- Umbenennung von Blueprint-spezifischen Begriffen in der Content-Ebene (soweit noetig)
- Ein einziges aktives Template, kein Switcher-UI

## Out of Scope
- Zweites Template (V2+)
- Template-Editor-UI (Content-Aenderungen erfolgen in V1 ueber Migrations / Seed-Scripts)
- Template-Versionierung mit Migration zwischen Template-Versionen (V2+)
- Content-Anpassung durch Kunde (Template ist System-weit fix in V1)

## Success Criteria
- Das Exit-Readiness-Template ist in der DB vorhanden und ueber die Template-API abrufbar
- Alle Bloecke inklusive Fragen aus Blueprint V3.4 sind uebernommen
- Eine Capture Session kann mit `template_id = exit-readiness` gestartet werden
- Content ist versioniert (Template-Version + created_at)

## Related
- DEC-001 (Blueprint-Basis)
- FEAT-001 (Datenmodell)
- SC-1 (Ende-zu-Ende-Flow Kunde)
