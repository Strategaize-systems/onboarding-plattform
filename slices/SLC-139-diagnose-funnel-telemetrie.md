# SLC-139 — FEAT-058 Diagnose-Funnel-Telemetrie

**Feature:** FEAT-058
**Version:** V7.2 (Smart-Split aus V7.1 2026-05-21)
**Status:** planned
**Created:** 2026-05-20
**Estimated effort:** ~6-10h Code-Side
**Pre-Conditions:** SLC-138 done (helper_text_open-Event-Hook in HelperTextModal aktiv)
**Worktree:** `slc-139-diagnose-funnel-telemetrie` (Pflicht)

## Zweck

Migration 100 `diagnose_event` + Client-Side-Tracker-Lib mit 5s-Heartbeat + Server-Endpoint + Admin-Analytics-Page mit Drop-off + Helper-Hits + Time-on-Question + DSGVO-5-Sessions-Schwelle.

## In Scope

Siehe FEAT-058. Konkret:
- Migration 100 diagnose_event + RLS + GRANTs.
- Tracker-Lib `src/lib/telemetry/diagnose.ts` mit 9 Event-Types.
- POST /api/diagnose-event mit Rate-Limit 600/h/Session.
- Wiring in Diagnose-Run-Page + HelperTextModal + Bericht-Page (session_completed).
- Admin-Analytics-Page mit Aggregations-Queries + DSGVO-5-Sessions-Schwelle.
- 30min-Abandoned-Detector on-demand-Query (kein Cron).
- is_test-Filter Default-on.

## Out of Scope

- CSV/Excel-Export Analytics — V8+.
- Real-Time-Push-Updates — V8+.
- Single-Mandant-Drilldown — DSGVO V8+.
- A/B-Test-Variants — IS V3.1.
- Sampling-Mechanik — V8+.

## Micro-Tasks

### MT-1: Migration 100 diagnose_event-Tabelle + RLS + GRANTs
- Goal: Tabelle + 3 Indizes + RLS-Policies + GRANTs idempotent auf Coolify-DB.
- Files: `sql/migrations/100_v71_diagnose_event.sql`, `docs/MIGRATIONS.md` (MIG-046 -> live).
- Expected behavior: Apply via psql + NOTIFY pgrst. RLS prueft strategaize_admin alle SELECT, partner_admin nur eigene partner_org SELECT, authenticated INSERT mit own-tenant + own-session CHECK.
- Verification: `\d diagnose_event` zeigt Schema. SELECT als partner_admin Partner A liefert NUR Events mit partner_org_id=A. INSERT von nicht-own-session -> RLS-Reject.
- Dependencies: SLC-136 done (RLS-Helper-Functions verfuegbar).

### MT-2: Client-Side-Tracker-Lib src/lib/telemetry/diagnose.ts
- Goal: Browser-Tracker mit 9 Event-Types (question_start, question_answer, question_skip, helper_text_open, session_paused, session_resumed, session_abandoned, session_completed, session_heartbeat) + visibilitychange-Listener + beforeunload-Flush via sendBeacon + 5s-Heartbeat-Interval + is_test-Flag aus localStorage.
- Files: `src/lib/telemetry/diagnose.ts`, `src/lib/telemetry/__tests__/diagnose.test.ts`, `src/components/diagnose/DiagnoseTelemetryProvider.tsx` (Client-Provider mit useEffect-Init).
- Expected behavior: `initTracker(session)` startet Heartbeat + Listener. `trackEvent(type, payload)` POST'et fire-and-forget. visibilitychange -> session_paused/resumed. beforeunload via sendBeacon mit reason='beforeunload'.
- Verification: Vitest mit 8+ Cases (Heartbeat-Interval, visibilitychange-Trigger, beforeunload-Sendbeacon-Mock, is_test-Flag, Event-Type-Validation). Volltree-Test PASS.
- Dependencies: MT-1.

### MT-3: Server-Endpoint POST /api/diagnose-event
- Goal: Endpoint mit Rate-Limit 600 Events/h pro Session, Validation, INSERT in diagnose_event.
- Files: `src/app/api/diagnose-event/route.ts`, `src/lib/rate-limit.ts` (Erweiterung: `diagnoseEventLimiter`), `src/app/api/diagnose-event/__tests__/route.test.ts`.
- Expected behavior: POST mit Body `{ capture_session_id, event_type, question_key?, payload?, is_test }` -> Validation -> RLS-Insert. Rate-Limit pro Session-ID, nicht IP. 429 bei 601. Request/h.
- Verification: Vitest 6+ Cases (validRequest -> 201, invalid event_type -> 400, missing capture_session_id -> 400, non-own-tenant-session -> 403 via RLS, rate-limit-trigger -> 429).
- Dependencies: MT-1, MT-2.

### MT-4: Wiring in Diagnose-Run-Page + Bericht-Page
- Goal: Diagnose-Run-Page initialisiert Tracker bei Mount. QuestionCard emittiert `question_start` bei Render, `question_answer` bei Submit, `question_skip` bei Skip-Button. HelperTextModal-Open emittiert `helper_text_open` (Pre-Wiring aus SLC-138 MT-4). Bericht-Page emittiert `session_completed` bei Mount.
- Files: `src/app/dashboard/diagnose/run/page.tsx` (DiagnoseTelemetryProvider-Wrapper), `src/app/dashboard/diagnose/run/components/QuestionCard.tsx` (Event-Emits), `src/app/dashboard/diagnose/run/components/HelperTextModal.tsx` (Cross-Check: helper_text_open Event aus SLC-138 wirklich emittiert), `src/app/dashboard/diagnose/bericht/page.tsx` (session_completed bei Render).
- Expected behavior: End-to-End Diagnose-Lauf emittiert mindestens 8 Events: 1x init, 24x question_start, 24x question_answer, 0-N helper_text_open, 1x session_completed.
- Verification: Live-Smoke via Playwright-MCP: simuliere Diagnose-Lauf, prufe diagnose_event-Rows >= erwartete Counts.
- Dependencies: MT-2, MT-3, SLC-138 MT-4.

### MT-5: Admin-Analytics-Page /admin/diagnose-funnel-analytics
- Goal: Server-Component-Page mit 4 KPI-Tiles (Sessions, Completion-Rate, Median-TOQ, Helper-Open-Rate), Drop-off-Bar-Chart pro Frage, Helper-Hits-Table, TOQ-Histogram. Scope-Filter (alle / pro Partner). 5-Sessions-DSGVO-Schwelle. Date-Range (7/30/90).
- Files: `src/app/admin/diagnose-funnel-analytics/page.tsx`, `src/app/admin/diagnose-funnel-analytics/actions.ts` (Aggregations-Queries), `src/app/admin/diagnose-funnel-analytics/components/DropoffChart.tsx`, `.../HelperHitsTable.tsx`, `.../TOQHistogram.tsx`.
- Expected behavior: Queries respektieren is_test=false Default + 5-Sessions-Schwelle (HAVING COUNT(DISTINCT capture_session_id) >= 5). Filter-Toggle "Test-Daten einschliessen" nur fuer strategaize_admin. partner_admin sieht NUR eigene Daten.
- Verification: Vitest auf Aggregations-Queries gegen Test-Fixture mit 10 Sessions. Manueller Smoke als strategaize_admin + partner_admin.
- Dependencies: MT-4.

### MT-6: 30min-Abandoned-Detector on-demand-Query
- Goal: In Analytics-Page Query: Sessions ohne Event in den letzten 30min werden als `session_abandoned` gezaehlt (LEFT JOIN auf diagnose_event mit MAX(created_at) < now() - 30min). KEIN eigener Cron.
- Files: Erweiterung `src/app/admin/diagnose-funnel-analytics/actions.ts`.
- Expected behavior: Abandoned-KPI berechnet on-demand. Sessions die session_completed-Event haben sind NICHT abandoned.
- Verification: Vitest mit Test-Fixture: 5 Sessions completed, 3 Sessions ohne Event seit 35min -> Abandoned-Count = 3.
- Dependencies: MT-5.

### MT-7: Records-Update + Live-Smoke
- Goal: Records auf done + Live-Smoke gegen Hetzner.
- Files: `slices/INDEX.md`, `planning/backlog.json` (BL-117 -> done), `features/INDEX.md` (FEAT-058 -> done), `docs/STATE.md`, RPT-XXX.md.
- Expected behavior: Live-Smoke-Run: 1x Diagnose-Lauf in Hetzner-Test-Stack, dann Analytics-Page-Render mit Real-Daten. is_test-Filter funktional.
- Verification: Real-Daten in diagnose_event > 100 Events, Analytics-Page zeigt > 0 Drop-off, > 0 Helper-Hits.
- Dependencies: MT-1..6.

## Acceptance Criteria

Siehe FEAT-058 AC-1..10. Plus:
- AC-SLC-139-1: Migration 100 LIVE.
- AC-SLC-139-2: End-to-End-Test-Run emittiert mindestens 5 Event-Types.
- AC-SLC-139-3: Analytics-Page rendert mit 5-Sessions-Schwelle korrekt.

## Risiken

- Tracker-fire-and-forget bei 5s-Heartbeat + langsamer Connection -> Event-Loss. Akzeptiert in V7.1.
- 30min-Detector ist on-demand-Query, bei sehr viel Daten ggf. langsam -> Index-Tuning in MT-1.
- sendBeacon nicht in allen Browsern - Polyfill noetig? Browsers >= 2020 sollten OK sein.
- DSGVO-Schwelle 5 Sessions kann frustrant fuer Single-Partner-Test-Modus sein -> Toggle erst nach Live-Daten-Volumen aktivieren.
