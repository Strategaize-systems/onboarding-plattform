# SLC-021 — Template-Erweiterung + Demo-Template

## Zuordnung
- Feature: FEAT-014 (Second Template + Switcher UI)
- Version: V2
- Priority: Medium
- Depends on: SLC-016 MT-2 (template.sop_prompt + owner_fields Spalten)

## Ziel
Template-Switcher bei Session-Erstellung. Demo-Template "Mitarbeiter-Wissenserhebung" als Proof-of-Concept. Template-spezifische Owner-Felder (DEC-012).

## Scope
- Migration 046: Seed Demo-Template (4-5 Bloecke, ~20-30 Fragen)
- Template-Switcher-Dropdown in Session-Erstellungs-UI
- Template-Lock nach Session-Start (schon architektonisch vorhanden via capture_session.template_id)
- Owner-Felder-Rendering im ersten Block (aus template.owner_fields)
- Debrief-UI: Template-Name in Session-Uebersicht
- i18n (de/en/nl) fuer Demo-Template-Content + UI

## Nicht in Scope
- Template-Editor-UI (V3)
- Template-Versionierung (V3)
- Template-Import/Export (V3)
- Mehr als 1 Demo-Template

## Acceptance Criteria
1. Demo-Template "Mitarbeiter-Wissenserhebung" existiert in DB (4-5 Bloecke)
2. Session-Erstellungs-Dropdown zeigt beide Templates
3. Neue Session startet mit dem gewaehlten Template
4. Bloecke/Fragen des gewaehlten Templates werden korrekt geladen
5. Owner-Felder aus template.owner_fields werden im ersten Block angezeigt
6. Bestehende Exit-Readiness-Sessions bleiben unveraendert
7. npm run build + npm run test erfolgreich

### Micro-Tasks

#### MT-1: Demo-Template-Content erstellen
- Goal: Fachlicher Inhalt fuer "Mitarbeiter-Wissenserhebung"
- Files: `data/seed/mitarbeiter-wissenserhebung-v1.0.0.json`
- Expected behavior: JSON mit 4-5 Bloecken: (A) Rolle & Verantwortung, (B) Prozesse & Workflows, (C) Tools & Systeme, (D) Wissensquellen & Netzwerk, (E) Verbesserungsvorschlaege. Je Block 5-7 Fragen. Gleiche Struktur wie Exit-Readiness-Template.
- Verification: JSON valide, Struktur passt zu template.blocks-Schema
- Dependencies: none

#### MT-2: Migration 046_seed_demo_template.sql
- Goal: Demo-Template in DB
- Files: `sql/migrations/046_seed_demo_template.sql`
- Expected behavior: INSERT template slug='mitarbeiter_wissenserhebung' v1.0.0 mit blocks-JSONB + owner_fields (Abteilung, Position, Jahre im Unternehmen) + sop_prompt (Mitarbeiter-spezifischer SOP-Fokus). ON CONFLICT DO NOTHING.
- Verification: SQL-Syntax korrekt
- Dependencies: MT-1, SLC-016 MT-2

#### MT-3: Migration auf Hetzner ausfuehren
- Goal: Demo-Template auf Produktions-DB
- Verification: SELECT slug, name FROM template → 2 Rows
- Dependencies: MT-2

#### MT-4: Template-Switcher-Dropdown
- Goal: Session-Erstellungs-Seite zeigt Template-Auswahl
- Files: `src/app/capture/new/start-session-client.tsx`
- Expected behavior: Query: template (alle Templates). Dropdown/Select mit Template-Name. Ausgewaehltes template_id wird bei Session-Erstellung uebergeben. Wenn nur 1 Template: kein Dropdown, direkt verwenden.
- Verification: npm run build
- Dependencies: MT-3

#### MT-5: Owner-Felder-Rendering
- Goal: Template-spezifische Owner-Felder im ersten Block
- Files: `src/app/capture/[sessionId]/block/[blockKey]/owner-fields-section.tsx`
- Expected behavior: Laedt template.owner_fields. Rendert Felder (Text-Input, Number-Input) oberhalb der Block-Fragen im ersten Block. Speichert Antworten in capture_session.answers mit Key-Pattern `owner.{field.key}`.
- Verification: npm run build
- Dependencies: none

#### MT-6: Integration Owner-Felder in Questionnaire
- Goal: OwnerFieldsSection in Block-Page einbinden
- Files: `src/app/capture/[sessionId]/block/[blockKey]/page.tsx`
- Expected behavior: Wenn blockKey === erster Block UND template.owner_fields vorhanden: OwnerFieldsSection rendern. Sonst: nichts aendern.
- Verification: npm run build
- Dependencies: MT-5

#### MT-7: i18n + Template-Label in Debrief
- Goal: Template-Name in UI sichtbar + Demo-Template-Texte
- Files: `src/messages/de.json`, `src/messages/en.json`, `src/messages/nl.json`, `src/app/admin/debrief/[sessionId]/page.tsx`
- Expected behavior: Debrief-Session-Seite zeigt Template-Name. i18n-Keys fuer: template.select, template.lock_notice, owner_fields.title
- Verification: npm run build
- Dependencies: MT-4
