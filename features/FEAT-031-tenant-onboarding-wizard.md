# FEAT-031 — Tenant-Onboarding-Wizard

- Version: V4.2
- Backlog: BL-048
- Status: planned
- Created: 2026-04-29

## Was

Ein neu eingeladener `tenant_admin` wird beim ersten Login automatisch in einen 4-Schritte-Wizard gefuehrt, der ihn ohne Berater-Hilfe durch das initiale Onboarding bringt: Begruessung → Template-Auswahl → erste Mitarbeiter einladen → "Was nun"-Abschluss mit drei Quick-Action-Cards.

Der Wizard ist jederzeit skipbar (pro Schritt + globaler "Nicht mehr zeigen") und persistiert seinen Step-State pro Tenant. Multi-Admin-Szenarien werden durch DB-Lock geloest — nur der erste einloggende Admin sieht den Wizard.

## Warum

Heute (V4.1) landet ein neu eingeladener `tenant_admin` auf einem leeren Cockpit ohne klaren Start-Pfad. Ohne Berater muss er raten, was zu tun ist. Das bricht das V4.2-Ziel "kein Haendchen-Halten durch den Berater". Der Wizard schliesst exakt diese Luecke und macht den Erst-Login zum Self-Service-Erlebnis.

## V4.2-Scope

### In Scope

- **Wizard-Trigger** (DEC-V4.2-1): Auto-Open beim ersten Login eines `tenant_admin` mit `onboarding_wizard_state IN ('pending', NULL)` und ohne existierende `capture_session`. `strategaize_admin` triggert NIE den Wizard.
- **4 Wizard-Schritte** (DEC-V4.2-2):
  1. **Begruessung**: Tenant-Name + persoenliche Anrede + 1-2-Saetze-Erklaerung was Onboarding-Plattform ist.
  2. **Template-Auswahl**: Liste der aktiven Templates (V4.2: Default Exit-Readiness, weitere falls vorhanden), Auswahl als Radio-Buttons.
  3. **Erste Mitarbeiter einladen**: Inline-Formular fuer 0..N Mitarbeiter (E-Mail + Anzeigename), nutzt bestehende `inviteEmployees`-Server-Action. Submit ist optional (Skip = "Spaeter einladen" Button).
  4. **Abschluss "Was nun"**: 3 Quick-Action-Cards (a) Capture starten, (b) Bridge nutzen, (c) Handbuch generieren — verlinken auf bestehende Pages.
- **Persistenz** (DEC-V4.2-3): Step-genaue Persistenz auf neuer Spalte `tenant.onboarding_wizard_state` (`pending|started|skipped|completed`) + `tenant.onboarding_wizard_step` (1-4) + `tenant.onboarding_wizard_completed_at` (timestamptz). Browser-Reload landet User beim letzten persistierten Schritt.
- **Skip-Mechanismen**: "Spaeter"-Button pro Schritt (springt zum naechsten ohne Persistenz-Aenderung), "Wizard schliessen + nicht mehr zeigen"-Toggle in Schritt 4 (setzt `state='skipped'`), "Erledigt"-Button am Ende von Schritt 4 (setzt `state='completed'`).
- **Multi-Admin-Tenant-Lock**: DB-Update von `state='pending'` → `'started'` ist atomar (Row-Lock). Zweiter Admin sieht direkt das Cockpit.

### Out of Scope (bewusst, V4.3+ oder spaeter)

- **Branchen-/Firmen-Groesse-Erfassung im Wizard**. Kein klarer Use-Case in V4.2 (kein Branchen-spezifisches Template-Schema in V4.2).
- **KI-Vorschlaege fuer Mitarbeiter** ("Fuer eure Branche koennten X relevant sein"). Branding-Datenmodell fehlt.
- **Wizard-Repeat-Trigger** (z.B. wenn Tenant nach 30 Tagen nichts getan hat). Wizard ist Erst-Login-only in V4.2.
- **Wizard fuer `tenant_member`-Rolle**. Member sehen das Tool nicht, brauchen keinen Wizard.
- **Onboarding-Tour-Overlay** (Joyride-Pattern). Zu invasiv. Help-Sheet (FEAT-033) deckt Erklaerungs-Bedarf ab.

## Acceptance Criteria

1. Neu eingeladener `tenant_admin` X von Tenant A loggt sich erstmalig ein. Wizard oeffnet automatisch auf Schritt 1.
2. User klickt durch alle 4 Schritte, jeder Step persistiert `onboarding_wizard_step`. Am Ende von Schritt 4: `state='completed'`, `completed_at` gesetzt.
3. User klickt "Spaeter" auf Schritt 2 → Wizard schliesst, `state='skipped'`. Naechster Login: kein Wizard mehr.
4. User klickt im Wizard "Schliessen+nicht mehr zeigen" → gleiche Wirkung wie Skip.
5. Wizard-State persistiert ueber Browser-Reload: User schliesst Tab in Schritt 3, oeffnet neu → Wizard auf Schritt 3.
6. `strategaize_admin` loggt sich ein → Wizard erscheint NIE (auch wenn `tenant.onboarding_wizard_state='pending'`).
7. Tenant A hat zwei `tenant_admin` X und Y. X loggt sich zuerst ein → Wizard zeigt sich. Y loggt sich danach ein → Wizard zeigt sich NICHT (state='started' oder weiter).
8. Bei Wizard-Crash (z.B. JS-Exception) wird `state='skipped'` gesetzt und User landet auf Standard-Cockpit. Niemand wird aus dem Tool ausgesperrt.
9. RLS: nur `tenant_admin` und `strategaize_admin` koennen `tenant.onboarding_wizard_*` lesen. `tenant_member` und `employee` sehen die Spalten nicht (und brauchen sie nicht).

## Abhaengigkeiten

- **V4 Foundation (FEAT-022, FEAT-024)**: `tenant_admin` und `employee`-Rollen + `inviteEmployees`-Server-Action existieren.
- **V4 Foundation (FEAT-027)**: Cockpit-Page `/dashboard` als Landing-Page nach Login.

## Cross-Refs

- DEC-V4.2-1, DEC-V4.2-2, DEC-V4.2-3 (PRD V4.2-Sektion)
- SC-V4.2-1, SC-V4.2-2, SC-V4.2-3, SC-V4.2-9, SC-V4.2-10, SC-V4.2-11 (PRD V4.2-Sektion)
- Q-V4.2-A (Wizard-Persistenz-Granularitaet — definitiv in /architecture)
