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
- Status: open
- Severity: Medium
- Area: Build-Toolchain
- Summary: Im Onboarding-Repo wurde nach dem Blueprint-Fork noch kein `npm install` ausgefuehrt. Ohne `node_modules` koennen `next build`, `tsc --noEmit` und ein spaeter eingerichtetes Test-Framework nicht lokal validiert werden.
- Impact: Static Type-Check fuer MT-4 Query-Layer in dieser Session nicht durchgefuehrt. Build-Verifikation erst moeglich nach `npm install`. Coolify-Build auf Hetzner lief durch (2026-04-15), Runtime-Verifikation via HTTP 200 auf /login also vorhanden.
- Workaround: Vor Deploy `npm install` ausfuehren (passiert ohnehin im Coolify-Build automatisch).
- Next Action: Einmalig `npm install` lokal ausfuehren, damit Type-Check + Lint in kommenden Slices verfuegbar sind.

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
- Status: open
- Severity: Low
- Area: Repo-Hygiene / Database
- Summary: Die 17 Blueprint-Migrations (003-020) sind noch im `sql/migrations/`-Ordner, werden aber nicht ausgefuehrt (Dockerfile.db referenziert sie nicht, Migrations-Layer laeuft manuell nur fuer 021-023).
- Impact: Keine funktionale Gefahr. Verwirrungspotenzial fuer Neu-Einsteiger.
- Next Action: In einem Maintenance-Slice entfernen, sobald sicher ist dass keine Referenz mehr existiert.

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
- Status: open
- Severity: Medium
- Area: Repo-Hygiene / Code-Qualitaet
- Summary: Aus dem Blueprint-Fork stammen ~41 Dateien die auf nicht-existierende Tabellen (runs, questions, evidence_items, mirror_profiles, mirror_policy_confirmations, question_catalog_snapshots, run_memory, run_feedback) zugreifen. Betroffen: 15 API-Routes unter /api/tenant/runs/, 5 Routes unter /api/tenant/mirror/, 6 Routes+Pages unter /api/admin/runs/ und /admin/runs/, 5 Dateien unter /mirror/, 2 Dateien unter /runs/, 2 Dateien unter /admin/catalog/. Dazu kommen ~7 Components die nur von Legacy-Routes verwendet werden.
- Impact: Kein Runtime-Impact — Legacy-Routes sind nicht ueber die Onboarding-Navigation erreichbar und werden nie aufgerufen. Direkter URL-Zugriff wuerde HTTP 500 liefern. Verwirrungspotenzial fuer Entwickler. Code-Hygiene-Problem.
- Workaround: Legacy-Routes ignorieren, nur Onboarding-spezifische Routes nutzen.
- Next Action: Maintenance-Slice fuer V1.1 — alle Blueprint-Legacy-Dateien entfernen.

### ISSUE-012 — Dashboard zeigt leere Blueprint-Runs statt Capture-Sessions
- Status: open
- Severity: Medium
- Area: Frontend / Dashboard
- Summary: dashboard-client.tsx fetcht von /api/tenant/runs (Blueprint-API). Diese Route greift auf nicht-existierende runs-Tabelle zu. Der Fetch schlaegt fehl, wird per try/finally abgefangen, und das Dashboard zeigt den Empty-State "Keine Assessments vorhanden". Existierende Capture-Sessions sind im Dashboard nicht sichtbar.
- Impact: tenant_admin sieht nach Login ein leeres Dashboard. Der Einstieg in die Erhebung ist nur ueber den Sidebar-Link "Neue Erhebung" moeglich. Bestehende Sessions sind nicht ueber die UI auffindbar — nur per Direkt-URL (/capture/[sessionId]).
- Workaround: Sidebar-Link "Neue Erhebung" verwenden. Fuer bestehende Sessions Direkt-URL nutzen. strategaize_admin kann Sessions ueber /admin/debrief finden.
- Next Action: Dashboard auf Capture-Sessions umbauen (V1.1 oder Maintenance-Slice).

### ISSUE-013 — error_log-Tabelle fehlt in Onboarding-DB
- Status: open
- Severity: Medium
- Area: Observability
- Summary: logger.ts (aus Blueprint geerbt) schreibt Fehler in die error_log-Tabelle. Migration 005 (Blueprint-Legacy) wurde nie auf der Onboarding-DB ausgefuehrt. Alle Error-Log-Writes schlagen still fehl — Fehler gehen verloren.
- Impact: Kein Runtime-Fehler (catch-Block in logToDb faengt den DB-Fehler ab), aber keine Fehler-Sichtbarkeit. Debugging nur ueber Container-Logs moeglich.
- Workaround: Container-Logs ueber `docker logs` oder Coolify-UI.
- Next Action: Migration 005 ausfuehren oder Sentry-Integration (V1.1).

### ISSUE-014 — Voice-Input (Whisper) nicht verdrahtet fuer Capture-Sessions
- Status: open
- Severity: Low
- Area: Frontend / Voice
- Summary: transcribeRecording() in questionnaire-form.tsx war ein Stub — Audio wurde aufgenommen aber nie an den Whisper-Container gesendet. Der Whisper-Endpoint fuer Blueprint-Runs (/api/tenant/runs/[runId]/questions/[questionId]/transcribe) existiert, aber es gibt kein Aequivalent fuer Capture-Sessions. Mic-Button ist seit 2026-04-18 deaktiviert (whisperEnabled = false).
- Impact: Kein Voice-Input in V1. Tastatureingabe funktioniert.
- Next Action: Whisper-Transkriptions-Endpoint fuer Capture-Sessions bauen (V1.1 oder V2).
