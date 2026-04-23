# FEAT-026 — Unternehmerhandbuch Foundation (Datenmodell + Markdown-Export)

**Version:** V4
**Status:** planned
**Created:** 2026-04-23

## Zweck
Erste Auspraegung des Unternehmerhandbuchs: Datenmodell fuer Handbuch-Snapshots + Aggregations-Layer + minimaler Markdown-ZIP-Export. Der Kunde kann V4-Output anfassen und mitnehmen.

## Hintergrund
V1-V3 produzieren Datenobjekte (KUs, Diagnose, SOPs), aber kein lesbares Artefakt. V4 schliesst das mit einem Markdown-Export. Webview, Live-Editor und Versionierung kommen in V4.1.

## In Scope
- Tabelle `handbook_snapshot` (oder analog) fuer Handbuch-Versionen
- Aggregations-Layer: Aus KUs/Diagnosen/SOPs aus E1+E2 wird eine kohaerente Sektions-Struktur abgeleitet (Template-getrieben — siehe Q21 in PRD)
- Snapshot wird auf Wunsch des tenant_admin erzeugt (on-demand Button "Handbuch generieren")
- Markdown-Export: ZIP-Download mit Inhaltsverzeichnis, Sektionen, KUs, Diagnose, SOPs, Cross-Links
- Markdown-Files syntaktisch valide, in Standard-Markdown-Viewer lesbar
- tenant_admin-only-Zugriff (Mitarbeiter sehen Handbuch NICHT)

## Out of Scope
- In-App-Webview (V4.1)
- Volltext-Suche (V4.1)
- Live-Editor (V4.1)
- Snapshot-Diff zwischen Versionen (V4.1)
- PDF-Export (spaeter, je nach Kundenbedarf)
- Externe Sharing-Links (spaeter)

## Akzeptanzkriterien (Skizze)
- tenant_admin kann Handbuch-Snapshot erzeugen
- Snapshot wird in DB persistiert (audit-relevant)
- Snapshot kann als ZIP heruntergeladen werden
- ZIP enthaelt Inhaltsverzeichnis + Sektionen + Cross-Links
- Mitarbeiter sieht Handbuch in keinem UI/API

## Abhaengigkeiten
- Vorbedingung: FEAT-022..024 (KUs aus E1+E2 vorhanden)
- Folge-Voraussetzung fuer: V4.1 Webview/Editor

## Verweise
- PRD V4-Sektion (Problem 3, SC-V4-4, R18)
- DEC offen — Q21 Aggregations-Logik
