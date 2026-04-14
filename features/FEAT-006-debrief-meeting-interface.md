# FEAT-006 — Debrief Meeting Interface

- Status: planned
- Version: V1
- Created: 2026-04-14

## Purpose
Die Oberflaeche, in der strategaize_admin den verdichteten Stand eines Blocks ansieht und im Meeting mit dem Kunden einen finalen Snapshot festhaelt. Dies ist der einzige V1-Touchpoint, an dem ein Strategaize-Mitarbeiter inhaltlich arbeitet — exakt konform zu DEC-004.

## Why it matters
Hier entsteht der verkaufbare Mehrwert: der KI-verdichtete Stand wird vom Berater vermenschlicht, ergaenzt und finalisiert. Ohne dieses UI bleibt die KI-Verdichtung eine Rohliste.

## In Scope
- Debrief-UI auf Block-Ebene: Liste aller Knowledge Units mit Confidence-Indikator und Quelle
- Knowledge-Unit-Editor: strategaize_admin kann Text aendern, Status setzen (accepted / edited / rejected), ergaenzen
- Meeting-Mode: sichtbarer Wechsel zwischen "Vor-Meeting-Review" und "Meeting-Snapshot"
- Meeting-Snapshot als versionierter finaler Stand (eigener Checkpoint in `block_checkpoint`, Typ "meeting_final")
- Cross-Tenant-Read fuer strategaize_admin (ueber RLS-Admin-Policy aus FEAT-001)
- Export (minimal: JSON) eines Meeting-Snapshots fuer spaetere Weiterverarbeitung

## Out of Scope
- Live-Meeting-Integration mit Jitsi/Whisper (V3, shared mit Business V4.1)
- Team-Kollaboration im Debrief (V2+)
- PDF-Export mit gestyltem Layout (Q2 offen, V1 liefert nur JSON, evtl. Markdown)
- Diff-Ansicht zwischen Verdichtung und Meeting-Snapshot (V2+)
- Automatische Erkennung von Widersprueche zwischen Knowledge Units (V2+)

## Success Criteria
- strategaize_admin kann pro Block die Knowledge-Unit-Liste sehen, editieren, ergaenzen und final snapshotten
- Meeting-Snapshot ist als eigener Checkpoint gespeichert und vom pre-meeting-Stand unterscheidbar
- JSON-Export eines Snapshots ist moeglich
- tenant_admin hat Lese-Zugriff auf Meeting-Snapshot (ergo: sieht den finalen Stand nach Meeting), aber kann nicht editieren
- RLS verhindert, dass tenant_admin Cross-Tenant-Daten sieht

## Related
- DEC-002 (Deployment-Flexibilitaet), DEC-004 (KI-first — Berater nur hier aktiv)
- FEAT-001 (Rollen, RLS), FEAT-005 (Input: Knowledge Units)
- SC-2 (Ende-zu-Ende Berater), SC-4 (RLS), SC-6 (Versionierung), SC-7 (KI-first Rolle)
