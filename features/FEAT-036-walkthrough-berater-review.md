# FEAT-036 — Walkthrough Berater-Review (Manual Approval-Gate) — DEFERRED

**Version:** V5 (urspruenglich) — **deferred per DEC-079 (V5 Option 2, 2026-05-06)**
**Status:** deferred
**Created:** 2026-05-05
**Deferred:** 2026-05-06

## Update 2026-05-06 — Scope-Pivot V5 Option 2

Per USP-Stress-Test 2026-05-06 (DEC-079 im Strategaize-Dev-System) wird das Berater-Review von Roh-Walkthroughs **nicht** in V5 gebaut. Begruendung: Berater-Approval eines Roh-Videos ist kein Strategaize-Methodik-Differenzierer — es ist Plumbing. Stattdessen sieht der Berater in V5 die **extrahierten SOP-Schritte gemappt zu Subtopics** (siehe FEAT-040 Methodik-Review-UI), nicht die Roh-Aufnahme.

Die Roh-Aufnahme bleibt im Storage erhalten (Audit + Re-Processing-Quelle), wird aber nicht im Berater-UI gezeigt. Eine spaetere Rueckkehr als optionale "Audit-View" fuer Edge-Cases (z.B. Roh-Video pruefen wenn Schritt-Extraktion fragwuerdig wirkt) ist offen, aber nicht V5-Scope.

## Zweck (Original — nicht V5-Scope)
Berater-UI fuer manuelle Sichtung + Approval von Walkthrough-Sessions. **Roh-Aufnahmen sind ausschliesslich fuer Berater + den aufnehmenden Mitarbeiter sichtbar**, bis sie approved sind. Approval setzt Walkthrough fuer V5.1-AI-Pipeline frei (in V5 selbst kein KI-Pfad — manueller Approve, dann steht Walkthrough fuer Berater-Konsumption + Onboarding-Video bereit).

## Hintergrund
Privacy-Verschaerfung User-Decision 2026-05-05: niemand darf sensitives/kundenspezifisches Material vor Berater-Approve sehen. Approval-Pattern analog V4.1 `block_review`. V5 macht den manuellen Approve-Pfad, V5.1 ergaenzt KI-Vorschlaege.

## In Scope
- Cross-Tenant-Sicht `/admin/walkthroughs` (alle pending Walkthroughs aller Tenants, oldest-first)
- Pro-Tenant-Sicht `/admin/tenants/[id]/walkthroughs` (Pending-Liste pro Tenant)
- Detail-Ansicht `/admin/walkthroughs/[id]` mit Video-Player + Transkript-Anzeige
- Approve / Reject Server-Action (analog block_review)
- **Pflicht-Checkbox** vor Approve: "Ich habe geprueft: keine kundenspezifischen oder sensitiven Inhalte sichtbar"
- Audit-Log-Eintrag bei jeder Approve/Reject-Aktion (wer, wann, ggf. Notiz)
- RLS-Matrix:
  - **strategaize_admin**: full SELECT/UPDATE auf allen walkthrough_review-Eintraegen
  - **tenant_admin** (== Berater im Tenant): SELECT/UPDATE nur fuer eigenen Tenant
  - **tenant_member**: kein Zugriff auf Walkthrough-Review-Tabellen
  - **employee**: SELECT nur fuer EIGENE Walkthrough-Sessions
- Liste sortiert nach Pending-Alter (aelteste zuerst)
- Cockpit-Card "Pending Walkthroughs"

## Out of Scope
- KI-PII-Redaction (V5.1, FEAT-037)
- KI-Schritt-Extraktion (V5.1, FEAT-037)
- Auto-Veroeffentlichung im Unternehmerhandbuch (V5.1, FEAT-038)
- Reviewer-Notes als langer Markdown-Text (V5: kurze Notiz, V5.2+: Markdown)
- Mehrsprachige Review-UI (DE/EN/NL bereits durch i18n-Pattern abgedeckt)

## Akzeptanzkriterien (Skizze)
- Berater sieht im /admin/walkthroughs Pending-Liste mit Tenant + Mitarbeiter + Datum + Dauer
- Detail-Ansicht spielt Video sauber ab (HTML5 video) + zeigt Transkript darunter
- Approve / Reject ist nur mit gesetzter Pflicht-Checkbox moeglich (UI-Block + Server-Side-Validation)
- RLS-Matrix-Test (4 Rollen) gruen
- Audit-Log enthaelt Approver, Timestamp, Action

## Abhaengigkeiten
- FEAT-034 (Walkthrough Capture-Session)
- FEAT-035 (Walkthrough Transcription)
- V4.1 block_review-Pattern als Vorlage (deployed)

## Verweise
- DEC-079 (Strategaize-Dev-System) — V5 Option 2 Scope-Aenderung 2026-05-06
- FEAT-040 Walkthrough Methodik-Review-UI (V5-Ersatz, mapped SOPs statt Roh-Video)
- PRD V5-Sektion (Original — pre-Option-2)
- /requirements V5 RPT-163 (2026-05-05) — Original-Spec
- /requirements V5 Option 2 RPT-170 (2026-05-06) — Re-Plan
- V4.1 FEAT-029 Berater-Review + Quality-Gate (deployed)
