# FEAT-038 — Walkthrough Handbuch-Integration

**Version:** V5.1
**Status:** planned
**Created:** 2026-05-05

## Zweck
Approved Walkthroughs (mit KI-Schritt-Extraktion + PII-Redaction aus FEAT-037) erscheinen im Unternehmerhandbuch unter neuer Section "Walkthroughs". Pro Section: Schritt-Liste + Embed-Link zum Roh-Video. Berater-Review-UI bekommt KI-Vorschlaege als editierbare Vorlage.

## Hintergrund
V4.1 FEAT-028 hat den Reader fuer das Unternehmerhandbuch implementiert. V5.1 erweitert den Renderer um eine neue Section, die aus Walkthroughs aggregiert wird.

## In Scope
- **Erweiterung Berater-Review-UI** (FEAT-036)
  - Pending-Walkthrough zeigt jetzt: Original-Transkript + Redacted-Transkript + KI-Schritt-Liste + KI-KU-Liste
  - Berater editiert/loescht Schritte/KUs vor Approve
  - Toggle "Original-Transkript anzeigen" mit Audit-Log-Eintrag bei Aktivierung
  - Approve setzt sowohl walkthrough_review als auch block_review (falls Walkthrough einem Block zugeordnet ist) auf approved
- **Handbuch-Renderer-Erweiterung**
  - Neuer Section-Typ "Walkthroughs" (analog FEAT-026 Section-Architektur)
  - Pro Walkthrough: Titel, Datum, Schritt-Liste in Markdown, Embed-Link zum Storage-Video (signed URL via Server-Proxy-Pattern, vgl. ISSUE-025 Resolution)
  - Sektion-Position konfigurierbar pro Template (z.B. nach SOPs)
- **Section-Konfiguration**
  - Template-Field `walkthroughs_section_position` (oder analoge Konvention)
  - Default-Position: nach SOPs, vor Validation-Layer

## Out of Scope
- Video-Streaming-Optimierung (Adaptive Bitrate, HLS) — V5.1 nutzt einfaches HTML5 video mit signed URL
- Walkthrough-Embedding in andere Section-Typen (z.B. inline in SOP) — kommt nur bei Bedarf
- Walkthrough-Suche im Reader (V5.2+)
- Subtitle-Tracks aus Whisper-Transkript — nice-to-have, nicht V5.1

## Akzeptanzkriterien (Skizze)
- Approved Walkthrough erscheint im Unternehmerhandbuch-Snapshot unter Section "Walkthroughs"
- Schritt-Liste rendert sauber im Reader (Markdown)
- Embed-Link spielt Roh-Video sauber ab (Tenant-RLS-geschuetzt)
- Berater-UI zeigt KI-Vorschlaege editierbar; Edits landen in DB; Approve nutzt Edited-Version
- Snapshot-Generation laesst Sections konsistent positionieren (laut Template-Config)

## Abhaengigkeiten
- FEAT-037 (Walkthrough AI-Pipeline)
- V4 FEAT-026 Unternehmerhandbuch Foundation (deployed)
- V4.1 FEAT-028 Handbuch Reader (deployed)
- Storage-Proxy-Pattern aus V4.1 (ISSUE-025 Resolution, deployed)

## Verweise
- PRD V5.1-Sektion (SC-V5.1-3, SC-V5.1-4)
- /requirements V5 RPT-XXX (2026-05-05)
