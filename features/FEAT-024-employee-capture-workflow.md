# FEAT-024 — Employee Capture Workflow

**Version:** V4
**Status:** planned
**Created:** 2026-04-23

## Zweck
Mitarbeiter durchlaeuft seine zugewiesenen Capture-Aufgaben selbstaendig im Questionnaire-Mode — gleiche Pipeline wie der GF-Flow.

## Hintergrund
Wenn ein Mitarbeiter eingeladen ist (FEAT-022) und vom tenant_admin Aufgaben freigegeben bekommt (FEAT-023), muss er sie auch wirklich durchlaufen koennen. Dieses Feature liefert den Mitarbeiter-Flow.

## In Scope
- Mitarbeiter-Dashboard: Liste eigener Aufgaben mit Status (offen / in Arbeit / fertig)
- Mitarbeiter kann eine Aufgabe oeffnen
- Questionnaire-Mode (gleicher Mode wie fuer GF — gleicher Code, eingeschraenkt auf eigenen Scope)
- Block-Submit triggert Standard-Pipeline (Worker, Verdichtung, Diagnose) — gleich wie GF
- Mitarbeiter sieht eigene Beitraege und kann sie weiter editieren bis zum Submit
- Strikte Sicht-Trennung: Mitarbeiter sieht NICHT Blueprint, NICHT andere Mitarbeiter, NICHT Diagnose, NICHT SOPs, NICHT Handbuch

## Out of Scope
- Voice-Input fuer Mitarbeiter — V4: nein, weil Bedrock-Kosten (V4.2 oder V5)
- Evidence-Mode fuer Mitarbeiter — V4: nein (V4.2 wenn Bedarf)
- Dialogue-Mode fuer Mitarbeiter — V4: nein (zu komplex)
- Mitarbeiter-zu-Mitarbeiter-Kommentar
- Mitarbeiter sieht GF-Diagnose oder -SOPs

## Akzeptanzkriterien (Skizze)
- Eingeloggter Mitarbeiter sieht eigene Aufgaben-Liste
- Eingeloggter Mitarbeiter kann Aufgabe durchlaufen + submitten
- Submit triggert Verdichtung — Mitarbeiter-KU erscheint in der Pipeline mit `employee`-Source-Tag
- Mitarbeiter-RLS-Test bestaetigt Sicht-Perimeter

## Abhaengigkeiten
- Vorbedingung: FEAT-022 + FEAT-023
- Folge-Voraussetzung fuer: FEAT-026 (Handbuch braucht Mitarbeiter-KUs)

## Verweise
- PRD V4-Sektion (Problem 1, SC-V4-1, SC-V4-3, R17)
