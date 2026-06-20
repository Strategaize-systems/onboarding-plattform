# FEAT-095 — Modul-Workspace-Reader + KI-Hebel-Liste

- Version: V10
- Status: planned
- Backlog: BL-514
- Created: 2026-06-20

## Was
Die Konsum-Ansicht: der StB liest die Modul-Outputs (Entscheidung/Standard/Implementierungsschritt) **und** die KI-Hebel-Liste (Reifegrad 1-4) fuer die eigene Kanzlei — der „Workspace"-Lese-Endpunkt der Liefer-Domaene.

## Warum
Ohne Konsum-Ansicht ist der generierte Output (FEAT-094) nicht erlebbar. Hier erlebt der StB den Stufe-1-Wert (Strukturen sichtbar + Automatisierungs-Roadmap).

## In Scope (V10)
- Reader/Workspace-Ansicht pro Modul: Entscheidung/Standard/Implementierungsschritt.
- KI-Hebel-Liste pro Modul mit Reifegrad 1-4 (fortlaufende Automatisierungs-Roadmap).
- Lesbare, druckbare Darstellung (Reuse Handbuch-Reader-Render-Pattern).

## Out of Scope (V10)
- Workspace-Monats-Mechanik (Sparring-/Champion-Sessions, Teamstunden-Tracking) — das ist menschliche Ops, nicht V10-Software.
- Verkaufs-/Pricing-/Angebots-Bausteine fuer den Weiterverkauf (Stufe-2-relevant).
- Mandanten-Ansicht.

## Reuse
Handbuch-Reader (FEAT-028, Sidebar/Markdown-Render/Anchors), Stufe-1-Fahrplan-Report-Renderer (FEAT-086, React-PDF).

## Success / Acceptance
- Der StB sieht je Modul die drei Output-Typen + die KI-Hebel-Liste (Reifegrad 1-4).
- Darstellung ist lesbar und (wo sinnvoll) druckbar.
- Tenant-Isolation (RLS) verifiziert; DATEV-Abgrenzung im Naming gewahrt.

> Detail + Constraints: PRD `## V10 — StB-Vertikale Phase 1`. Forks → /architecture V10.
