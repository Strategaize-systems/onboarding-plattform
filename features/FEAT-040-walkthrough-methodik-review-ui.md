# FEAT-040 — Walkthrough Methodik-Review-UI (Mapped SOPs statt Roh-Video)

**Version:** V5 (NEU per DEC-079 V5 Option 2, 2026-05-06)
**Status:** planned
**Created:** 2026-05-06

## Zweck
Berater-UI fuer Review + Approval **extrahierter SOP-Schritte gemappt zu Subtopics** — nicht des Roh-Walkthrough-Videos. Methodik-Output statt Rohmaterial. Ersetzt das urspruengliche FEAT-036 (Roh-Video-Review) in V5 Option 2.

Berater sieht pro pending Walkthrough:
- Subtopic-Tree des Blueprints/Templates
- Pro Subtopic: zugeordnete extrahierte SOP-Schritte (mit PII-redacted Transkript-Snippet)
- Unmapped-Bucket mit Schritten ohne klares Subtopic-Match
- Confidence-Score pro Mapping

Berater-Aktionen:
- Schritte annehmen / loeschen / editieren
- Schritte zwischen Subtopics verschieben (Mapping korrigieren)
- Unmapped-Schritte in Subtopics einsortieren
- Approve gesamten Walkthrough → mapped SOPs werden im Tenant freigegeben (V5.1 verbindet sie mit Handbuch-Snapshot)

## Hintergrund
Per USP-Stress-Test 2026-05-06 (DEC-079): Berater-Review eines Roh-Videos ist Plumbing, kein Strategaize-Methodik-Differenzierer. Berater soll Methodik-Output bekommen — extrahierte, gemappte, redacted SOP-Schritte — und die nur noch validieren / korrigieren.

Pattern-Reuse:
- V4.1 FEAT-029 block_review (Approve/Reject + Pflicht-Checkbox)
- V4 FEAT-023 Bridge-Engine-Review (Subtopic-Tree-UI mit zugeordneten Eintraegen)
- V2 FEAT-012 SOP-UI (Schritt-Editor)

## In Scope

### Routen
- Cross-Tenant-Sicht `/admin/walkthroughs` — alle pending Walkthroughs aller Tenants, oldest-first, mit Subtopic-Mapping-Stats
- Pro-Tenant-Sicht `/admin/tenants/[id]/walkthroughs` — Pending-Liste pro Tenant
- Detail-Ansicht `/admin/walkthroughs/[id]` — Methodik-Review-View (Subtopic-Tree mit gemappten SOP-Schritten)

### Methodik-Review-View (Detail-Ansicht)
- **Subtopic-Tree** des aktiven Templates (analog Bridge-Review-UI aus FEAT-023)
- Pro Subtopic-Knoten: Liste der zugeordneten SOP-Schritte mit:
  - Schritt-Text (action, responsible, timeframe, success_criterion)
  - PII-redacted Transkript-Snippet (Kontext, woher der Schritt kam)
  - Confidence-Score des Auto-Mappings
  - Edit-/Delete-/Move-Aktionen
- **Unmapped-Bucket** als separater Section am Ende mit Drag-or-Select-Move-To-Subtopic-UI
- **Pflicht-Checkbox** vor Approve: "Ich habe geprueft: keine kundenspezifischen oder sensitiven Inhalte in den extrahierten SOPs sichtbar"
- Approve / Reject Server-Action (Approve → Status `approved`, mapped SOPs werden Tenant-sichtbar; Reject → Status `rejected`, optional kurze Notiz)
- Audit-Log-Eintrag bei jeder Approve/Reject/Edit/Move-Aktion

### Toggle "Roh-Transkript anzeigen" (optional, fuer Edge-Cases)
- Erlaubt Berater den Original-Transkript-Text einzusehen falls die Schritt-Extraktion fragwuerdig erscheint
- Aktivierung erzeugt expliziten Audit-Log-Eintrag (privacy-relevant)
- **Kein** Toggle "Roh-Video anzeigen" in V5 — Roh-Video bleibt im Storage, aber kein UI-Pfad in V5 (FEAT-036 deferred)

### RLS-Matrix
- **strategaize_admin**: full SELECT/UPDATE auf allen walkthrough_review-Eintraegen
- **tenant_admin** (== Berater im Tenant): SELECT/UPDATE nur fuer eigenen Tenant
- **tenant_member**: kein Zugriff auf Walkthrough-Review-Tabellen
- **employee**: SELECT nur fuer EIGENE Walkthrough-Sessions (Status sehen, aber keine Mapping-Edit-Rechte)

### Cockpit-Card
- "Pending Walkthroughs" mit Anzahl pending pro Tenant + globaler Berater-Cross-Tenant-Sicht (analog V4.1 block_review-Cockpit-Card)

## Out of Scope
- Roh-Video-Player im UI (FEAT-036 deferred) — Roh-Video bleibt im Storage, kein UI-Pfad in V5
- Handbuch-Integration der approved SOPs (FEAT-038, V5.1)
- Markdown-Notes als langer Reviewer-Kommentar (V5: kurze Notiz, V5.x+: Markdown)
- Inline-Schritt-Annotation waehrend Aufnahme
- Re-Open-Pfad fuer rejected Walkthroughs (V5.x+)
- Mehrsprachige Review-UI (DE/EN/NL via i18n bereits abgedeckt)

## Akzeptanzkriterien (Skizze)
- Berater sieht pro pending Walkthrough: Subtopic-Tree + zugeordnete Schritte + Unmapped-Bucket
- Edit / Move-Between-Subtopics / Delete von Schritten funktioniert + persistiert in DB
- Approve nur mit gesetzter Pflicht-Checkbox moeglich (UI-Block + Server-Side-Validation)
- Approve setzt Walkthrough-Status = approved + macht mapped SOPs Tenant-sichtbar
- "Roh-Transkript anzeigen"-Toggle erzeugt Audit-Log-Eintrag
- KEIN Roh-Video-UI-Pfad
- RLS-Matrix-Test (4 Rollen × Operationen) gruen
- Audit-Log enthaelt Approver, Timestamp, Action

## Abhaengigkeiten
- FEAT-034 (Walkthrough Capture-Session) — V5 SLC-071
- FEAT-035 (Walkthrough Whisper-Transkription) — V5 SLC-072
- FEAT-037 (Walkthrough AI-Pipeline) — V5 (vorgezogen aus V5.1) — liefert mapped SOPs als Input
- V4 FEAT-023 Bridge-Engine — Subtopic-Tree-UI-Pattern
- V4.1 FEAT-029 block_review — Approve/Reject + Pflicht-Checkbox-Pattern

## Verweise
- DEC-079 (Strategaize-Dev-System) — V5 Option 2 (2026-05-06)
- PRD V5-Sektion (Option 2)
- /requirements V5 Option 2 RPT-170 (2026-05-06)
- FEAT-036 Walkthrough Berater-Review (Roh-Video) — deferred, ersetzt durch dieses Feature
- FEAT-038 Walkthrough Handbuch-Integration (V5.1, naechster Schritt nach Approve)
- DEC offen — Q-V5-L (Drag-Drop vs. Select-Move), Q-V5-M (Confidence-Score-Schwelle Anzeige), Q-V5-N (Roh-Transkript-Toggle Audit-Detail-Tiefe)
