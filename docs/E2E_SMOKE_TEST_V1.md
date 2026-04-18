# E2E Smoke Test — V1

## Zweck

Manueller End-to-End-Testlauf der Onboarding-Plattform V1. Verifiziert den gesamten Flow von Session-Start bis JSON-Export.

## Voraussetzungen

- App deployed und erreichbar unter `https://onboarding.strategaizetransition.com`
- Demo-Tenant existiert (Migration 027)
- strategaize_admin und demo-tenant_admin Accounts existieren (seed-admin.mjs)
- Worker-Container laeuft (Condensation-Pipeline)

## Testschritte

### 1. Login als tenant_admin

1. Oeffne `https://onboarding.strategaizetransition.com/login`
2. Login mit Demo-tenant_admin Credentials
3. Erwartung: Redirect auf Dashboard

### 2. Session starten

1. Klicke auf "Assessment starten" (Exit-Readiness Template)
2. Erwartung: Neue Capture-Session wird erstellt, Block-Liste erscheint (9 Bloecke A-I)

### 3. Block bearbeiten

1. Waehle Block A
2. Beantworte mindestens 3 Fragen ueber den KI-Chat
3. Erwartung: Autosave greift, Antworten werden in `capture_session.answers` JSONB gespeichert

### 4. Block Submit

1. Klicke "Block abschliessen"
2. Erwartung:
   - `block_checkpoint` mit `type=questionnaire_submit` wird erstellt
   - `ai_jobs` Row mit `status=pending` wird enqueued
   - Worker claimed Job innerhalb von ~5 Sekunden

### 5. KU-Erzeugung abwarten

1. Warte 30-120 Sekunden (Worker-Condensation-Loop)
2. Verifiziere auf Hetzner:
   ```bash
   docker exec -i <db-container> psql -U postgres -d postgres -c \
     "SELECT id, title, status FROM knowledge_unit WHERE block_key = 'A' ORDER BY created_at LIMIT 5;"
   ```
3. Erwartung: Mindestens 1 KU mit `status=proposed`, `source=ai_draft`

### 6. Debrief: KU Review (als strategaize_admin)

1. Login als strategaize_admin
2. Oeffne `/admin/debrief/<sessionId>/A`
3. Erwartung: KU-Liste mit Confidence-Badges und Status-Badges
4. Klicke "Akzeptieren" auf einer KU
5. Erwartung: Status wechselt auf "Akzeptiert", Validation-Layer-Eintrag wird erstellt
6. Klicke "Bearbeiten" auf einer anderen KU, aendere Text, speichere
7. Erwartung: Status wechselt auf "Bearbeitet"
8. Klicke "+ KU hinzufuegen", erstelle eine manuelle KU
9. Erwartung: Neue KU mit `source=manual` erscheint in der Liste

### 7. Meeting-Snapshot erstellen

1. Auf der Debrief-Seite: Meeting-Modus-Toggle aktivieren
2. Klicke "Meeting abschliessen"
3. Bestaetigung im Dialog
4. Erwartung:
   - `block_checkpoint` mit `type=meeting_final` wird erstellt
   - Block zeigt "Finalisiert"-Status
   - Wenn ALLE 9 Bloecke finalisiert: `capture_session.status = 'finalized'`

### 8. Final-View (als tenant_admin)

1. Login als tenant_admin
2. Oeffne `/capture/<sessionId>/block/A/final`
3. Erwartung: Read-only-Ansicht der finalisierten KUs, kein Editor, kein Chat

### 9. JSON-Export

1. Als strategaize_admin oder tenant_admin:
   ```bash
   curl -b <auth-cookie> https://onboarding.strategaizetransition.com/api/export/checkpoint/<checkpointId>
   ```
2. Erwartung: JSON-Response mit `content.kus[]`, `content_hash`, `checkpoint_type=meeting_final`
3. Verifiziere Schema gegen `/docs/EXPORT_SCHEMA.md`

### 10. RLS-Pruefung

1. Als tenant_admin von Demo-Tenant:
   - `/admin/debrief/...` → Redirect auf `/dashboard` (kein Admin-Zugang)
   - Export-API fuer Checkpoint eines anderen Tenants → 404

## Ergebnis-Dokumentation

| Schritt | Status | Anmerkung |
|---|---|---|
| 1. Login tenant_admin | | |
| 2. Session starten | | |
| 3. Block bearbeiten | | |
| 4. Block Submit | | |
| 5. KU-Erzeugung | | |
| 6. Debrief KU Review | | |
| 7. Meeting-Snapshot | | |
| 8. Final-View | | |
| 9. JSON-Export | | |
| 10. RLS-Pruefung | | |
