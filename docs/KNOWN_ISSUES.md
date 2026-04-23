# Known Issues

### ISSUE-001 — secrets-onboarding.txt liegt untracked im Repo-Root
- Status: resolved
- Resolution Date: 2026-04-14
- Severity: Medium
- Area: Security / Repo-Hygiene
- Summary: Die Datei /secrets-onboarding.txt liegt untracked im Repo-Root. Sie ist NICHT in .gitignore aufgefuehrt. Bei versehentlichem `git add .` wuerde sie committed werden.
- Impact: Risiko, dass Secrets (JWT, DB-Password, SMTP, Bedrock-Keys) in oeffentliches GitHub-Repo gelangen.
- Workaround: Nie `git add .` verwenden, nur gezieltes Staging.
- Resolution: .gitignore um `secrets-*.txt`, `*.secrets`, `secrets/` erweitert. secrets-onboarding.txt wird jetzt garantiert ignoriert, auch bei versehentlichem `git add .`.

### ISSUE-002 — Test-Infrastruktur fehlt im Repo
- Status: resolved
- Resolution Date: 2026-04-15
- Severity: High
- Area: QA / Build-Toolchain
- Summary: `package.json` hatte kein `test`-Script und keine Test-Framework-Abhaengigkeit.
- Impact: SLC-001 MT-4 und MT-5 blieben ohne Automatisierung.
- Resolution: SLC-002a. Vitest 2.1 + @vitest/coverage-v8 + pg 8.13 + dotenv installiert. Scripts `test`, `test:watch`, `test:coverage` in package.json. Test-Harness unter `src/test/` (db.ts, auth-context.ts, fixtures/tenants.ts). README-Abschnitt "Running Tests" mit SSH-Tunnel- und server-side Variante dokumentiert. Erste Test-Datei `src/lib/db/__tests__/rls-isolation.test.ts` 3/3 gruen (verifiziert auf Hetzner via node:20-Container im Coolify-Netzwerk).

### ISSUE-003 — node_modules nicht installiert
- Status: resolved
- Resolution Date: 2026-04-18
- Severity: Medium
- Area: Build-Toolchain
- Summary: Im Onboarding-Repo wurde nach dem Blueprint-Fork noch kein `npm install` ausgefuehrt.
- Resolution: SLC-011 MT-1. npm install + npm run build lokal erfolgreich durchgefuehrt.

### ISSUE-004 — SLC-001 MT-5 nicht durchgefuehrt (2-Tenant-RLS-Isolationstest)
- Status: resolved
- Resolution Date: 2026-04-15
- Severity: High
- Area: QA / RLS-Verifikation
- Summary: SLC-001 Acceptance Criterion 3 verlangte einen automatisierten Test.
- Impact: Multi-Tenancy-Isolation war nicht automatisiert abgesichert.
- Resolution: SLC-002a MT-4. Drei Vitest-Tests in `src/lib/db/__tests__/rls-isolation.test.ts` decken ab: (a) capture_session cross-tenant read-isolation fuer Tenant A und B, (b) knowledge_unit + validation_layer cross-tenant read-isolation, (c) WITH CHECK Cross-Tenant-INSERT-Verbot. 3/3 gruen auf Hetzner-DB verifiziert.

### ISSUE-005 — App-Title "StrategAIze Kundenplattform" (Blueprint-Branding)
- Status: resolved
- Resolution Date: 2026-04-16
- Severity: Low
- Area: Frontend / Branding
- Summary: Die Login-Seite rendert mit `<title>StrategAIze Kundenplattform</title>`. Artefakt aus dem Blueprint-Fork.
- Impact: Rein kosmetisch. Onboarding-Plattform sollte eigene Branding haben.
- Resolution: SLC-002c. Root-Metadata in `src/app/layout.tsx` + `src/messages/{de,en,nl}.json` auf `StrategAIze Onboarding` + Onboarding-spezifische Descriptions umgestellt. Sidebar-Blocks in `dashboard-sidebar.tsx` + `run-workspace-client.tsx` von hardcoded `"Blueprint Assessment"` auf i18n-Key `sidebar.title = "Assessment"` umgestellt (neutral bis Template-Infra in SLC-003 kommt). `package.json` name `ai-coding-starter-kit` → `strategaize-onboarding-plattform`. `src/i18n/config.ts` Header-Kommentar aktualisiert. Commit 77aa974. Live verifiziert per Smoketest: `<title>StrategAIze Onboarding</title>` + korrekte `<meta description>` + i18n-Payload enthält `sidebar.title: "Assessment"`.

### ISSUE-006 — Legacy-Blueprint-Migrations im sql/migrations/ Ordner
- Status: resolved
- Resolution Date: 2026-04-18
- Severity: Low
- Area: Repo-Hygiene / Database
- Summary: Die 16 Blueprint-Migrations (003-020) waren noch im `sql/migrations/`-Ordner.
- Resolution: SLC-011 MT-6. Alle 16 Legacy-Migrations (003-020) geloescht. sql/migrations/ enthaelt nur noch 021+.

### ISSUE-007 — JWT enthaelt nach Rollen-Umbenennung bis zum naechsten Login alten Wert
- Status: open
- Severity: Low
- Area: Auth / Session-Management
- Summary: Migration 026 (SLC-002) hat den Blueprint-Wert `tenant_owner` in `profiles.role` durch `tenant_admin` ersetzt. Die RLS-Helper-Funktion `auth.user_role()` liest `profiles.role` direkt aus der DB — neue Queries sehen den richtigen Wert sofort. Supabase-JWTs, die vor der Migration ausgestellt wurden, koennen aber noch `raw_user_meta_data.role = 'tenant_owner'` enthalten (falls dort gesetzt). Das hat keinen RLS-Effekt (Policies nutzen `auth.user_role()`), kann aber in App-Code, der `profile.role` aus `raw_user_meta_data` liest, stale sein.
- Impact: Nur relevant fuer bestehende Sessions, die vor dem Deploy ausgestellt wurden. Frisch aufgesetzte Hetzner-Instanz (2026-04-15) hat noch keine User mit eigenen Sessions — Impact in V1 praktisch 0.
- Workaround: Bei produktivem Einsatz vor dem Kickoff-Launch einmal alle Sessions invalidieren oder User bitten, sich neu anzumelden. `@supabase/ssr` refresht Token automatisch beim naechsten Call, sofern ein Refresh-Token vorhanden ist.
- Next Action: Beim ersten echten Kundenlaunch dokumentieren; aktuell keine Aktion noetig.

### ISSUE-008 — Legacy-Blueprint-API-Route /api/tenant/runs/[runId]/feedback
- Status: resolved
- Resolution Date: 2026-04-16
- Severity: Low
- Area: Backend / API
- Summary: Die Route `src/app/api/tenant/runs/[runId]/feedback/route.ts` greift auf Blueprint-Tabellen `runs` und `run_feedback` zu, die im Onboarding-Schema nicht existieren. Jeder Aufruf wuerde HTTP 500 liefern. Die Route ist toter Code aus dem Blueprint-Fork.
- Impact: Kein Produktions-Risiko (tote Route, niemand ruft sie auf), aber Verwirrungspotenzial und Build-Ballast. Analog zu ISSUE-006 (Legacy-Migrations).
- Resolution: SLC-002d MT-2b. Route komplett entfernt, zusaetzlich `src/components/workspace/feedback-panel.tsx` + Feedback-Tab-Render + Import in `run-workspace-client.tsx` + `"feedback"` aus `WorkspaceTab`-Type + i18n-Keys `workspace.tabs.feedback*` + `workspace.feedback.*`. Commit 7a80504.

### ISSUE-009 — Blueprint-Profile-Flow Silent Failure (owner_profiles-Tabelle fehlt)
- Status: resolved
- Resolution Date: 2026-04-16
- Severity: Medium
- Area: Frontend / Backend Legacy
- Summary: Der Blueprint-geerbte `/profile`-Flow (src/app/profile/page.tsx + profile-form-client.tsx) laedt ueber `PUT /api/tenant/profile` ein owner_profiles-Upsert. `handleSave` in profile-form-client.tsx prueft nur `res.ok === true` und zeigt bei Fehlern keinen Feedback — User klickt "Profil speichern", API antwortet HTTP 500, UI zeigt nichts. Beim SLC-002b-Smoketest am 2026-04-16 entdeckt.
- Annahme-Korrektur (2026-04-16): Die urspruengliche Begruendung "owner_profiles wurde per MIG-003 entfernt" war falsch — MIG-003 ist `003_block_checkpoints.sql` (unrelated). Realer Grund: die Tabelle wurde beim Onboarding-DB-Aufbau (SLC-001) nie angelegt, weil Migrations 012+014 aus dem Blueprint-Fork nicht im Onboarding-Migrations-Runner aufgenommen waren. `\d owner_profiles` am 2026-04-16 auf Hetzner-DB: "Did not find any relation named 'owner_profiles'".
- Impact: User wird nach Login eventuell auf /profile geroutet (Blueprint-Legacy-Redirect) und kann dort nicht weiter navigieren, weil Save fehlschlaegt und kein Cancel-Button sichtbar ist. Blockiert realen Testflow der Plattform, bis Legacy entfernt ist.
- Resolution: SLC-002d MT-2a..2d. Komplette Profile-Flow entfernt:
  - UI: `src/app/profile/`, `src/components/profile/`, `src/app/api/tenant/profile/route.ts`
  - Dashboard: Owner-Profile-Check + Redirect auf `/profile` raus
  - Sidebar: `/profile`-Link raus, `/mirror/profile`-Link bleibt (nur fuer mirror_respondent-Rolle)
  - owner_profiles-Lookups: alle 6 Call-Sites in `src/lib/llm.ts` (Aufrufe) + 4 runs-APIs (chat, freeform/chat, generate-answer, evidence) entfernt. `buildOwnerContext` + `OwnerProfileData` bleiben als Dead Code in `llm.ts` fuer V2+ Wiederverwendung bei template-spezifischer Owner-Erhebung.
  - i18n: `profile.*` Block aus de.json + en.json + nl.json entfernt.
  - DB: Migration 028_drop_owner_profiles.sql (idempotent, `DROP TABLE IF EXISTS CASCADE`). Ausgefuehrt auf Hetzner 2026-04-16 — No-Op, da Tabelle nicht existierte. Legacy-Migrations 012 + 014 als DEPRECATED markiert.
  - Commit 7a80504. Redeploy + Smoketest beide Seed-User PASS am 2026-04-16.

### ISSUE-010 — Questionnaire-UI fehlt Blueprint-Chat-Flow (Summary, Memory, Event-History)
- Status: resolved
- Resolution Date: 2026-04-18
- Severity: High
- Area: Frontend / Questionnaire
- Summary: Die Questionnaire-UI (SLC-005) divergierte vom Blueprint-Flow. Es fehlen: "Zusammenfassung erstellen"-Button, Summary-Card mit "Als Antwort uebernehmen"/"Regenerieren", "Was die KI sich gemerkt hat" Memory-Sektion, Event-History in der rechten Spalte. Stattdessen wurde ein falsches Direkt-Textarea rechts eingebaut (entfernt in b91a19d). Die fehlenden Features werden in SLC-008 Teil A nachgebaut.
- Impact: Questionnaire ist ohne KI-Summary/Memory-Flow nicht produktiv nutzbar. Teilnehmer kann keine KI-generierte Zusammenfassung als Antwort uebernehmen.
- Resolution: SLC-008 Teil A (MT-A1..A6). Blueprint-Chat-Flow komplett implementiert: Bedrock-Chat-API, Session-Memory, Zusammenfassung+Uebernahme, Event-History. Live-verifiziert nach Coolify-Redeploy.

### ISSUE-011 — ~41 Blueprint-Legacy-Dateien im Codebase (Dead Code)
- Status: resolved
- Resolution Date: 2026-04-18
- Severity: Medium
- Area: Repo-Hygiene / Code-Qualitaet
- Summary: Aus dem Blueprint-Fork stammten ~64 Legacy-Dateien (API-Routes, Pages, Components, Migrations).
- Resolution: SLC-011. 28 API-Routes, 15 Pages, 5 verwaiste Components, 16 Legacy-Migrations geloescht. Dashboard mirror_respondent-Redirects + Sidebar mirror-Link entfernt. admin/tenants Route von run_count auf session_count umgestellt. Build erfolgreich.

### ISSUE-012 — Dashboard zeigt leere Blueprint-Runs statt Capture-Sessions
- Status: resolved
- Resolution Date: 2026-04-18
- Severity: Medium
- Area: Frontend / Dashboard
- Summary: dashboard-client.tsx fetchte von /api/tenant/runs (Blueprint-API, nicht-existent).
- Resolution: SLC-012 MT-3. Dashboard auf Supabase capture_session-Query umgebaut. Zeigt Template-Name, Status, Zeitstempel. Links zu /capture/{sessionId}.

### ISSUE-013 — error_log-Tabelle fehlt in Onboarding-DB
- Status: resolved
- Resolution Date: 2026-04-18
- Severity: Medium
- Area: Observability
- Summary: logger.ts schrieb in error_log-Tabelle die in der Onboarding-DB nicht existierte.
- Resolution: SLC-012 MT-1+MT-2. Migration 039_error_log.sql erstellt und auf Hetzner ausgefuehrt. Tabelle mit RLS (strategaize_admin read), Index, service_role GRANT.

### ISSUE-014 — Voice-Input (Whisper) nicht verdrahtet fuer Capture-Sessions
- Status: resolved
- Severity: Low
- Area: Frontend / Voice
- Summary: transcribeRecording() in questionnaire-form.tsx war ein Stub — Audio wurde aufgenommen aber nie an den Whisper-Container gesendet. Der Whisper-Endpoint fuer Blueprint-Runs (/api/tenant/runs/[runId]/questions/[questionId]/transcribe) existiert, aber es gibt kein Aequivalent fuer Capture-Sessions. Mic-Button ist seit 2026-04-18 deaktiviert (whisperEnabled = false).
- Impact: Kein Voice-Input in V1. Tastatureingabe funktioniert.
- Resolution: SLC-022 (V2). Whisper-Adapter-Pattern (DEC-018) unter /src/lib/ai/whisper/ implementiert. Transkriptions-Endpoint POST /api/capture/[sessionId]/transcribe. Mic-Button via NEXT_PUBLIC_WHISPER_ENABLED aktiviert. Resolution Date: 2026-04-21.

### ISSUE-015 — Kein Zurueck-Button in Sidebar auf Sub-Seiten
- Status: resolved
- Resolution Date: 2026-04-23
- Severity: Medium
- Area: Frontend / UX
- Summary: Auf Sub-Seiten (Dialogue-Listing, Meeting-Guide, /capture/new, Dialogue-New) hat die DashboardSidebar keinen Zurueck-Link zur vorherigen Seite. Die Sidebar zeigt nur "Assessment" und "Neue Erhebung", aber keinen Weg zurueck.
- Impact: User muss Browser-Back verwenden, was nicht sauber ist. Abmelden-Button ist kein Ersatz.
- Resolution: DashboardSidebar um kontextabhaengigen Zurueck-Link erweitert. `getBackLink(pathname)` mappt die aktuelle Route auf die passende Parent-Route (z.B. `/capture/[sessionId]/block/[blockKey]` → `/capture/[sessionId]`). Back-Link wird nur gerendert, wenn pathname nicht `/dashboard` ist. i18n-Key `sidebar.back` in de/en/nl. Build PASS.

### ISSUE-016 — Sprachwechsel fehlt auf /admin-Seiten
- Status: open
- Severity: Low
- Area: Frontend / i18n
- Summary: Sprachwechsel ist nur auf Dashboard sichtbar, nicht auf /admin-Seiten wo tenant_admin jetzt auch die Sidebar sieht.
- Next Action: Language-Switcher in DashboardSidebar integrieren.

### ISSUE-017 — 25 Test-Sessions in Demo-Tenant DB
- Status: open
- Severity: Low
- Area: Data / Demo
- Summary: Der V3 Smoke-Test erzeugte 25 Test-Sessions (vorwiegend Dialogue-Mode) im Demo-Tenant. Diese sind fuer produktive Demo-Use nicht nuetzlich.
- Next Action: Cleanup-Skript oder manuelle DELETE-Query vor Release.
