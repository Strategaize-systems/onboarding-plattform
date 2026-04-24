# SLC-040 — Handbuch-UI + Self-Service-Cockpit Foundation

## Goal
Zwei zusammenhaengende UI-Bausteine fuer tenant_admin: (1) Handbuch-Generieren-Button + Download der ZIP, und (2) Self-Service-Status-Cockpit auf `/dashboard` mit 5 Metriken und regelbasiertem "Naechster Schritt". **Pflicht-Gate: Browser-Smoke-Test mit Nicht-Tech-User** vor V4-Release (R17, SC-V4-5). Abschluss der V4-Slices — letzter Slice vor Gesamt-V4-QA.

## Feature
FEAT-026 (Handbuch-UI) + FEAT-027 (Cockpit Foundation)

## In Scope
### A — Handbuch-UI
- Route `/admin/handbook/page.tsx` (oder `/dashboard/handbook`) — Server-Component:
  - Laedt alle handbook_snapshot-Rows der aktuellen Session (sortiert nach created_at desc).
  - Zeigt Button "Unternehmerhandbuch generieren" (und "Neu generieren" falls bereits vorhanden).
  - Zeigt Liste der Snapshots mit Status-Badge (generating/ready/failed) + Datum + Groesse + Download-Button.
- Server-Action `triggerHandbookSnapshot(captureSessionId)`:
  - tenant_admin-Check.
  - Ruft rpc_trigger_handbook_snapshot.
  - Revalidate.
- Server-Action `getHandbookDownloadUrl(snapshotId)`:
  - tenant_admin-Check.
  - Ruft rpc_get_handbook_download_url (oder generiert direkt signed URL via supabase.storage.from('handbook').createSignedUrl).
  - Return signed URL; Client oeffnet Download via window.location.href oder `<a download>`.
- Status-Polling fuer generating-Snapshots: meta-refresh nach 5s oder einfacher Auto-Reload.
- UI-Component `HandbookSnapshotList.tsx` + `HandbookSnapshotCard.tsx`.

### B — Self-Service-Status-Cockpit
- Route `/dashboard/page.tsx` (bestehende Route erweitert oder ersetzt mit Cockpit-Layout):
  - Server-Component laedt folgende Metriken:
    - `blocksTotal` = template.blocks.length.
    - `blocksSubmitted` = COUNT block_checkpoint WHERE session=current AND checkpoint_type='questionnaire_submit'.
    - `employeesInvited` = COUNT profiles WHERE tenant_id AND role='employee'.
    - `employeeTasksOpen` = COUNT capture_session WHERE tenant_id AND capture_mode='employee_questionnaire' AND status IN ('open','in_progress').
    - `employeeTasksDone` = COUNT capture_session WHERE tenant_id AND capture_mode='employee_questionnaire' AND status IN ('submitted','finalized').
    - `lastBridgeRun` = latest bridge_run fuer Session.
    - `lastHandbookSnapshot` = latest handbook_snapshot fuer Session.
- `computeRecommendedNextStep({ ... })` Helper in `src/lib/cockpit/next-step.ts`:
  - Regel-basierte Logik wie in ARCHITECTURE.md V4-Cockpit-Sektion spezifiziert.
  - Return { label, href, reason }.
- UI-Component `StatusCockpit.tsx`:
  - Metriken-Karten (5 Kacheln).
  - "Naechster Schritt"-Banner oben.
  - Klickbare Verknuepfungen zu den jeweiligen Routes (/admin/bridge, /admin/team, /admin/handbook, Block-Route etc.).
- Statische Hinweise:
  - "Mitarbeiter erinnern (manuell)" als statischer Text — kein Action (V4.2).
  - Bridge-stale-Hinweis hier ebenfalls prominent.
- strategaize_admin-Sicht: separate Variante des Cockpits fuer Cross-Tenant-View (pro Tenant eine Karte, Link zur jeweiligen Tenant-Sicht) — Minimalversion; kann auch in V4.2 ausgebaut werden, aber mind. Tenant-Liste mit Status-Badge sichtbar.

### C — Pflicht-Browser-Smoke-Test (End-to-End V4)
- Nicht-Tech-User-Test: Ein Tester (idealerweise User selbst oder Nicht-Tech-Peer) fuehrt ohne Erklaerung durch:
  - Login als tenant_admin.
  - Versteht in <2 Min wo er steht und was der naechste Schritt ist.
  - Fuehrt die naechsten 3-4 empfohlenen Schritte aus (Block submitten, Bridge ausloesen, Mitarbeiter einladen, Handbuch generieren).
- Ergebnis dokumentiert im Completion-Report: Was war intuitiv? Was hat verwirrt? (Bugs oder UI-Verbesserungen in SKILL_IMPROVEMENTS oder KNOWN_ISSUES.)

## Out of Scope
- In-App-Handbuch-Webview (V4.1).
- Volltext-Suche im Handbuch (V4.1).
- Live-Editor fuer KUs (V4.1).
- Snapshot-Versionierung + Diff-View (V4.1).
- PDF-Export (spaeter).
- KI-gestuetzte Naechster-Schritt-Empfehlung (V5+).
- Wizard fuer Tenant-Onboarding (V4.2).
- In-App-Hilfe-Tooltips (V4.2).
- Reminder-E-Mails an Mitarbeiter (V4.2).
- Mehrsprachige Cockpit-Texte — Tenant-Language greift (DEC-033).

## Acceptance Criteria
- AC-1: tenant_admin kann Handbuch-Snapshot generieren — status=generating sichtbar → nach Worker-Abschluss status=ready → Download-Button aktiv.
- AC-2: Download-Button loest ZIP-Download aus (signed URL). ZIP enthaelt erwartete Files (Spot-Check).
- AC-3: Bei Error-Status (generating → failed) sieht tenant_admin klare Fehler-Meldung + Re-Try-Button.
- AC-4: Employee kann `/admin/handbook` NICHT oeffnen (Redirect).
- AC-5: Dashboard zeigt 5 Metriken-Karten korrekt (mit live Daten, nicht Mock).
- AC-6: "Naechster Schritt"-Banner ist bei typischen Zustaenden korrekt:
  - 0 Bloecke submitted → "Block A starten".
  - Alle Bloecke submitted, keine Bridge → "Bridge ausfuehren".
  - Bridge done, keine Mitarbeiter → "Mitarbeiter einladen".
  - Mitarbeiter-Aufgaben offen → "Mitarbeiter erinnern (manuell)".
  - Alles fertig, kein Handbuch → "Unternehmerhandbuch generieren".
  - Handbuch da → "Onboarding abgeschlossen".
- AC-7: Klick auf jeden Metrik-Pfad fuehrt zur richtigen Route.
- AC-8: Bridge-stale-Banner sichtbar auf Dashboard wenn aktiv.
- AC-9: Browser-Smoke-Test Nicht-Tech-User: Verstaendnis in <2 Min, 3-4 naechste Schritte intuitiv ausfuehrbar.
- AC-10: `npm run build` + `npm run test` gruen.
- AC-11: Responsive: Cockpit bricht auf mobile sauber (Karten stapeln).
- AC-12: Cross-Tenant-Isolation: tenant_admin sieht NUR eigene Metriken + Snapshots. strategaize_admin sieht alle.

## Dependencies
- Vorbedingung: SLC-033 + SLC-034 + SLC-035 + SLC-036 + SLC-037 + SLC-039 done.
- Kein nachgelagerter Slice (letzter V4-Slice).

## Worktree
Mandatory (SaaS, V4-Abschluss).

## Migrations-Zuordnung
Keine Migration in diesem Slice.

## Pflicht-QA-Vorgaben
- **Pflicht-Gate: Nicht-Tech-User-Smoke-Test** vor V4-Release (R17, SC-V4-5). Dokumentation im Completion-Report mit konkreten Nutzer-Feedback-Beobachtungen.
- Browser-E2E: Happy-Path (Login → Cockpit → naechster Schritt → Aktion).
- Handbuch-Generierung End-to-End (Trigger → Worker → Download).
- Cross-Tenant-Isolation-Test.
- Responsive-Check (mobile, tablet, desktop).
- `npm run test` + `npm run build` gruen.
- IMP-112: Re-Read vor Write.

## Risks
- Cockpit-Query-Performance bei vielen Metriken: Mitigation: Alle COUNT-Queries in Parallel via `Promise.all`, mit RLS-Filter.
- Nicht-Tech-User-Feedback kann UI-Rework triggern: Mitigation: Scope-Disziplin, kleine Nachbesserungen inline, groessere als Issue fuer V4.1.
- Signed-URL-Access via externem Browser-Client: Mitigation: 5 Min Expiry reicht fuer Download.
- R17 (Mitarbeiter-UX) betrifft hier primaer tenant_admin, aber Cockpit-Klarheit zaehlt zum Gesamt-UX-Vertrag.

### Micro-Tasks

#### MT-1: Handbuch-Route + Server-Actions
- Goal: `/admin/handbook/page.tsx` + triggerHandbookSnapshot + getHandbookDownloadUrl.
- Files: `src/app/admin/handbook/page.tsx`, `src/actions/handbook/trigger.ts`, `src/actions/handbook/download-url.ts`
- Expected behavior: Laedt snapshot-Liste, rendert Trigger-Button + Liste. Actions checken Rolle + rufen RPCs.
- Verification: Browser-Test + Unit-Tests der Actions.
- Dependencies: SLC-039 done
- TDD-Note: TDD fuer Actions.

#### MT-2: Handbuch-UI-Components
- Goal: HandbookSnapshotList + HandbookSnapshotCard + Status-Badges.
- Files: `src/app/admin/handbook/HandbookSnapshotList.tsx`, `src/app/admin/handbook/HandbookSnapshotCard.tsx`
- Expected behavior: Liste mit Status + Download-Button. Error-State mit Re-Try-Button.
- Verification: Visual-Check.
- Dependencies: MT-1
- TDD-Note: None.

#### MT-3: Cockpit-Metrik-Loader
- Goal: Server-Component laedt alle 5 Metriken + lastBridgeRun + lastHandbookSnapshot.
- Files: `src/app/dashboard/page.tsx`, `src/lib/cockpit/load-metrics.ts` + Tests
- Expected behavior: Parallel-Queries (Promise.all). Returns strukturiertes Metric-Objekt.
- Verification: Unit-Test load-metrics mit Fixture-DB. Browser-Check.
- Dependencies: SLC-037 done
- TDD-Note: TDD fuer load-metrics.

#### MT-4: Naechster-Schritt-Logik
- Goal: `src/lib/cockpit/next-step.ts` mit Regel-Logik.
- Files: + `src/lib/cockpit/__tests__/next-step.test.ts`
- Expected behavior: Pure Funktion (input: metrics-Objekt) → { label, href, reason }. 6+ Regel-Faelle.
- Verification: Unit-Tests pro Regel.
- Dependencies: MT-3
- TDD-Note: TDD mandatory.

#### MT-5: Cockpit-UI-Component
- Goal: StatusCockpit mit Metrik-Karten + Banner + stale-Indikator.
- Files: `src/app/dashboard/StatusCockpit.tsx` + Unter-Components (MetricCard, NextStepBanner, StaleBanner reuse)
- Expected behavior: Responsive Card-Grid. Klickbare Links.
- Verification: Visual-Check + responsive-Check.
- Dependencies: MT-3, MT-4
- TDD-Note: UI-Tests optional.

#### MT-6: strategaize_admin Cross-Tenant-Sicht
- Goal: Admin-Variante des Cockpits.
- Files: `src/app/admin/tenants/page.tsx` erweitern oder separate Route
- Expected behavior: Liste der Tenants mit Kurz-Status (Bloecke, Mitarbeiter, Handbuch). Klick fuehrt in Tenant-Detail.
- Verification: Browser-Check als strategaize_admin.
- Dependencies: MT-3
- TDD-Note: None.

#### MT-7: Nicht-Tech-User-Smoke-Test
- Goal: E2E-Test mit Nicht-Tech-Person (User selbst).
- Files: Dokumentation im Completion-Report.
- Expected behavior: Durchlauf Login → Dashboard → 3-4 naechste Schritte. Protokoll der Verstaendnis- und Verwirrungspunkte.
- Verification: Dokumentierte Beobachtungen. Kritische UX-Bugs als Issue fuer V4.1 protokolliert.
- Dependencies: MT-1..MT-6
- TDD-Note: Gate fuer V4-Release.

#### MT-8: Record-Updates + FEAT-Status
- Goal: STATE.md + INDEX.md + backlog.json + features/INDEX.md.
- Files: `docs/STATE.md`, `slices/INDEX.md`, `planning/backlog.json`, `features/INDEX.md`
- Expected behavior: SLC-040 done. BL-045 + BL-046 done. FEAT-026 + FEAT-027 done. STATE.md: Phase "V4 All Slices done — nächste /qa Gesamt-V4".
- Verification: Re-Read vor Write (IMP-112).
- Dependencies: MT-1..MT-7
- TDD-Note: Doku.

## Aufwand-Schaetzung
~6-8 Stunden netto. Nicht-Tech-User-Smoke-Test kann Runden drehen (+2-4h fuer UI-Fixes). Gesamt: ~8-12 Stunden.
