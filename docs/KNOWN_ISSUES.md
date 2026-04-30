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
- Status: wontfix
- Resolution Date: 2026-04-23
- Severity: Low
- Area: Frontend / i18n
- Summary: Sprachwechsel ist nur auf Dashboard sichtbar, nicht auf /admin-Seiten wo tenant_admin jetzt auch die Sidebar sieht.
- Resolution: Wontfix — Tenant-Language wird bewusst pro Tenant in `tenants.language` gesetzt und von der Middleware (`src/lib/supabase/middleware.ts:53-83`) auf jedem Request erzwungen. Es gibt keinen User-Facing Language-Switcher — die Sprache wird vom Tenant-Admin zentral in `/admin/tenants` festgelegt, typischerweise beim Tenant-Onboarding. Ein User-Override wuerde die Auth/Session-Architektur brechen und ist fachlich nicht noetig (B2B-Kontext: User arbeiten konsistent in der Sprache ihres Tenants). Siehe DEC-033.

### ISSUE-018 — admin-rls.test.ts: unfiltered SELECT mit Count-Assertion bricht gegen Live-DB mit Bestandsdaten
- Status: resolved
- Resolution Date: 2026-04-24
- Severity: Low
- Area: Testing / Test-Design
- Summary: `src/lib/db/__tests__/admin-rls.test.ts` Zeilen 88, 100 und 197 pruefen unfiltered SELECT-Queries mit `rowCount === 2` bzw. `=== 1`. Sobald in der Live-DB Bestandsdaten existieren, brechen die Assertions. Kein Code-Regression, sondern Test-Isolation-Flaw.
- Resolution: V3.1 BL-039 — drei Assertions per `WHERE tenant_id IN ($1, $2)` mit Test-Tenant-Parametern isoliert. Type-Check gruen. Integration-Test gegen Coolify-DB folgt nach Deploy.

### ISSUE-019 — npm audit: @xmldom/xmldom Transitive-Vuln via AWS-SDK SSO-Token-Providers
- Status: resolved
- Resolution Date: 2026-04-24
- Severity: Low
- Area: Security / Dependencies
- Summary: `npm audit --omit=dev` meldete Vulnerabilities im `@xmldom/xmldom`- und `fast-xml-parser`-Pfad via `@aws-sdk/*`. Praxis-Exploit fuer SSO-Pfad nicht erreichbar, aber `@xmldom/xmldom`-High-Severity zusaetzlich via `mammoth` (DOCX-Extraktion im Evidence-Mode, Production-Pfad).
- Resolution: V3.1 BL-038 — `npm update @aws-sdk/client-bedrock-runtime` 3.1024.0 → 3.1036.0 (Caret-Range; behob fast-xml-parser-Kette). Zusaetzlich npm-Override `@xmldom/xmldom: ^0.8.13` in package.json, damit mammoth die patched 0.8.x-Version verwendet. `npm audit --omit=dev` → 0 Vulnerabilities. 6 verbleibende Moderate in devDependencies (vitest/vite/esbuild-Chain, Dev-Server-Advisory, kein Prod-Risiko) sind als separate Wartungs-Schicht belassen (`vitest@4`-Upgrade = Breaking Change, out-of-V3.1-Scope).

### ISSUE-020 — supabase-studio Container meldet dauerhaft 'unhealthy'
- Status: wontfix
- Resolution Date: 2026-04-24
- Severity: Low
- Area: Infrastructure / Container-Health
- Summary: Image-Default-Healthcheck von `supabase/studio:20241028-a265374` ruft internen Platform-Profile-Endpoint, der in unserer self-hosted Konfiguration nicht stabil antwortet. Container laeuft funktional (SSH-Tunnel erreichbar, Admin-Aktionen klappen), meldet aber `unhealthy` an Docker und Coolify.
- Impact: Keine Produktions-Auswirkung — Studio ist internes Admin-Tool ueber SSH-Tunnel, kein oeffentliches Port-Mapping, kein anderer Service wartet per `condition: service_healthy`. Falschmeldung stoert Coolify-Dashboard-Optik.
- Resolution: V3.1 BL-040 — `docker-compose.yml` Service `supabase-studio` bekommt `healthcheck: disable: true`. Entscheidung in DEC-041 dokumentiert. Falls kuenftig ein anderer Service Studio-Health abhaengig braucht, ist ein eigener Healthcheck nachzuruesten (aktuell keine Notwendigkeit).

### ISSUE-017 — 25 Test-Sessions in Demo-Tenant DB
- Status: resolved
- Resolution Date: 2026-04-23
- Severity: Low
- Area: Data / Demo
- Summary: Der V3 Smoke-Test erzeugte 25 Test-Sessions (vorwiegend Dialogue-Mode) im Demo-Tenant. Diese sind fuer produktive Demo-Use nicht nuetzlich.
- Resolution: 24 leere Sessions (0 checkpoints, 0 knowledge_units) via `DELETE FROM capture_session WHERE tenant_id = '00000000-...de' AND id NOT IN (SELECT DISTINCT capture_session_id FROM block_checkpoint)` geloescht. Die eine Session mit realen Demo-Daten (64ad04eb vom 2026-04-18, 2 checkpoints + 5 knowledge_units) bleibt erhalten als Zeigematerial. ON DELETE CASCADE auf block_checkpoint und knowledge_unit haelt die Referenzen sauber.

### ISSUE-021 — Bridge-Proposal Edit-only-Pfad fehlt
- Status: open
- Severity: Medium
- Area: Frontend / Bridge-UI
- Summary: SLC-036 Slice nennt fuer den Edit-Dialog: "Save → Proposal-Status=edited oder approved (bei Save+Approve)". Implementiert ist nur "Save & Approve" — der reine Edit-Pfad (Aenderungen speichern, Status=edited, ohne Approve+Spawn) existiert nicht. Grund: rpc_approve_bridge_proposal akzeptiert edited_payload und macht edited→approved+spawn atomar in einem Schritt; ein RPC fuer "edit only" wurde in SLC-035 nicht angelegt.
- Impact: tenant_admin kann Vorschlaege nicht zwischenspeichern und spaeter approven. Jeder Edit erzeugt sofort eine Mitarbeiter-Aufgabe. Falls der User unsicher ist und nur "Notiz speichern" will, ist das nicht moeglich.
- Workaround: Edit + spaeter rejecten falls die Aufgabe nicht behalten werden soll. Oder Edit-Werte ausserhalb des Tools notieren bis Approve-Entscheidung steht.
- Next Action: Folge-Slice oder V4.1: rpc_save_edited_proposal(p_proposal_id, p_edited_payload) → status='edited' + UPDATE bridge_proposal mit gemergten Feldern, ohne capture_session-INSERT.

### ISSUE-022 — strategaize_admin kann /admin/bridge nicht nutzen
- Status: open
- Severity: Medium
- Area: Frontend / Authorization
- Summary: SLC-036 Slice erlaubt strategaize_admin als Reviewer ("tenant_admin oder strategaize_admin"). Implementiert ist /admin/bridge so, dass strategaize_admin durch den `!profile.tenant_id` Check zu /dashboard redirected wird. Grund: strategaize_admin hat keine tenant_id im profile — die Page laedt aber tenant-spezifische Daten ueber `eq("tenant_id", profile.tenant_id)`. Konsistent mit team/page.tsx.
- Impact: Owner kann kein Bridge-Review im Production-Flow durchfuehren, ohne sich als tenant_admin eines spezifischen Tenants einzuloggen. Bei Self-Use im Owner-Account-Tenant aber kein Problem.
- Workaround: Owner nutzt seinen Tenant-Admin-Account fuer Bridge-Review.
- Next Action: Falls Owner regelmaessig Cross-Tenant-Bridge-Review braucht: Tenant-Switch-UI bauen (eigener Mini-Slice) ODER /admin/bridge mit Tenant-Picker fuer strategaize_admin erweitern.

### ISSUE-023 — RLS-Gap auf public.profiles: tenant_admin sah Mitarbeiter nicht (Doppel-Root-Cause)
- Status: resolved
- Resolution Date: 2026-04-25
- Severity: High
- Area: Database / RLS
- Summary: tenant_admin konnte unter /admin/team Aktive-Mitarbeiter-Liste und /admin/bridge Edit-Dialog Mitarbeiter-Dropdown keine Mitarbeiter sehen. Bridge-ProposalCards zeigten "Noch nicht zugeordnet" trotz gesetzter proposed_employee_user_id.
- Resolution (Doppel-Fix in zwei Migrations):
  - **Migration 076** (`tenant_admin_select_tenant_profiles`): Neue RLS-Policy auf public.profiles. FOR SELECT TO authenticated, USING auth.user_role()='tenant_admin' AND tenant_id=auth.user_tenant_id(). Tenant-isoliert, read-only.
  - **Migration 077** (`GRANT USAGE ON SCHEMA auth TO authenticated, anon`): Aufgefallen erst nach 076 — die Policy konnte stillschweigend FALSE evaluieren, weil `authenticated` kein USAGE-Grant auf das auth-Schema hatte. Postgres konnte die Cross-Schema-Function-Calls (`auth.user_role()`/`auth.user_tenant_id()`) in der Policy-Expression nicht aufloesen. Das ist Standard-Supabase-Setup, war auf der Onboarding-DB aber nicht gesetzt.
- Impact: Pre-Fix konnte SLC-034 Aktive-Mitarbeiter-Listing nicht funktioniert haben (silent empty result), wurde dort aber nicht entdeckt weil im Smoke nur die Invitation-Seite geprueft wurde. SLC-036 hat es aufgedeckt durch Live-Inspect der Bridge-UI mit gesetzten proposed_employee_user_id. Andere Funktions-Pfade ueber `auth.uid()` funktionierten weiterhin, weil `auth.uid()` direkt im EXECUTE-Privilege aufgeloest wird ohne Schema-USAGE-Check — RLS-Policy-Expressions mit auth.user_role() haben den Check aber benoetigt.
- Lesson learned: Bei Self-hosted-Supabase muss explizit verifiziert werden, dass `nspacl` auf `auth` mindestens `authenticated=U/supabase_auth_admin` enthaelt. Sonst greifen viele RLS-Policies still nicht. Pruefen mit `SELECT nspacl FROM pg_namespace WHERE nspname='auth';`.

### ISSUE-024 — Handbuch-Renderer SOP-Schritt-Schema-Mismatch (leere Steps im Output)
- Status: resolved
- Resolution Date: 2026-04-27
- Severity: High
- Area: Worker / Handbook-Renderer
- Summary: Der Handbuch-Renderer (`src/workers/handbook/sections.ts:339-348`) erwartet `step.title` und `step.detail`, aber das echte SOP-Schema (`src/workers/sop/types.ts` SopStep) hat `{number, action, responsible, timeframe, success_criterion, dependencies}`. Im Output waren alle SOP-Schritte als "Schritt 1, Schritt 2..." ohne Inhalt sichtbar.
- Impact: Generierte Handbuecher zeigten leere SOP-Schritte. Test-Fixture in `__tests__/fixtures.ts` erfand ein nicht-existentes `{title, detail}`-Format und maskierte den Bug in den Unit-Tests.
- Resolution (SLC-039a Mini-Slice, RPT-089): SopStep um Generator-Felder erweitert (number/action/responsible/timeframe/success_criterion/dependencies), Legacy-Felder (title/detail) bleiben optional fuer Rueckwaertskompatibilitaet. renderSop bevorzugt action vor title; rendert Detail-Zeilen `_Verantwortlich:_ X | _Frist:_ Y`, separaten `_Erfolg:_`-Block, `_Voraussetzungen:_ Schritt N, M`. Fixture SOP_BLOCK_A auf Generator-Format umgestellt, Fixture SOP_BLOCK_A_LEGACY fuer Backward-Compat. Test-Assertion nachgezogen. Live-Re-Smoke PASS: Section 01 zeigt 7 Steps mit vollem Inhalt, ZIP-Size +390 bytes (4524 -> 4914).

### ISSUE-025 — Signed-URL via Public-Endpoint erfordert apikey-Query-Param
- Status: wontfix
- Resolution Date: 2026-04-27
- Severity: Medium
- Area: Self-hosted-Supabase / Coolify-Routing
- Summary: Signed-URLs aus `adminClient.storage.from(bucket).createSignedUrl(path, ttl)` zeigen auf den internen Kong-Endpoint (`http://supabase-kong:8000/...`). Wenn die URL ohne Anpassung ans Frontend geht und gegen `https://onboarding.strategaizetransition.com/supabase/...` aufgerufen wird, schlaegt der Download mit HTTP 401 `{"message":"No API key found in request"}` fehl.
- Impact: Wuerde alle zukuenftigen Storage-Downloads ueber Self-hosted-Supabase betreffen, falls signed-URLs verwendet wuerden.
- Resolution (wontfix, Pattern-Switch): SLC-040 hat das Problem strukturell vermieden, indem die Handbuch-Download-Route als Next.js-API-Proxy `/api/handbook/[snapshotId]/download` implementiert wurde — siehe IMP-166-Pattern. Die Route prueft Auth via cookie-basiertem SSR-Client + ruft `rpc_get_handbook_snapshot_path` (mit RLS-/Cross-Tenant-Check) + laedt das Blob via `adminClient.storage.from('handbook').download()` (BYPASSRLS) + streamt mit Content-Disposition zurueck. Damit existiert kein signed-URL-Hop, kein apikey-Workaround, kein Host-Replace. Die existierende Evidence-Download-Route (`src/app/api/capture/[sessionId]/evidence/[fileId]/download/route.ts`) nutzt noch das alte signed-URL-Pattern und sollte bei Gelegenheit auf das gleiche Proxy-Pattern migriert werden — aktuell nicht akut, weil Evidence-Use-Case dort funktional ist.

### ISSUE-026 — postcss 8.4.31 als Next.js bundled dep, npm-Override-immun
- Status: open
- Severity: Low
- Area: Dependencies / Security
- Summary: `npm audit --omit=dev` meldet 3 moderate Vulnerabilities ueber `postcss <8.5.10` (XSS via Unescaped `</style>`-Sequenzen im Stringify-Output). Vulnerable postcss@8.4.31 wird als `bundled dependency` von Next.js 16.2.4 mitgeliefert (im publish-Tarball, nicht resolveable im npm-Tree). Direkte `postcss`-devDep ist auf `^8.5.10` gehoben (eigene Tailwind-Pipeline OK), aber Next-bundled bleibt vulnerabel.
- Impact: Build-Time-only. XSS-Vector erfordert User-Input in CSS-Stringify-Output, was im Onboarding-Code nicht passiert (postcss laeuft nur ueber Tailwind/Build). Kein Runtime-Risk fuer Production.
- Workaround: nested-Override (`"overrides": {"next": {"postcss": "^8.5.10"}}`) wurde getestet — npm registriert den Override, Next.js bundled dep bleibt aber 8.4.31. Auch nach Löschen von `node_modules/next/node_modules/postcss` + `npm install` wird die bundled Version wiederhergestellt.
- Next Action: Auflösung wartet auf Next.js Minor-Bump mit postcss>=8.5.10 im Tarball. Bei naechstem Maintenance-Sprint pruefen (`npm outdated next` + Changelog auf postcss-Update).

### ISSUE-027 — ENV-Vars-Drift im docker-compose.yml: V3 SMTP/Jitsi/Recording fehlen im app-Service-Block
- Status: resolved
- Resolution Date: 2026-04-27
- Severity: Medium
- Area: CI/CD / Deployment-Readiness
- Summary: Der App-Container-Code referenziert zur Runtime SMTP_*, ERROR_ALERT_EMAIL, RECORDING_WEBHOOK_SECRET, JITSI_JWT_APP_ID, JITSI_JWT_APP_SECRET, NEXT_PUBLIC_JITSI_DOMAIN. Die Vars waren im `docker-compose.yml` `app`-Service `environment:`-Block NICHT deklariert, wurden aber auf Coolify-Live via UI manuell gesetzt.
- Impact: Bei Disaster-Recovery oder neuer Server-Aufsetzung waeren V3-Features (Dialogue, Recording, Email) gebrochen, weil compose.yml nicht self-contained war.
- Resolution: docker-compose.yml `app`-Service `environment:` um 10 Vars erweitert: `${SMTP_HOST}`, `${SMTP_PORT:-587}`, `${SMTP_USER}`, `${SMTP_PASS}`, `${SMTP_FROM}`, `${ERROR_ALERT_EMAIL}`, `${JITSI_JWT_APP_ID}`, `${JITSI_JWT_APP_SECRET}`, `${JITSI_DOMAIN:-meet-onboarding.strategaizetransition.com}` als `NEXT_PUBLIC_JITSI_DOMAIN` (gleiche Source wie jitsi-web/jitsi-jibri PUBLIC_URL — vermeidet doppelte Definition), `${RECORDING_WEBHOOK_SECRET}`. Plus `.env.deploy.example` um `RECORDING_WEBHOOK_SECRET=GENERATE_ME_HEX_64` ergaenzt. Compose-Syntax via `docker compose config --quiet` validiert (exit 0). Pflicht nach Deploy: User-Coolify-Reload-Compose-File + Redeploy, danach App-Container hat alle Vars deklariert verfuegbar (statt nur via Coolify-UI).

### ISSUE-028 — V3 RECORDING_WEBHOOK_SECRET in Production-ENV nicht gesetzt
- Status: open
- Severity: Low
- Area: V3 Operational Readiness
- Summary: `docker exec app-... printenv RECORDING_WEBHOOK_SECRET` liefert leeren Wert. Der Endpoint `/api/dialogue/recording-ready` (V3 Jibri-Webhook-Auth) antwortet defense-in-depth mit HTTP 500 `Server misconfiguration` wenn das Secret fehlt — Recording-Pipeline ist damit in Production funktionsunfaehig.
- Impact: Jitsi-Jibri kann zwar aufzeichnen, aber kein Webhook-Callback an die App zustellen → Aufzeichnungen werden nicht in `dialogue_session.storage_path` registriert + kein Transkriptions-Job ausgeloest. **V4-Features (Bridge, Employee, Handbook) sind nicht betroffen.**
- Workaround: Aktuell keiner — Recording-Pipeline im Pilot-Betrieb noch nicht aktiv genutzt.
- Next Action: V3-Maintenance-Slice (V3.x): `RECORDING_WEBHOOK_SECRET=$(openssl rand -hex 32)` generieren, in Coolify-ENV + Jibri-finalize-Script setzen, Live-Smoke-Test mit echter Aufzeichnung. Nicht V4-Release-Blocker.

### ISSUE-029 — getReviewSummary filtert auf GF-Session, KUs liegen in Mitarbeiter-Session (V4.1 SLC-042 Bug)
- Status: resolved
- Resolution Date: 2026-04-28
- Severity: High
- Area: V4.1 / FEAT-029 / Berater-Review-Quality-Gate
- Summary: `src/lib/handbook/get-review-summary.ts` und `src/workers/handbook/block-review-filter.ts loadBlockReviewState` filterten `block_review` und `knowledge_unit` zusaetzlich auf `capture_session_id`. Aufrufer (`/dashboard/page.tsx` Cockpit-Card, `/admin/handbook/page.tsx` TriggerHandbookButton, Worker `handle-snapshot-job.ts`) uebergaben die GF-Session, aber block_review-Rows und employee_questionnaire-KUs haben die Mitarbeiter-Session-ID. Resultat: Frontend-Helper lieferte immer `{0,0,0,0}` (Cockpit-Card "—", Dialog erschien nie); Worker schrieb `handbook_snapshot.metadata = {pending:0, approved:0, rejected:0}` statt der echten Counter (AC-14 von SLC-041 strukturell-falsch).
- Impact: AC-7, AC-8, AC-10 von SLC-042 + AC-14 von SLC-041 funktional gebrochen. Quality-Gate-Workflow (DEC-045) war umgehbar; Snapshot-metadata-Counter fuer SLC-044 Reader waeren falsch gewesen. /dashboard/reviews war NICHT betroffen. Audit-Log (error_log via captureInfo) war direkt aus reviewSummary-Prop gespeist und korrekt. Plus Sekundaer-Bug: Dialog-Wording zeigte nur `approved` als "reviewed" statt `approved+rejected` — inkonsistent zur Cockpit-Card.
- Workaround: Keiner — direkter Fix.
- Resolution: 3-Stufen-Fix verteilt auf 2 Commits. `abae023` (Phase 1): `get-review-summary.ts` `captureSessionId` optional + Aufrufer in `/dashboard/page.tsx` + `/admin/handbook/page.tsx` ohne Session-ID. `8ebd65c` (Phase 2): `block-review-filter.ts` `loadBlockReviewState` `captureSessionId` optional + Worker `handle-snapshot-job.ts` ohne Session-ID + Dialog-Wording in `TriggerHandbookButton.tsx` `approved+rejected` statt nur `approved`. 360/360 Tests gruen (358 + 2 neue Filter-Tests). Browser-Smoke 2026-04-28 ueber 4 Iterationen verifiziert: Cockpit-Card "2 / 3" + Dialog "2 von 3 Mitarbeiter-Bloecken sind reviewed". Worker-metadata-Pfad ist strukturell verifiziert ueber Tests + naechster realer Trigger schreibt korrekte Counter (live verifiziert beim ersten produktiven Snapshot in /qa SLC-044 oder spaeter).

### ISSUE-030 — Live-Site liefert 504 Gateway Timeout extern (V4.1 Stable Live-Bruch)
- Status: resolved
- Resolution Date: 2026-04-30
- Severity: High
- Area: Infrastruktur / Coolify-Proxy / V4.1 Live
- Summary: https://onboarding.strategaizetransition.com/login (und alle anderen externen Routen) liefern persistent HTTP 504 Gateway Timeout (3/3 Versuche je 30s ab 2026-04-30 09:56 UTC). Intern ist die App vollstaendig gesund: `app-*` Container `health=healthy`, `restarts=0`, `next dev ready`, `coolify-proxy wget http://app:3000/login` liefert sauberes HTML, `/api/health` antwortet `{"status":"ok"}`. Bruch liegt zwischen Internet/Traefik und Container.
- Impact: Live-Frontend nicht nutzbar von extern. Browser-Smoke-Test fuer SLC-047 MT-7 (SC-V4.2-9) blockiert. V4.1-Post-Launch-STABLE-Status (RPT-117 vom Vortag, ~18h gesund) wurde gebrochen. Kein Datenverlust, kein Container-Crash.
- Workaround: Keiner extern. Intern via `docker exec coolify-proxy wget http://app-...:3000/...` testbar.
- Resolution: Stale Traefik-Routing-Cache im Coolify-Proxy. Issue isoliert auf Onboarding-App (Jitsi am selben Proxy lieferte HTTP 200 in 73ms). Diagnose: Traefik-Labels am App-Container vollstaendig (Host-Rule, entryPoints, TLS, certresolver), gemeinsames Network mit coolify-proxy vorhanden (`bwkg80w04wgccos48gcws8cs`). Fix: `docker restart coolify-proxy` 2026-04-30 ~10:08 UTC, ~5-10s Downtime auf alle Domains am Host (159.69.207.29). Verifikation: 4/4 Versuche HTTP 200 in 127-160ms direkt nach Restart. Pattern fuer zukuenftige Coolify-Proxy-Routing-Stales dokumentiert. Wiederholt sich bei jedem App-Container-Restart (Coolify-Bug, nicht Onboarding-spezifisch).

### ISSUE-031 — tenants RLS hat keine UPDATE-Policy fuer tenant_admin (SLC-046 Server-Actions silent broken)
- Status: resolved
- Resolution Date: 2026-04-30
- Severity: High
- Area: V4.2 / SLC-046 / RLS / Server-Actions
- Summary: Die tenants-Tabelle hat in der Live-DB nur eine SELECT-RLS-Policy fuer tenant_admin (`tenant_select_own_tenant: polcmd='r', using=id=auth.user_tenant_id()`). Es gibt KEINE UPDATE-Policy. Alle 4 SLC-046 Server-Actions (setWizardStarted, setWizardStep, setWizardSkipped, setWizardCompleted) nutzten den RLS-aware createClient(). UPDATE durch tenant_admin betraf 0 Rows silent (RLS-blockiert), `.select("id")` returnte leeres data-Array. setWizardStarted: `alreadyStarted = !data || data.length === 0` returnte `true` → Wizard.tsx useEffect-Hook rief `setOpen(false)` → Modal flackerte kurz auf, schloss sich sofort.
- Impact: SLC-047 MT-7 Browser-Smoke fehlgeschlagen — Wizard war fuer Endnutzer nicht nutzbar. Die DB blieb in `state='pending'` (UPDATE betraf keine Rows). SLC-046 /qa hatte das nicht gefangen, weil die Tests gegen Live-DB mit Service-Role-User laufen, der RLS umgeht.
- Workaround: Keiner — direkter Fix.
- Resolution: Alle 4 Server-Actions in `src/app/dashboard/wizard-actions.ts` nutzen jetzt `createAdminClient()` (Service-Role) fuer UPDATE. Auth-Check (Cross-Role tenant_admin-only) bleibt mit normalem RLS-aware Client in `requireTenantAdmin()` davorgeschaltet. Service-Role-Bypass ist nur fuer den UPDATE-Pfad. Fix in commit d1978ca. Browser-Smoke nach Redeploy User-bestaetigt PASS.
- Followup: Pattern in Architektur-Doku als Standard fuer State-Maschinen-UPDATEs durch tenant_admin dokumentieren. Alternative waere RLS-UPDATE-Policy auf wizard-state-Spalten — ist eine ADR-Entscheidung fuer V4.3.
