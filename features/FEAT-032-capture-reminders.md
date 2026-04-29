# FEAT-032 — Capture-Reminders

- Version: V4.2
- Backlog: BL-060
- Status: planned
- Created: 2026-04-29

## Was

Automatische E-Mail-Reminder an Mitarbeiter (`employee`-Rolle) mit pendenten Capture-Tasks. Stufe 1 nach 3 Werktagen Inaktivitaet, Stufe 2 nach 7 Werktagen — danach kein weiterer Reminder. Idempotent ueber `reminder_log`-Tabelle, Opt-Out pro Mitarbeiter via `user_settings.reminders_opt_out`. Cron-getrieben im bestehenden Coolify-Cron-Container.

Zusaetzlich: In-App-Badge fuer `tenant_admin` auf `/dashboard` zeigt "X Mitarbeiter ohne Aktivitaet" mit Klick-Ziel auf gefilterte Mitarbeiter-Liste.

## Warum

V4 hat Mitarbeiter-Capture-Workflow (FEAT-024), aber keinen Reminder-Mechanismus. Mitarbeiter, die ihre Aufgabe nicht starten, bleiben unsichtbar bis der Berater nachfragt. Das bricht das V4.2-Ziel "Self-Service ohne Berater-Haendchen-Halten". Reminders schliessen die Luecke ohne den GF zu bevormunden (DEC-V4.2-4: GF bekommt KEINE E-Mails, nur In-App-Badge).

## V4.2-Scope

### In Scope

- **Reminder-Empfaenger** (DEC-V4.2-4): Nur `employee`-Rollen-User mit accepted Invitation und ohne Block-Submit-Aktivitaet. Niemals an `tenant_admin`, `tenant_member` oder `strategaize_admin`.
- **Reminder-Schedule** (DEC-V4.2-5):
  - Stufe 1: nach 3 Werktagen seit `employee.invitation_accepted_at` ohne `block_submit`-Eintrag in dieser Capture-Session.
  - Stufe 2: nach 7 Werktagen seit `employee.invitation_accepted_at` ohne `block_submit`-Eintrag.
  - Werktage = Mo-Fr (ohne Holiday-Calendar in V4.2, Q-V4.2-B).
  - Nach Stufe 2 kein weiterer Reminder. Mitarbeiter wird im Tenant-Admin-Badge weiter gezaehlt.
- **Reminder-Provider** (DEC-V4.2-6): Bestehender Supabase-Auth-SMTP. Subject + Body als Templates pro Stufe (DE-only in V4.2).
- **Cron-Infrastruktur** (DEC-V4.2-9): Bestehender Coolify-Cron-Container (Pattern aus Business System V4.x). Job laeuft 1×/Tag um 09:00 Europe/Berlin.
- **Idempotenz**: Neue Tabelle `reminder_log` mit Unique-Constraint `(employee_id, reminder_stage, sent_date)`. Doppellauf des Cron schreibt nur einen Log-Eintrag pro Mitarbeiter+Stufe+Tag.
- **Opt-Out-Mechanismen**: Neue Tabelle `user_settings` mit `reminders_opt_out boolean default false`. Unsubscribe-Link in jeder Reminder-Mail (Token-basiert, setzt opt_out auf true ohne Login).
- **In-App-Badge** auf `/dashboard` fuer `tenant_admin`: "X Mitarbeiter ohne Aktivitaet" (X = Anzahl Mitarbeiter mit `invitation_accepted_at` aber ohne Block-Submit). Klick → `/admin/employees?filter=inactive`.
- **Cron-Audit-Log**: Pro Cron-Run wird in `cron_log` (oder `error_log` mit Type='cron') geschrieben: `run_at`, `stage1_count`, `stage2_count`, `skipped_count` (Opt-Out, bereits-gesendet).

### Out of Scope (bewusst, V4.3+ oder spaeter)

- **Reminder an `tenant_admin` als E-Mail**. Bewusst raus (DEC-V4.2-4). Kann V4.3+ als optionaler Schalter kommen.
- **Holiday-Calendar fuer Werktag-Berechnung**. Zu komplex, Mitigation: max. 2 Reminder, Drift bei Feiertagen ist akzeptabel.
- **Reminder-Customization durch `tenant_admin`** (eigene Subject-Lines pro Tenant). V4.3+ wenn Use-Case auftaucht.
- **Eskalation an Berater bei wiederholt-inaktiven Mitarbeitern**. V5+.
- **Multi-Channel-Reminder** (Slack, MS Teams). V5+.
- **Dedizierter E-Mail-Provider** (Resend, SES). V4.3+ wenn Volume das erfordert (siehe Constraints).

## Acceptance Criteria

1. Mitarbeiter X mit `invitation_accepted_at = today - 3 Werktage` ohne `block_submit` bekommt im naechsten Cron-Run eine Stufe-1-Mail. `reminder_log` enthaelt Eintrag `(employee_id=X, stage=1, sent_date=today)`.
2. Cron laeuft erneut am gleichen Tag (z.B. Coolify-Restart) → kein zweiter Stufe-1-Reminder fuer X (Unique-Constraint greift).
3. Mitarbeiter Y mit `invitation_accepted_at = today - 7 Werktage` ohne `block_submit` bekommt Stufe-2-Mail (auch wenn Stufe 1 vor 4 Tagen ging).
4. Mitarbeiter Z hat `user_settings.reminders_opt_out=true` → Cron-Run skippt Z, Log-Eintrag im `cron_log` als "skipped (opt-out)".
5. Mitarbeiter W mit `invitation_accepted_at = today - 14 Werktage` bekommt KEINEN dritten Reminder (max. 2 Stufen).
6. Unsubscribe-Link in Stufe-1-Mail funktioniert: Klick setzt `user_settings.reminders_opt_out=true` ohne Login.
7. `tenant_admin` sieht im `/dashboard` Cockpit "Mitarbeiter ohne Aktivitaet: X" mit korrektem X (Mitarbeiter mit accepted Invitation aber ohne Block-Submit).
8. Klick auf Cockpit-Card fuehrt zu `/admin/employees?filter=inactive` mit gefilterter Liste.
9. RLS: `reminder_log` ist Service-Role-only (Cron-Job-Schreibrecht), `user_settings` ist User-eigene-Daten (jeder User sieht/aendert nur eigene Settings, `strategaize_admin` sieht alle).
10. RLS-Test-Matrix: 4 Rollen × 2 neue Tabellen = 8 zusaetzliche Test-Faelle, alle PASS.

## Abhaengigkeiten

- **V4 Foundation (FEAT-022, FEAT-024)**: `employee`-Rolle und Invitation-Flow existieren. `block_submit`-Eintraege existieren als Aktivitaets-Marker.
- **V4 Foundation (FEAT-027)**: Cockpit-MetricCards-Komponente existiert. Neue Card wird einfach hinzugefuegt.
- **Coolify-Cron-Container**: Pattern aus Business System V4.x ist verfuegbar (Annahme A-V4.2-1).
- **Supabase-Auth-SMTP**: Magic-Link-E-Mails funktionieren bereits (Annahme A-V4.2-2).

## Cross-Refs

- DEC-V4.2-4, DEC-V4.2-5, DEC-V4.2-6, DEC-V4.2-9 (PRD V4.2-Sektion)
- SC-V4.2-4, SC-V4.2-5, SC-V4.2-6, SC-V4.2-11, SC-V4.2-12 (PRD V4.2-Sektion)
- Q-V4.2-B (Werktage-Definition — definitiv in /architecture)
- Q-V4.2-D (Badge-Refresh-Strategie — definitiv in /architecture)
- Q-V4.2-E (Cron-Containerisierung — definitiv in /architecture)
- Q-V4.2-G (`user_settings`-Schema-Wahl — definitiv in /architecture)
