# FEAT-022 — Employee Role + RBAC Extension

**Version:** V4
**Status:** planned
**Created:** 2026-04-23

## Zweck
Mitarbeiter werden zur eigenstaendigen Nutzerklasse in der Onboarding-Plattform. Eigene Rolle `employee`, eigene Auth, eigenes Dashboard, eigene RLS-Policies.

## Hintergrund
Bis V3 gab es im Datenmodell `tenant_member` als sekundaere Tenant-Rolle, aber keinen durchgaengigen Capture-Flow fuer Nicht-GFs. V4 fuegt `employee` als parallele neue Rolle ein (kein Merge mit tenant_member in V4 — Scope-Schutz).

## In Scope
- Neue Rolle `employee` im RBAC-Modell, sauber neben `strategaize_admin`, `tenant_admin`, `tenant_member`
- Mitarbeiter-Einladungs-Flow vom tenant_admin aus (Liste + Einladungs-Form + E-Mail-Versand)
- Auth-Flow fuer Mitarbeiter (Einladung empfangen, Passwort setzen, einloggen) — Magic-Link vs. klassisch siehe Q18 in PRD
- Eigenes Mitarbeiter-Dashboard (Zeigt nur eigene Capture-Sessions)
- RLS-Policies fuer alle relevanten Tabellen so erweitert, dass `employee` ausschliesslich eigene Daten sieht
- RLS-Test-Matrix (4 Rollen x relevante Datentypen) als Pflicht-Bestandteil von /qa

## Out of Scope
- Mergung mit tenant_member (spaeter)
- Multi-Tenant-Mitarbeiter (ein Mitarbeiter in mehreren Tenants) — V4 = 1 Mitarbeiter : 1 Tenant
- Mitarbeiter-Self-Signup ohne Einladung
- Mitarbeiter-Rollen-Hierarchie (Manager, Teamleiter etc.)
- Mitarbeiter-Profile mit Foto / erweiterten Daten

## Akzeptanzkriterien (Skizze)
- tenant_admin kann Mitarbeiter einladen — Mitarbeiter erhaelt E-Mail
- Mitarbeiter setzt Passwort, loggt sich ein, sieht leeres Dashboard ohne Aufgaben
- RLS verhindert nachweislich Cross-Tenant-Zugriff, Cross-Mitarbeiter-Zugriff, Zugriff auf Blueprint/Diagnose/SOP/Handbuch

## Abhaengigkeiten
- Vorbedingung: V3 deployed
- Folge-Voraussetzung fuer: FEAT-023, FEAT-024

## Verweise
- PRD V4-Sektion (Problem 1, SC-V4-1, SC-V4-3)
- DEC offen — wird in /architecture entschieden (Q17, Q18, Q19)
