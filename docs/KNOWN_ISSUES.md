# Known Issues

### ISSUE-072 — V6 External-HTTPS-Routing zur App-Resource haengt (TLS klappt, Backend-Routing 504/Connection-Hang) — Multi-Network-Falle
- Status: open (SLC-110 MT-1 Code-Side Fix gepushed 2026-05-15 commit `2d5b488` — Live-Wirksamkeit pending MT-5 Coolify-Reload-Compose+Redeploy + MT-6 /post-launch Light-Smoke)
- Severity: High (war Blocker, durch User-Coolify-Redeploy auf Workaround-Status gesenkt — latent bleibt die Falle bis Compose-Reload)
- Area: V6 / Coolify-Traefik / Reverse-Proxy / Multi-Network
- Summary: 2026-05-15 ~06:30 UTC im /post-launch V6 entdeckt: Externer Aufruf `https://onboarding.strategaizetransition.com/login` antwortet HTTP 000 (Connection-Hang nach erfolgreichem TLS-Handshake) bzw. HTTP 504 nach 30s Browser-Timeout. TLS-Handshake klappt vollstaendig (RSASSA-PSS, ALPN h2 angenommen, 40-80ms). Vergleichs-Domain `meet-onboarding.strategaizetransition.com` (Jitsi auf gleichem Server) antwortet HTTP 200 in 37ms — Coolify-Proxy als solcher funktioniert. Diagnose: App-Container (`app-bwkg80w04wgccos48gcws8cs-145850957466`) ist auf 2 Networks (`bwkg80w04wgccos48gcws8cs` IP=10.0.3.18 + `bwkg80w04wgccos48gcws8cs_strategaize-net` IP=10.0.4.17). Coolify-Proxy ist nur auf `bwkg80w04wgccos48gcws8cs` + `coolify`. App-Labels enthalten KEIN `traefik.docker.network=bwkg80w04wgccos48gcws8cs`-Label und KEIN explicit `traefik.http.services.X.loadbalancer.server.port=3000`. → Traefik waehlt das falsche Interface (`10.0.4.17` strategaize-net, das er nicht erreichen kann) → Backend-Connect haengt → 504/Hang. **Verifiziert via direkter IP-Test vom coolify-proxy: `wget http://10.0.3.18:3000/login` → HTTP 200, `wget http://10.0.4.17:3000/login` → Hang.** Pattern aus memory `feedback_coolify_multi_network_traefik.md` + rule `jitsi-jibri-deployment.md` Punkt 3. Onset-Window: zwischen RPT-256 V6-Deploy 2026-05-14 ~14:58 UTC (88ms TTFB OK) und 2026-05-15 ~06:30 UTC (Hang). Container restart timestamps: app=15:00:25 / coolify-proxy=15:01:02 (V6-Redeploy). Coolify-Sentinel restart 23:30 UTC am 14.05. — moeglicher Trigger fuer Network-Reload mit geaenderter Reihenfolge.
- Impact: **V6-App vollstaendig extern unerreichbar.** Keine User koennen einloggen, kein Mandant kann Diagnose-Modal nutzen, keine Cross-System-Lead-Push moeglich (User-seitig). Internal-Test-Mode-Outage ~7-15h. Container intern ALLE healthy + 0 V6-induced Errors in DB-error_log + 0 ai_jobs lead_push_retry created → Code-Side ist NICHT die Ursache. Pure Coolify/Traefik-Konfigurations-Falle.
- Workaround: 1) **Sofort-Workaround (User in Coolify-UI)**: App-Resource → "Restart" oder "Redeploy" — Coolify-Proxy laed Network-Mappings neu, oft greift dann zufaellig die richtige IP. 2) Alternativ `docker network connect bwkg80w04wgccos48gcws8cs_strategaize-net coolify-proxy` von SSH — Coolify-Proxy bekommt zweites Interface, beide IPs erreichbar. Nicht persistent ueber Coolify-Restarts. **2026-05-15 ~07:05 UTC: User-Redeploy in Coolify-UI durchgefuehrt — extern HTTP 200 wiederhergestellt, TTFB ~115ms (vergleichbar zu RPT-256 Baseline 88ms / REL-014 Baseline 143ms). App-Container neu auf Image-Tag `42f999ef30a209a0823d62fd3fd46cd8ae1722ba` (commit 42f999e, funktional identisch zu 1c1a4b7 — enthaelt nur RPT-257 + Doku-Updates). Container-IDs nach Redeploy: app=064719446687, worker=064719458953. Multi-Network-Setup unveraendert: App auf 2 Networks (10.0.3.17 bwkg-net + 10.0.4.16 strategaize-net), `traefik.docker.network`-Label weiterhin nicht gesetzt — Falle ist latent.**
- Next Action: **Permanenter Fix in `docker-compose.yml`**: App-Service-Section um `traefik.docker.network=bwkg80w04wgccos48gcws8cs`-Label + `traefik.http.services.app-svc.loadbalancer.server.port=3000`-Label + Router-`.service=app-svc`-Wiring erweitern (Pattern aus `jitsi-jibri-deployment.md` Punkt 1+3). Pruefen ob `bwkg80w04wgccos48gcws8cs_strategaize-net` als App→DB-Network noetig ist oder ob App auch via Coolify-Project-Net auf supabase-kong zugreifen kann. Bei Vereinfachung: App nur auf 1 Network → Multi-Network-Falle entfaellt komplett. Schaetzung: 30-60 Min Compose-Edit + Coolify-Reload-Compose + Redeploy + extern-Smoke. PFLICHT vor erstem echten Live-Partner — momentan ist die Plattform offline.
- Related: RPT-257 /post-launch V6, memory `feedback_coolify_multi_network_traefik.md`, rule `jitsi-jibri-deployment.md` Punkt 3.

### ISSUE-053 — Worker-ENV-Validation deckt BUSINESS_SYSTEM_INTAKE_* nicht ab (silent-Fail-Risk bei Lead-Push-Retry)
- Status: resolved
- Resolved: 2026-05-14
- Severity: High
- Area: V6 / SLC-106 / Worker / ENV-Hardening
- Summary: `src/workers/condensation/run.ts:validateEnv()` prueft eine `REQUIRED_ENV`-Liste (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AWS_REGION, LLM_MODEL etc.) — aber `BUSINESS_SYSTEM_INTAKE_URL` und `BUSINESS_SYSTEM_INTAKE_API_KEY` fehlen in dieser Liste. SLC-106-Spec Section H Zeile 268 forderte explizit "ENV-Validierung beim Worker-Start: Warn-Log wenn ENVs fehlen". Aktueller Stand: Worker startet ohne diese ENVs silent durch, Handler-Slot-15 registriert sich, claim-loop pollt — erst beim ersten lead_push_retry-Job wirft der Adapter `BUSINESS_SYSTEM_INTAKE_URL or BUSINESS_SYSTEM_INTAKE_API_KEY not configured`-Error. handle-job.ts marked das Audit als failed + enqueued naechsten Retry → Retry-Loop bis attempt=3-Cap ohne menschliche Sichtbarkeit. F-V6-H2 aus RPT-253.
- Impact: Silent-Fail-Risiko bei Misconfiguration. In MT-11 nicht aufgetreten weil ENVs sauber gesetzt waren, aber bei Coolify-Resource-Recreation oder ENV-Drift unbemerkt bis User auf ai_jobs-failed-Liste schaut.
- Resolution: 2026-05-14 V6-Polish (commit pending). `src/workers/condensation/run.ts` um neue `RECOMMENDED_ENV`-Stufe erweitert mit `BUSINESS_SYSTEM_INTAKE_URL` + `BUSINESS_SYSTEM_INTAKE_API_KEY` (usedBy='lead_push_retry handler (SLC-106)'). `validateEnv()` loggt `[worker] Recommended ENV '<key>' is not set — <usedBy> will fail at job pickup.` als Warn-Log, beendet den Worker NICHT (nur REQUIRED_ENV ist Fatal). Misconfiguration ist jetzt im Worker-Log direkt nach Start sichtbar. Lint + tsc clean.

### ISSUE-052 — Stale TODO in createPartnerOrganization: partner_branding_config-Default-Row wird nicht angelegt
- Status: resolved
- Resolved: 2026-05-14
- Severity: High
- Area: V6 / SLC-102 / SLC-104 / Partner-Onboarding-Flow
- Summary: `src/app/admin/partners/actions.ts:166` enthaelt stale TODO `// TODO SLC-104 — INSERT partner_branding_config wenn Tabelle existiert (Default-Strategaize-Blau #2563eb, logo_url=NULL).` SLC-104 ist done, Tabelle existiert seit Migration 091. Aber das geplante Default-Insert beim createPartnerOrganization-Server-Action ist nie nachgezogen worden. Konsequenz live verifiziert in MT-12 (RPT-252): Test-Mandant unter neu angelegtem Partner sah "Empfohlen von Strategaize" statt "Empfohlen von MT12 KanzleiTest", weil partner_branding_config keine Row hatte und Resolver auf STRATEGAIZE_DEFAULT_BRANDING.displayName='Strategaize' zurueckfiel. F-V6-H1 aus RPT-253.
- Impact: Jeder neu angelegte Partner-Tenant zeigt seinen Mandanten bis zum ersten manuellen Branding-Speichern "Empfohlen von Strategaize" statt "Empfohlen von <Partner>". UX-Drift gegen Slice-Spec-Intent. Erster Live-Partner triggert das.
- Resolution: 2026-05-14 V6-Polish (commit pending). `createPartnerOrganization` in `src/app/admin/partners/actions.ts` um Phase-4 erweitert: `admin.from('partner_branding_config').upsert({ partner_tenant_id: tenantRow.id }, { onConflict: 'partner_tenant_id', ignoreDuplicates: true })` nach dem captureInfo-Audit-Log. primary_color faellt auf DB-Default `#4454b8` (MIG-091a Style-Guide-V2) zurueck, display_name=NULL — Resolver liest dann partner_organization.display_name als Fallback, Mandant sieht "Empfohlen von <Partner>". Best-effort-Pfad (Fehler werden via captureException geloggt, blocken aber den Partner-Tenant-Create nicht). Schliesst gleichzeitig den Workaround-Pfad fuer ISSUE-048 fuer alle neuen Partner. Lint + tsc clean.

### ISSUE-051 — profiles fehlen first_name/last_name fuer Lead-Push-Payload (V6.1 polish)
- Status: open
- Severity: Low
- Area: V6 / SLC-106 MT-5 / profiles-Schema / Lead-Payload-Qualitaet
- Summary: `public.profiles` hat in V6 nur Spalten `(id, tenant_id, email, role)`. Slice-Spec SLC-106 MT-5 verlangt aber `first_name` + `last_name` als Pflichtfelder im LeadIntakePayload an das Business-System. Implementation in `lead-push-actions.ts` faellt daher auf `auth.users.user_metadata` (Reihenfolge: first_name/last_name → given_name/family_name → full_name/name) und schliesslich auf den Email-Lokalteil als first_name zurueck. Wenn Mandant ohne user_metadata-Namen registriert ist, landet `first_name=<email-lokalteil>, last_name=""` als Lead-Name im Business-System.
- Impact: Funktional intakt (Lead-Push klappt, Business-System First-Touch-Lock greift via utm_source). Aber Lead-Reporting im Business-System sieht "max.mustermann" statt "Max Mustermann" als Name → weniger praktisch fuer CRM-Sicht. Kein Compliance/Security-Risiko.
- Workaround: Mandant kann beim Accept-Invitation-Flow first_name/last_name in user_metadata setzen lassen — passiert in V6 nicht automatisch.
- Next Action: V6.1-Polish. Schema-Migration `profiles.first_name text NULL` + `last_name text NULL`. Accept-Invitation-Flow (`src/app/accept-invitation/[token]/actions.ts`) erweitert die Profile-Anlage um die beiden Felder, lead-push-actions.ts liest `profileRow.first_name` direkt. Schaetzung ~3-4h fuer Migration + Action-Erweiterung + Test-Update + Backfill aus user_metadata. Schlecht-Case: Bestands-Mandanten muessen einmalig "Name vervollstaendigen" prompted bekommen (Banner im /dashboard nach Login).
- Related: SLC-106 MT-5 RPT-244 Problem P-2, FEAT-046 Lead-Intake-Vertrag.

### ISSUE-050 — Doppel-Footer auf Partner-Routes: hardcoded "Powered by Strategaize" in partner-shell.tsx zusaetzlich zum globalen StrategaizePoweredFooter
- Status: resolved
- Resolved: 2026-05-13
- Severity: Low
- Area: V6 / SLC-104 MT-13 / DEC-108 / UI-Konsistenz
- Summary: `src/app/partner/partner-shell.tsx` rendert eine hardcoded `<footer>...Powered by Strategaize...</footer>` als Stub-Variante (markiert im Komment "minimaler Stub fuer SLC-104, Server-Component-Variante mit i18n-Lookup wird dort eingefuegt"). MT-4/5 von SLC-104 hat den globalen `StrategaizePoweredFooter` mit i18n-Lookup ins Root-Layout eingefuegt (`src/app/layout.tsx` Zeile 41), den partner-shell.tsx-Stub aber nicht entfernt. Folge: Auf Partner-Routes (`/partner/dashboard*`) erscheinen zwei Footer untereinander — englischer hardcoded Text "Powered by Strategaize" plus deutscher i18n-Text "Aufgesetzt mit Strategaize". Mandanten-Routes betreffen nicht.
- Impact: UX-only auf Partner-Routes — zwei aufeinanderfolgende Footer wirken redundant. Verstoesst gegen DEC-108-Code-Audit-Anforderung "Code-Audit verifiziert, dass keine andere Component 'Powered by Strategaize' rendert (kein Doppel-Footer, kein Default-Override-Risiko)". KEINE funktionale/sicherheitsrelevante Auswirkung — Pflicht-Footer ist ueberall mindestens einmal sichtbar (DEC-108-Hauptintent erfuellt).
- Workaround: Keiner noetig — kosmetisch.
- Resolution: Hardcoded `<footer>Powered by Strategaize</footer>` + Komment-Block + `flex min-h-full flex-col`-Wrapper aus `src/app/partner/partner-shell.tsx` entfernt. PartnerShell rendert jetzt nur noch Sidebar + scrollbaren `<main>` mit Children — der globale `StrategaizePoweredFooter` aus `src/app/layout.tsx` ist der einzige Footer auf Partner-Routes. tsc EXIT=0 volltree, eslint EXIT=0. Restliche "Powered by Strategaize"-Vorkommen verifiziert: nur `en.json` (i18n-Wert fuer globalen Footer) + `BrandingPreview.tsx` (Komment-Hint im Mandanten-Mockup, korrekt). DEC-108-Code-Audit-Anforderung wieder erfuellt.
- Related: SLC-104 MT-13 Browser-Smoke (RPT-240), DEC-108 Pflicht-Footer-Spec.

### ISSUE-049 — Branding-Resolver wird 2× pro Mandanten-Page-Load aufgerufen (Root-Layout + dashboard/page partner_client-Branch)
- Status: open (SLC-110 MT-3 Code-Side Fix gepushed 2026-05-15 commit `dae24ff` — React `cache()`-Wrap auf resolveBrandingForTenant aktiv, Dedupe-Vitest Case 8 PASS isoliert. **/qa SLC-110 RPT-261 Finding F-110-H1 entdeckt: Wirkung in Production = 0**, weil Layout (resolve-server.ts) und Page (dashboard/page.tsx) je eine eigene SupabaseClient-Instanz via `createClient()` instantiieren — React cache() vergleicht Args per `Object.is`, verschiedene supabase-Refs → Cache-MISS → RPC weiterhin 2x pro Request. Production-Verhalten unveraendert zur Pre-SLC-110-Baseline. **Quick-Fix Option A** (~2 LoC): `createClient()` in `src/lib/supabase/server.ts` mit `cache()` wrappen → Layout+Page teilen Instanz → Cache-Hit greift. Empfohlen vor MT-5.)
- Severity: Low (Original-Performance-Impact ~5-10ms ohne User-Effekt; F-110-H1 erhoeht das Implementation-Wahrheits-Defizit, nicht den User-Impact)
- Area: V6 / SLC-104 MT-9 / Performance / Branding-Resolver
- Summary: Pro `/dashboard`-Request bei Mandanten ruft `src/app/layout.tsx:21` `resolveBrandingForCurrentRequest()` (→ `resolveBrandingForTenant`) auf, und `src/app/dashboard/page.tsx:71-74` ruft `resolveBrandingForTenant` erneut mit derselben tenant_id auf. Ergebnis: 2 identische RPC-Calls + 2 `rpc_get_branding_for_tenant`-Auswertungen pro Page-Load.
- Impact: Performance-Overhead von ~5-10ms pro Request. Bei Skalierung (~10-100 Mandanten/Partner, ~3-10 Page-Loads/Tag/Mandant) tragbar, aber unnoetig. RPC + Postgres im selben Docker-Netzwerk, kein User-sichtbarer Verzoegerungs-Effekt.
- Workaround: Keiner noetig — Funktion ist korrekt, nur doppelt evaluiert.
- Next Action: React `cache()`-Wrapper um `resolveBrandingForTenant` in `src/lib/branding/resolve.ts`. Deduplikation auf Request-Scope, kein cross-Request-Cache (Branding-Aenderungen muessen beim naechsten Request sichtbar sein). Slice-Spec Section B nennt `cache()`-Pattern bereits als `ggf.` Optional — V6.1+-Backlog, nicht V6-Pflicht.
- Related: SLC-104 Slice Section B Caching-Note, RPT-236 Finding L-7.

### ISSUE-048 — Branding-Resolver-Default-DisplayName "Strategaize" leakt im RPC-Fehler-Edge-Case in den Mandanten-Welcome-Block
- Status: open (SLC-110 MT-2 Code-Side Fix gepushed 2026-05-15 commit `db04665` — Fallback-Predicate erweitert um STRATEGAIZE_DEFAULT_BRANDING.displayName-Vergleich + 5 neue Vitest PASS, Live-Wirksamkeit pending MT-5 Redeploy)
- Severity: Low
- Area: V6 / SLC-104 MT-9 / Branding-Resolver-Consumer
- Summary: `src/app/dashboard/page.tsx:81` `let partnerDisplayName: string | null = branding.displayName` prueft nicht, ob `branding.displayName` der Strategaize-Resolver-Default ("Strategaize") ist. Im RPC-Fehler-Edge-Case greift R-104-1 Try/Catch in `src/lib/branding/resolve.ts:69-71` und liefert `STRATEGAIZE_DEFAULT_BRANDING` mit `displayName: "Strategaize"` zurueck. Die `if (!partnerDisplayName ...)`-Fallback-Bedingung triggert nicht (truthy String), das Fallback auf `partner_organization.display_name` wird uebersprungen, und der Mandanten-Welcome-Block zeigt "Ihr Steuerberater: Strategaize" statt korrekter Fallback-Logik "Ihrem Steuerberater".
- Impact: Sehr selten triggered (RPC + Postgres im selben Docker-Netzwerk, nur bei Container-Crash oder DB-Outage). Mandant sieht im Fehlerfall "Strategaize" als angeblichen Steuerberater-Namen — verwirrend, aber nicht falsch im funktionalen Sinn (Plattform-Branding faellt durch, kein Datenverlust).
- Workaround: Keiner noetig — RPC-Failure-Rate in Production sehr niedrig (~0.01%).
- Next Action: In MT-12 Quality-Gates oder Gesamt-/qa SLC-104. Fix ist ~4 Zeilen in `dashboard/page.tsx`:
  ```typescript
  import { resolveBrandingForTenant, STRATEGAIZE_DEFAULT_BRANDING } from "@/lib/branding/resolve";
  // ...
  let partnerDisplayName: string | null =
    branding.displayName && branding.displayName !== STRATEGAIZE_DEFAULT_BRANDING.displayName
      ? branding.displayName
      : null;
  ```
  Plus 1 zusaetzlicher Vitest-Case fuer "Default-DisplayName wird ignoriert wenn Fallback aktiv".
- Related: Dev-System IMP-489 dokumentiert das systemische Consumer-Pattern, RPT-236 Finding L-6.

### ISSUE-047 — Logo-Upload Size-Limit-Inkonsistenz MAX_LOGO_BYTES=524288 (=512 KiB) vs UI-Text "500 KB"
- Status: resolved
- Severity: Low
- Area: V6 / SLC-104 MT-8 / File-Upload-Validation / Branding-UI
- Summary: `src/app/partner/dashboard/branding/actions.ts:32` deklariert `const MAX_LOGO_BYTES = 524288; // 500 KiB`. 524288 Byte ist jedoch `512 KiB` (2^19), NICHT 500 KiB. UI-Text in `BrandingEditor.tsx` Error-Banner und Slice-Spec sagen "Maximal 500 KB". Browser-Smoke (RPT-234) hat empirisch bestaetigt: 510 KiB-Datei (522240 Byte) wird vom Server akzeptiert (`?updated=1`), 600 KiB-Datei (614400 Byte) wird vom client-side BrandingEditor.tsx-Validation geblockt.
- Impact: 12 KiB-Toleranzfenster zwischen dokumentiertem Limit und tatsaechlicher Schwelle. User koennen Files bis ~512 KiB hochladen obwohl UI 500 KB verspricht. Kein Production-Risk (Storage-Bucket-Limit aus Migration 091 ist parallel auf 524288 Byte konfiguriert — Storage-Layer waere konsistent zur Constant, nur die UI-Message ist falsch).
- Workaround: Keiner noetig — Funktion ist intakt, nur die kommunizierte Grenze ist 12 KiB ungenauer als versprochen.
- Resolution: 2026-05-13, SLC-104 MT-12 commit `eaf346a`, Option B (Constant-Pflicht-Truth) angewandt. `actions.ts` + `BrandingEditor.tsx` MAX_LOGO_BYTES auf `500 * 1024 = 512000 Byte`. Migration `091b_align_partner_branding_assets_size_limit_to_500kib.sql` setzt `storage.buckets.file_size_limit` ebenfalls auf 512000 (live applied auf Hetzner, verifiziert). Server-, Client- und Bucket-Layer sind jetzt alle drei konsistent bei exakt 500 KiB. Full-Regression 963 PASS unveraendert.
- Related: Dev-System IMP-486 dokumentiert das systemische Pre-Implement-Check-Pattern.

### ISSUE-046 — Embed-Route gibt 500 statt 400 bei invalidem UUID-Format
- Status: resolved
- Severity: Medium
- Area: API / Validation / V5.1 Walkthrough-Embed
- Summary: `src/app/api/walkthrough/[sessionId]/embed/route.ts` validiert die `sessionId` nicht gegen UUID-Pattern vor dem RPC-Call. Bei `GET /api/walkthrough/not-a-uuid/embed` failed die RPC `rpc_get_walkthrough_video_path($1::uuid)` mit Postgres-Cast-Exception, der Catch-Block triggert `captureException` + HTTP 500 INTERNAL_ERROR statt 400 BAD_REQUEST.
- Impact: Minimal in Production — Browser sendet ausschliesslich UUIDs aus dem Snapshot-Markdown, die Worker-emittiert sind. Bei direkter URL-Manipulation oder Scraper-Hits entstehen 500er-Spam-Eintraege in `error_log` statt klar identifizierbarer 400er. Kein Security-Bypass, kein Funktions-Impact.
- Workaround: Keiner noetig.
- Resolution: Inline-Hotfix 2026-05-11 vor REL-014. UUID_RE-Konstante + `!UUID_RE.test(sessionId)` Pre-Validate-Guard in [src/app/api/walkthrough/[sessionId]/embed/route.ts](../src/app/api/walkthrough/[sessionId]/embed/route.ts) (Pattern-Reuse aus `src/app/admin/handbook/actions.ts:39`). Catch-Block bleibt unveraendert fuer echte RPC-Fehler. Neuer Vitest-Case "400 wenn sessionId kein valides UUID-Format hat (ISSUE-046)" in [src/app/api/walkthrough/[sessionId]/embed/__tests__/route.test.ts](../src/app/api/walkthrough/[sessionId]/embed/__tests__/route.test.ts) verifiziert: 400 BAD_REQUEST + getUser+rpc gar nicht erst aufgerufen. 13/13 Vitest PASS in 19ms. Live-Smoke gegen Onboarding-Server nach Coolify-Redeploy.

### ISSUE-040 — fast-xml-builder high-Vulnerability (npm-Audit-Drift seit 2026-05-08, NICHT V5.1-induziert)
- Status: open
- Severity: Low
- Area: Dependencies / Security
- Summary: `npm audit --omit=dev` meldet ab 2026-05-08 (Re-Audit in /qa SLC-091) eine zusaetzliche **high** Vulnerability `fast-xml-builder <=1.1.6` mit 2 Advisories: GHSA-5wm8-gmm8-39j9 (attribute values mit unwanted quotes umgehen Filter) + GHSA-45c6-75p6-83cc (Comment Value regex bypass). Fast-xml-builder ist eine indirekte Dependency, nicht direkt im package.json gelistet. Vor 2026-05-08 zeigte `npm audit` 4 Vulns (1 low icu-minify + 3 moderate next-intl/postcss); jetzt 5 Vulns (4 vorherige + 1 high fast-xml-builder).
- Impact: Build-Time-only. fast-xml-builder ist Build-Time-Tool fuer XML-Generation (vermutlich Sitemap/RSS oder vergleichbar). Kein Runtime-XSS-Vector im Onboarding-Code, weil keine User-Input-XML-Stringify-Pfade existieren. Kein Production-Risk.
- Workaround: Upstream-Bump abwarten oder via npm-Override `"overrides": {"fast-xml-builder": ">=1.1.7"}` forcen — letzteres ggf. mit Compat-Test pruefen.
- Next Action: Bei naechstem Maintenance-Sprint (`npm outdated` + `npm audit fix --force` testen). KEIN /qa-SLC-091-Blocker — pre-existing seit 2026-05-08, nicht durch V5.1-Code induziert (verifiziert via `git diff package.json package-lock.json` zeigt keine V5.1-Aenderung).

### ISSUE-039 — Status-Page 404 nach Upload — failure_reason Spaltennamen-Mismatch (SLC-071-Pre-Existing)
- Status: resolved
- Severity: High
- Area: V5 Option 2 / SLC-071 Status-Polling-Page / Schema-Mismatch
- Summary: Nach erfolgreicher Aufnahme + Upload landeten Mitarbeiter auf `/employee/walkthroughs/<id>` mit HTTP 404. Pre-existierender SLC-071-MT-7-Bug, nicht durch SLC-075 eingefuehrt: `WalkthroughStatusPage` und `/api/walkthroughs/[id]/status` selektieren `failure_reason`, die Tabelle (Migration 083) hat aber `rejection_reason`. PostgREST gibt einen Spalten-Fehler zurueck → `error || !row` triggered `notFound()`. Der Bug wurde nie entdeckt, weil keiner die Status-Page ueber den Upload-Pfad erreichen konnte (Q-V5-F-Block + die SLC-075 Hairpin/Kong/MIME-Bugs blockten alles).
- Impact: AC-12-Status-Anzeige nach Upload broken — User sieht 404 obwohl walkthrough_session erfolgreich uploaded ist (Live-DB-Test bestaetigt: `33ea58be-81b0-4f1e-9860-9ab57a40a5d1` status='uploaded' duration_sec=13 file_size=2974051).
- Resolution: Hotfix 2026-05-07 in `/doctor SLC-075` Round 4 (RPT-178). Drei Files mit `failure_reason` -> `rejection_reason` umbenannt: `src/app/employee/walkthroughs/[id]/page.tsx` (Server-Component-SELECT + initial-Prop-Mapping), `src/app/api/walkthroughs/[id]/status/route.ts` (Polling-Endpoint), `src/components/capture-modes/walkthrough/WalkthroughStatusPolling.tsx` (Interface + UI-Render). 0 Test-Aenderungen — pure-logic-Tests in walkthrough-capture-logic.ts unbetroffen.

### ISSUE-038 — Walkthrough-Upload HTTP 415 invalid_mime_type (codec-Suffix vs Bucket-Filter)
- Status: resolved
- Severity: High
- Area: V5 Option 2 / SLC-075 / Storage-Bucket / WalkthroughCapture Content-Type
- Summary: Nach Hotfix von ISSUE-036 Round 1+2 (Hairpin-NAT + apikey) deckte User-Smoke Round 3 den naechsten Bug auf: PUT scheitert mit `HTTP 400 {"statusCode":"415","error":"invalid_mime_type","message":"mime type video/webm;codecs=vp9,opus is not supported"}`. Bucket `walkthroughs` ist mit `allowed_mime_types = ARRAY['video/webm']` angelegt (MIG-031/084) — exact-match. MediaRecorder sendet aber `video/webm;codecs=vp9,opus` (preferred) bzw. `video/webm;codecs=vp8,opus` (fallback) als Content-Type-Header → Bucket-Filter rejected.
- Impact: AC-12 weiter blockiert.
- Resolution: Hotfix 2026-05-06 in `/doctor SLC-075` Round 3 (RPT-177). Client-side strippen den Codec-Suffix beim PUT-Header in `src/components/capture-modes/walkthrough/WalkthroughCapture.tsx` `putBlob()`: `mimeType.split(";")[0].trim()` → `video/webm`. Blob behaelt den vollen MIME-Type fuer client-side State, nur der HTTP-Header wird gestripped — RFC 7231 erlaubt das. Bucket-Filter bleibt strict (Security-by-Design statt Codec-Whitelist-Pflege). 0 zusaetzliche Vitest-Cases (logic ist im React-Component, pure-logic-Test in walkthrough-capture-logic.ts unbetroffen).

### ISSUE-037 — Walkthrough-Sidebar-Eintrag fehlt (SLC-075-Implementation-Luecke)
- Status: resolved
- Severity: Low
- Area: V5 Option 2 / SLC-075 / EmployeeSidebar UX
- Summary: SLC-075 hat die Routen `/employee/walkthroughs[/...]` neu angelegt + Self-Spawn-Action implementiert, aber `src/components/employee-sidebar.tsx` nicht erweitert. Mitarbeiter sahen ueber das normale Login (`/employee`) keinen Sidebar-Eintrag fuer Walkthroughs — die neue Route war nur via direktes URL-Eintippen erreichbar. User-Smoke 2026-05-06 hat die Luecke aufgedeckt (Screenshot: nur "Aufgaben"-Eintrag im Sidebar).
- Impact: Mitarbeiter konnten den Walkthrough-Capture-Pfad praktisch nicht entdecken — Pflicht-Gate AC-10 nur formal erfuellbar.
- Resolution: Hotfix 2026-05-06 in `/doctor SLC-075` (RPT-175). Sidebar-Link "Walkthroughs" mit `Video`-Icon ergaenzt, Active-State-Highlighting fuer alle `/employee/walkthroughs/*`-Pfade. Zwei Commits zusammen mit ISSUE-036.

### ISSUE-036 — Walkthrough-Upload schlaegt fehl (Hairpin-NAT signedUrl + Kong apikey-Pflicht)
- Status: resolved
- Severity: High
- Area: V5 Option 2 / SLC-075 / Self-Hosted-Supabase / Storage Signed-URL
- Summary: Zwei verkettete Bugs auf Self-Hosted-Coolify-Supabase. Round 1: `requestWalkthroughUpload` returnt `signedUrl` von `createSignedUploadUrl`. `createAdminClient` ist mit `SUPABASE_URL=http://supabase-kong:8000` (intern) initialisiert, supabase-js baut signedUrl gegen den Docker-Hostname → Browser kann `supabase-kong` nicht aufloesen → `xhr.onerror` "Netzwerkfehler waehrend Upload". Round 2: Nach Host-Rewrite auf die public Coolify-URL traf der PUT auf Kong, das den `apikey`-Header/Query verlangt — sonst HTTP 401 `{"message":"No API key found in request"}` (verwandt mit ISSUE-025). User-Smoke 2026-05-06 (zwei Iterationen) deckte beide auf.
- Impact: AC-12 (Upload + Status `uploaded`) komplett gebrochen. Capture-Pipeline-Eintritt blockiert.
- Resolution: Hotfix 2026-05-06 in `/doctor SLC-075` (RPT-175 Round 1, RPT-176 Round 2). Helper `rewriteSignedUrlForBrowser` in `src/app/actions/walkthrough.ts` macht zwei Dinge: (a) Host-Praefix von `process.env.SUPABASE_URL` auf `process.env.NEXT_PUBLIC_SUPABASE_URL` umschreiben (nur wenn intern!=extern); (b) `apikey=<NEXT_PUBLIC_SUPABASE_ANON_KEY>` als Query-Param appenden falls noch nicht vorhanden. Effekt fuer Coolify: `http://supabase-kong:8000/storage/v1/object/upload/sign/...?token=...` → `https://onboarding.strategaizetransition.com/supabase/storage/v1/object/upload/sign/...?token=...&apikey=<anon>`. Anon-Key ist eh public im Browser-Bundle, Auth wird via Signed-URL-Token + Storage-RLS durchgesetzt. 4 Vitest-Cases (Coolify-Pfad mit Rewrite+apikey, Cloud-Pfad mit apikey-only, Idempotenz wenn apikey schon drin, plus die ursprungliche "kein-anon-key" Regression).

### ISSUE-035 — reminder_log Stage1-Mehrfach-Send ueber Tage (V4.2-Carry-Over)
- Status: resolved
- Severity: Medium
- Area: V4.2 / SLC-048 / capture-reminders Cron-Logik
- Summary: Beim /post-launch V4.3+V4.4 (RPT-162, 2026-05-05) wurde im `reminder_log` festgestellt, dass an `richard@bellaerts.de` an 4 aufeinanderfolgenden Tagen (01-04.05.) jeweils Stage1-Reminder gesendet wurden, plus heute (05.05.) ein Stage2. V4.2-Spec sagt "Stufe 1 nach 3 Werktagen, Stufe 2 nach 7 Werktagen, Idempotenz". UNIQUE-Constraint auf `(employee_user_id, reminder_stage, sent_date)` verhindert nur Mehrfach-Send pro Tag, nicht aber Mehrfach-Send-Stage1 ueber Tage.
- Impact: Spam-Reputation-Risiko bei Echt-Kunden (4× tgl. Reminder = anwender-feindlich). Im Pilot/Internal-Test-Mode bislang ohne sichtbaren Schaden, aber Pre-Production-Blocker fuer den Pre-Production-Compliance-Gate. NICHT V4.3- oder V4.4-induziert — Cron-Code unveraendert seit V4.2 SLC-048.
- Resolution: BL-076 Hotfix 2026-05-08. Root-Cause: `pickStage` retourniert `"stage1"` fuer **jeden** Workday in [3, 7) — bei taeglichem Cron-Lauf wird Stage1 also an Tag 3, 4, 5, 6 erneut ausgeloest, und die UNIQUE-Constraint `(user, stage, sent_date)` blockiert nur Same-Day-Dupes. Fix in [src/lib/reminders/process-reminders.ts](../src/lib/reminders/process-reminders.ts) + [src/app/api/cron/capture-reminders/route.ts](../src/app/api/cron/capture-reminders/route.ts): `loadCandidates` liefert pro Candidate `already_sent_stages: ReminderStage[]` aus `reminder_log WHERE status='sent'` (egal welches Datum). `processReminders` skipped die Stage wenn sie im Set ist (zaehlt als `skipped_already_sent`). Status `failed` blockiert nicht — Retry am naechsten Tag erlaubt. Test-Coverage: neuer Cross-Day-Idempotenz-Test in [route.test.ts](../src/app/api/cron/capture-reminders/__tests__/route.test.ts), 17/17 PASS. Pattern dient als Vorlage fuer SLC-074 Cleanup-Cron-Stale-Recovery.

### ISSUE-034 — wizard-actions.test.ts Mock-Drift aus V4.2 ISSUE-031 Fix (createAdminClient nicht gemockt)
- Status: resolved
- Severity: Medium
- Area: V4.2 Test-Coverage / Pre-V4.3-Drift in V4.3 Gesamt-/qa entdeckt
- Summary: `src/app/dashboard/__tests__/wizard-actions.test.ts:62-67` mockt nur `createClient` aus `@/lib/supabase/server`. V4.2-Commit `d1978ca` (ISSUE-031 fix) hat `wizard-actions.ts` aber auf `createAdminClient` aus `@/lib/supabase/admin` umgestellt fuer den UPDATE-Pfad. Mock greift nicht mehr → echter Service-Role-Client laeuft → Test FAIL mit `Error: supabaseUrl is required.`. 9/19 Tests in der Datei betroffen (die UPDATE-Pfade triggern).
- Impact: Test-Suite zeigte false-negatives in wizard-State-Maschine. Spec-Logik ist live korrekt (V4.2-Browser-Smoke 2026-04-30 user-bestaetigt PASS), aber Tests konnten kuenftige State-Maschinen-Regressionen nicht fangen. NICHT V4.3-Bug — V4.3-Code unbetroffen, V4.3-Release war nicht blockiert.
- Workaround: Live-Verifikation des Wizards bei jedem V4.x-Release als Browser-Smoke einplanen — bis Hotfix.
- Resolution: Hotfix 2026-05-05 in V4.3 Post-Release. Zusaetzlicher `vi.mock("@/lib/supabase/admin", ...)` mit `createAdminClient` als sync-Function, der den bestehenden `fromMock` wiederverwendet (der bereits `tenants` → updateMock und `profiles` → profileSelectMock anhand des Tabellennamens routet). Vitest-Run lokal **19/19 PASS** (vorher 9/19 FAIL durch Mock-Drift). Header-Doku im Test-File ergaenzt um Hintergrund. Aufwand 15min (unter 30-60min-Schaetzung).

### ISSUE-033 — Vermutete Turbopack-Layout-Inlining-Anomalie (V4.2 SLC-047, im Minimal-Case nicht reproduzierbar)
- Status: wontfix
- Severity: Low
- Area: V4.3 / SLC-056 / Next.js 16 Turbopack
- Summary: V4.2 SLC-047 (Wizard-Modal) zeigte ein Symptom, dass ein im `dashboard/layout.tsx` platzierter Wizard-Auto-Trigger sich nicht erwartet verhielt. Vermutung: Turbopack inlinet Layout-Code in Page-Bundle und Layout-State wird beim Page-Wechsel resettet. SLC-056-Spike (Branch `spike/v43-turbopack-layout-inlining`) hat einen Minimal-Reproducer gebaut (`src/app/spike-bl066/{layout,page}.tsx` mit useState-Counter), Build mit Next 16.2.4 + Turbopack zeigt: Layout und Page bekommen JEWEILS EIGENE Server-Chunks, kein Inline-Leak. Anomalie im Minimal-Case nicht reproduzierbar. Spike-Timebox: ~3:17 min (deutlich unter 4h).
- Impact: Gering. V4.2 SLC-047 hat den Workaround in Production etabliert (Wizard-Trigger im page.tsx statt layout.tsx, commit `6f774ec`). System funktioniert stabil.
- Workaround: Wizard-/Modal-/Auto-Trigger-Komponenten in V4.2 und neuer werden defensiv im page.tsx (Server-Component-Boundary klar) angesiedelt, nicht im layout.tsx. Pattern bleibt verbindlich bis ein neues Symptom auftritt mit klar reproduzierbaren Trigger-Bedingungen.
- Next Action: Keine. Falls Symptom in V5+ erneut auftritt, gezielter Spike mit den spezifischen Bedingungen aus dem neuen Bug-Report. Mögliche Such-Bereiche: Modal-Mount-Order, RSC-Boundaries, client-state-collocation in komplexen Layouts.

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

### ISSUE-032 — DKIM-Signatur fehlt fuer strategaizetransition.com (V4.2 SLC-048 Pre-Deploy-Pflicht)
- Status: resolved
- Resolution Date: 2026-05-01
- Severity: High
- Area: V4.2 / SLC-048 / SMTP / DSGVO-Mail-Reputation
- Summary: DNS-Audit der Sender-Domain `strategaizetransition.com` zeigte SPF ✓ und DMARC ✓, aber DKIM-Selektoren `s1._domainkey`, `s2._domainkey`, `default._domainkey` und 9 weitere Industry-Standard-Selektoren waren leer. Annahme war: DKIM nicht aktiv.
- Impact: Capture-Reminder-Mails (SLC-048) wuerden ohne DKIM-Alignment versendet, Spam-Folder-Risiko bei Gmail/Yahoo.
- Resolution: User-Hinweis auf IONOS-Doku zeigte: IONOS verwendet **provider-spezifische Selektor-Namen** `s1-ionos._domainkey`, `s2-ionos._domainkey`, `s42582890._domainkey` (NICHT die Industry-Standard `s1`/`s2`). Re-Check mit korrekten Selektoren am 2026-05-01 verifizierte: alle 3 IONOS-Selektoren sind als CNAMEs gesetzt + zeigen auf `s1.dkim.ionos.com`/`s2.dkim.ionos.com`/`s42582890.dkim.ionos.com`, Public-Key resolvt sauber als `v=DKIM1; p=MIIBIjAN...`. Domain-Nameserver `ui-dns.*` bestaetigen IONOS-Hosting → DKIM ist per IONOS-Default automatisch publiziert. Reminder-Cron darf direkt aktiviert werden, kein User-Action in IONOS noetig.
- Followup: SKILL_IMPROVEMENTS — DKIM-Verifikations-Pattern muss provider-spezifisch sein (siehe IMP-XXX neu erfasst).
