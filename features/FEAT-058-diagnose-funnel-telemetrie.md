# FEAT-058 — Diagnose-Funnel-Telemetrie

**Version:** V7.1
**Status:** planned
**Created:** 2026-05-20

## Zweck

Kontinuierliche Erfassung von Funnel-Signalen im Diagnose-Werkzeug: Drop-off pro Frage, Helper-Text-Klick-Rate pro Frage, Time-on-Question. Grundlage fuer datengetriebene Conversion-Optimierung (Learning-Loop). Adressiert BL-117 + User-Direktive 2026-05-20 "wir muessen den Diagnose-Funnel kontinuierlich optimieren koennen".

## Hintergrund

Heute existieren keine Funnel-Daten. Wenn ein Mandant abbricht: kein Signal welche Frage ihn ueberforderte. Wenn ein Partner einen Helper-Text iteriert: keine Wirkungsmessung. Wenn eine Frage "zu lange" gedacht wird: kein Signal um sie umzuformulieren.

Loesung: leichtgewichtiges Event-Log + Tracker-Lib + Admin-Analytics-Page mit aggregierten KPIs. DSGVO-konform durch Anonymisierung + 5-Sessions-Aggregations-Schwelle.

## In Scope

- **Migration `diagnose_event`-Tabelle** (Migration 100):
  - Spalten: `id uuid PRIMARY KEY`, `capture_session_id uuid NOT NULL`, `tenant_id uuid NOT NULL`, `partner_org_id uuid NULL`, `event_type text NOT NULL CHECK (event_type IN ('question_start','question_answer','question_skip','helper_text_open','session_paused','session_resumed','session_abandoned','session_completed'))`, `question_key text NULL` (bei Question-Events), `payload jsonb DEFAULT '{}'`, `is_test boolean NOT NULL DEFAULT false`, `created_at timestamptz NOT NULL DEFAULT now()`.
  - Indizes: `(capture_session_id, created_at)`, `(tenant_id, event_type, created_at)`, `(partner_org_id, created_at) WHERE partner_org_id IS NOT NULL`.
  - RLS: `strategaize_admin` darf alles lesen. `partner_admin` darf nur Events mit `partner_org_id = own_partner_org`. `tenant_admin` + `tenant_member` KEIN Zugriff.
- **Client-Side-Tracker-Lib** `src/lib/telemetry/diagnose.ts`:
  - `trackEvent(type, payload?)` — fire-and-forget POST an `/api/diagnose-event` mit Session-Context (capture_session_id aus Page-Route + tenant_id + partner_org_id aus Server-Component-Pre-Load).
  - Browser-Heartbeat: alle 5s `trackEvent('session_heartbeat', { question_key })` solange Tab aktiv ist (visibilitychange-Listener).
  - `beforeunload`-Flush: bei Tab-Close emittiert `session_paused` mit `current_question_key`.
  - 30min-Inaktivitaet-Detector: wenn keine Events fuer 30min, Worker-Cron emittiert serverseitig `session_abandoned`.
  - **`is_test`-Flag**: Tracker prueft localStorage-Key `strategaize:is_test_user`, setzt Flag entsprechend. SLC-700-Live-Test-Daten landen damit als `is_test=true`, Analytics filtert sie raus.
- **Server-Endpoint** `POST /api/diagnose-event`:
  - Validiert Session-Token + Event-Schema.
  - INSERT in `diagnose_event` mit Tenant + Partner-Resolution.
  - Rate-Limit pro Session 600 Events/Stunde (10 pro Minute, schuetzt vor Tracker-Bug-Floods).
- **Admin-Analytics-Page** `/admin/diagnose-funnel-analytics`:
  - **KPI-Tiles**: Gesamt-Sessions, Completion-Rate (% completed / started), Median-Time-on-Question, Helper-Text-Open-Rate.
  - **Drop-off-Chart pro Frage**: horizontale Bar-Chart mit 24 Fragen, % der Sessions die NICHT zur naechsten Frage gegangen sind. Click auf Bar → Details.
  - **Time-on-Question Histogram**: pro Frage Verteilung (p50, p75, p90). Auffaellige Fragen (p90 > 60s) markiert.
  - **Helper-Text-Hits**: pro Frage Anzahl `helper_text_open` Events / Anzahl `question_start` Events.
  - **Scope-Filter**: "Alle Partner" (nur strategaize_admin), "Mein Partner" (partner_admin Default), "Pro Mandant" deaktiviert (DSGVO-Schwelle ≥5 Sessions).
  - **Date-Range**: letzte 7/30/90 Tage.
  - **5-Sessions-Schwelle**: Aggregationen unter 5 Sessions als "zu wenig Daten" gegraut.
  - **is_test-Filter**: Default `is_test=false`, Toggle "Test-Daten einschliessen" fuer strategaize_admin.
- **DSGVO-Datensparsamkeit**:
  - Event-Payload enthaelt KEIN Klartext-PII (keine Antwort-Inhalte, keine Email, keine IP).
  - `question_key` und `event_type` sind aussage-arme Strings, kein Personenbezug.
  - capture_session_id ist UUID, nicht zurueckfuehrbar auf User ohne capture_session-Join.
  - Aggregation-Schwelle: Analytics-Page exponiert keine Daten unter 5 Sessions pro Filter-Combo (Privacy-Schutz).
- **Vitest-Coverage**:
  - Event-Insert via API-Endpoint (8 Event-Types).
  - RLS-Pen-Test (partner_admin sieht NICHT andere Partner).
  - Drop-off-Aggregation gegen Test-Fixture mit 10 Sessions.
  - is_test-Flag wird respektiert.
  - 5-Sessions-Schwelle blockt Aggregation unter Limit.
  - 30min-Inaktivitaet-Cron emittiert `session_abandoned`.

## Out of Scope

- **A/B-Test-Variants pro Frage** — V7.1 misst nur. Variant-Mechanik ist IS V3.1 (BL-088 dort).
- **CSV/Excel-Export der Analytics** — V8+.
- **Real-Time-Dashboard** mit Push-Updates — V8+. V7.1 ist Server-Render-only.
- **Single-Mandant-Drilldown** — DSGVO-Risiko, V8+ mit Consent-Mechanik.
- **Funnel-Recommendations** (KI-Vorschlaege "Frage X umformulieren") — V8+, IS V3-Cross-Repo-Bruecke.
- **Performance-Apdex** oder andere RUM-Metriken — V7.1 nur Funnel-Signale.
- **Heartbeat-Sampling** — V7.1 100% Coverage (Volumen klein in Internal-Test-Mode).

## Akzeptanzkriterien

- AC-1: Migration 100 appliziert idempotent. Tabelle + Indizes + RLS-Policies live.
- AC-2: `POST /api/diagnose-event` mit gueltiger Session inserts Row.
- AC-3: Browser-Tracker emittiert in einem End-to-End-Test-Run mindestens 5 Event-Types (`question_start`, `question_answer`, `helper_text_open`, `session_paused`, `session_completed`).
- AC-4: `beforeunload`-Flush sendet `session_paused`-Event mit current question_key.
- AC-5: 30min-Inaktivitaet-Cron (Worker-Endpoint) markiert Session als `session_abandoned` wenn kein Event fuer 30min.
- AC-6: Analytics-Page als `strategaize_admin` zeigt alle Partner aggregiert, als `partner_admin` nur eigene.
- AC-7: 5-Sessions-Schwelle: Filter mit Ergebnis unter 5 Sessions zeigt "zu wenig Daten".
- AC-8: `is_test=true` Events default ausgeblendet in Analytics, Toggle macht sie sichtbar.
- AC-9: RLS-Pen-Test: `partner_admin` Partner A kann NICHT Events von Partner B sehen.
- AC-10: Vitest 100% Coverage auf Tracker-Lib + Analytics-Aggregations-Queries.

## Abhaengigkeiten

- **Hard-Dep**: FEAT-057 fuer `helper_text_open`-Event-Emission (Info-Icon-Klick).
- **Pattern-Reuse**: RLS-Pattern aus V6 Migration 090.
- **Pattern-Reuse**: rate-limit.ts aus V4.2 (Reuse fuer `/api/diagnose-event`).
- **Pattern-Reuse**: Worker-Cron-Pattern aus V7 (Cleanup-Cron als Vorlage fuer Abandoned-Detector).
- **Cross-Repo-Bruecke** (V8+, NICHT V7.1): IS V3 Recommendation-Engine konsumiert diagnose_event-Daten.
- **Downstream-Dep**: Keine V7.1-Downstream. Wird in V8+ als Daten-Quelle fuer A/B + KI-Recommendations genutzt.
