# Security Audit 2026-05-30 — Strategaize Onboarding-Plattform

## Zusammenfassung

- Blocker: 0
- High: 4
- Medium: 8
- Low: 7
- DSGVO-flagged: 4 (Subset)

Audit-Scope: src/**, sql/**, package.json. Tests und node_modules ausgenommen. Audit-Datum: 2026-05-30. Auditor: Claude Code.

Insgesamt zeigt das Repo eine ueberdurchschnittlich sorgfaeltige Security-Posture (V7 Self-Signup-Flow, Service-Key-timing-safe-Compare, Hash-only-Audit-Metadata, Pre-Auth-Routing-Guards, in-memory Rate-Limiter pro Endpoint, EU-only Bedrock + Local-Whisper, Storage-Buckets privat mit Server-Proxy-Pattern). Die Hauptfunde liegen in (a) einer Klasse von SECURITY-DEFINER-Funktionen aus aelteren V1/V3-Migrationen ohne `SET search_path` (Postgres Hijack-Vector via mutable search_path), (b) einem Cron-Secret-Compare via `!==` statt `crypto.timingSafeEqual` (Timing-Side-Channel), (c) einem Recording-Webhook der einen User-controlled file-path direkt an `readFile()` reicht (Path-Traversal — momentan extern unerreichbar wegen Middleware-Redirect, aber defense-in-depth Pflicht-Fix vor SLC-110+Network-Refactor), und (d) `image/svg+xml`-Upload + Server-Proxy ohne SVG-Sanitization (Stored-XSS bei direkter Navigation). Mehrere bereits dokumentierte Issues (ISSUE-007, ISSUE-026, ISSUE-040, ISSUE-051, ISSUE-073) liefern eine Filter-Liste und sind unten begruendet.

## Findings

### SEC-001 — SECURITY DEFINER Funktionen ohne SET search_path (search_path Hijack)
- Severity: High
- Klasse: Database / Privilege-Escalation
- File: sql/migrations/047_rpc_orchestrator_and_gaps.sql:22,106,150 (3 Funktionen); sql/migrations/054_rpc_evidence.sql:16,63,89,117 (4 Funktionen); sql/migrations/062_rpc_dialogue.sql:20,77,140,167,194 (5 Funktionen)
- DSGVO: ja (Cross-Tenant-Datenleak moeglich)
- Beschreibung: Insgesamt 12 SECURITY-DEFINER-Funktionen wurden ohne `SET search_path = ...` definiert. Beispiele: `rpc_orchestrator_finalize_run`, `rpc_create_evidence_chunks`, `rpc_confirm_evidence_mapping`, `rpc_reject_evidence_mapping`, `rpc_update_evidence_file_status`, `rpc_create_dialogue_session`, `rpc_attach_dialogue_recording`. Ein Angreifer mit CREATE-Privilegien in irgendeinem temporaeren oder pg_catalog-mutable Schema kann gleichnamige Helper-Tabellen/Funktionen einschleusen und so SECURITY-DEFINER-Code unter Service-Role-Privilegien ausfuehren. Die Restmigrationen (032/035/036/037/038/048/052/065/072/073/074/076/079/080) setzen den Pfad korrekt. Schwerwiegender weil 054 zusaetzlich keinen Tenant-Filter im Function-Body durchsetzt (s. function-Body Z.21-49 — `INSERT INTO evidence_chunk` mit User-supplied tenant_id).
- Vorschlag: Idempotente Patch-Migration `XXX_v8_search_path_hardening.sql`: `CREATE OR REPLACE` jede der 12 Funktionen mit identischem Body + zusaetzlichem `SET search_path = public, pg_catalog`. Optional alle SECURITY-DEFINER-Funktionen ueber `pg_proc` auflisten und CI-Check etablieren der `prosecdef=true AND proconfig IS NULL` als Fehler markiert.
- Aufwand: M

### SEC-002 — Cron-Secret-Compare nicht timing-safe (`!==` statt timingSafeEqual)
- Severity: High
- Klasse: Cron-Auth / Timing-Side-Channel
- File: src/app/api/cron/capture-reminders/route.ts:188; src/app/api/cron/pending-signup-cleanup/route.ts; src/app/api/cron/walkthrough-cleanup/route.ts:51; src/app/api/dialogue/recording-ready/route.ts:32
- DSGVO: nein
- Beschreibung: Vier Endpoints vergleichen den CRON_SECRET bzw. RECORDING_WEBHOOK_SECRET mit einem nativen JavaScript-`!==`-Operator. Im Codebase existiert bereits ein `crypto.timingSafeEqual`-Helper (src/lib/auth/service-key.ts) der korrekt eingesetzt wird fuer den Public-Signup-Service-Key. Die Cron-Endpoints und das Webhook nutzen ihn aber nicht. Bei Coolify-/Traefik-deployment mit niedriger Network-Jitter ist die Secret-Brute-Force ueber Timing-Differential praktisch nicht trivial, aber die Inkonsistenz ist gegen die eigene Pattern-Library und kostet 5 Min Fix.
- Vorschlag: `verifyCronSecret(header, env)` Helper aequivalent zu `verifyServiceKey` in src/lib/auth/cron-secret.ts implementieren (Buffer-Length-Check → return false; sonst `crypto.timingSafeEqual`). Alle vier Endpoints darauf umstellen. Test `service-key-timing.test.ts`-Pattern uebernehmen.
- Aufwand: S

### SEC-003 — Recording-Webhook: User-controlled file_path → readFile (Path-Traversal Defense-in-Depth)
- Severity: High
- Klasse: Path-Traversal / Webhook
- File: src/app/api/dialogue/recording-ready/route.ts:36-73
- DSGVO: ja (kann theoretisch /proc/self/environ mit allen Secrets ausleseln)
- Beschreibung: POST-Body enthaelt `file_path: string`. Der Endpoint reicht den String ohne Sanitization / Allowlist / Realpath-Check an `readFile(body.file_path)` weiter. Wer den `RECORDING_WEBHOOK_SECRET` kennt — Jibri-Side aktuell, plus theoretisch jeder mit Read-Zugriff auf Coolify-ENV — kann ANY-File des Containers ausleseln (`/proc/self/environ` enthaelt SUPABASE_SERVICE_ROLE_KEY + AWS_SECRET_ACCESS_KEY + SMTP_PASS + alle anderen ENVs). Aktueller Status: extern blockiert weil Middleware (src/lib/supabase/middleware.ts:47-66) `/api/dialogue/recording-ready` nicht whitelisted — alle unauthenticated Requests werden 307 nach /login redirected (auch von Jibri-Container, weil Jibri kein Session-Cookie hat). Damit ist der Webhook funktional broken (siehe ISSUE-028). Vor Re-Aktivierung muss path-traversal-mitigation drin sein, sonst wiederholt sich der Bug beim ersten Live-Recording.
- Vorschlag: (a) Allowed-Prefix-Check: `file_path` muss mit `/recordings/` oder `/jibri-output/` beginnen + kein `..`-Segment + kein Symlink (per `realpath`-Resolve und Pruefung dass aufgeloester Pfad weiterhin den Allowed-Prefix hat); (b) Alternativ: `file_path` durch `room_name`-Lookup ableiten (room_name → standardisierter Storage-Pfad innerhalb Jibri-Volume), kein direkter String aus Webhook-Body; (c) Whitelist `/api/dialogue/recording-ready` in middleware.ts ergaenzen damit Jibri den Endpoint extern erreichen kann — dann muss path-traversal-mitigation aber zwingend vorher in Place sein.
- Aufwand: M

### SEC-004 — Stored-XSS via partner-branding SVG-Upload + Server-Proxy
- Severity: High
- Klasse: XSS / Storage
- File: sql/migrations/091_v6_partner_branding_and_template_metadata.sql:289 (Bucket allowed_mime_types ['image/png', 'image/svg+xml', 'image/jpeg']); src/app/partner/dashboard/branding/actions.ts:38-127 (MIME-Validation nur via Browser-Content-Type-Header); src/app/api/partner-branding/[partner_tenant_id]/logo/route.ts:33-43 (Server-Proxy serviert mit `image/svg+xml` Content-Type)
- DSGVO: nein (direkter Schaden = XSS, keine PII-Exposure)
- Beschreibung: Der `partner-branding-assets`-Bucket erlaubt `image/svg+xml`. Die Server-Action `uploadLogo` validiert MIME ueber `file.type` (vom Browser kontrollierter Header, trivial faelschbar). Es gibt keine Magic-Byte-Sniff- oder SVG-Sanitization-Stufe (z.B. DOMPurify-Server-Variante oder strip `<script>`/`on*`-Attribute). Der Server-Proxy `/api/partner-branding/[partner_tenant_id]/logo` ist anonym (Pre-Auth, fuer Login-Page-Branding) und liefert die SVG mit `image/svg+xml`. Ein malicioser partner_admin kann eine SVG mit eingebettetem `<script>` oder `<svg onload="...">` hochladen. Bei Verwendung als `<img src="...">` rendert der Browser das SVG (kein Script-Exec). Aber bei direkter Navigation zum Logo-URL (z.B. ueber einen Phishing-Link, Inspector-Vorschau, "Bild in neuem Tab oeffnen") fuehrt jeder moderne Browser die Scripts aus. Da der Endpoint same-origin liegt (kein Subdomain-Isolation), faellt der Script in den Cookie-/Storage-Scope der gesamten OP-App → potenzielle Session-Hijack, Mandanten-Datenausleser, Token-Diebstahl. Cross-Tenant-Exposure weil Mandanten unter partner_admin's Subdomain das gleiche Logo sehen.
- Vorschlag: Drei Optionen, mindestens eine Pflicht: (a) SVG aus `allowed_mime_types` entfernen (Migration), nur PNG/JPG/WEBP erlauben. (b) Server-side SVG-Sanitization mit `@mattkrick/sanitize-svg` oder DOMPurify-jsdom (Adapter-Pattern, strippt script/onload/foreignObject/use). (c) `Content-Disposition: attachment` setzen statt inline-rendering im Browser — verhindert Script-Exec, breaking aber den `<img src>`-Use-Case nicht (Browser laedt das Bild trotzdem). Option (a) ist niedrigster Aufwand und niedrigstes Risiko fuer Partner-Logo-UX (PNG/JPG reichen real).
- Aufwand: S (Option a) / M (Option b)

### SEC-005 — ilike() mit ungeschuetztem User-Input (Wildcard-Bypass)
- Severity: Medium
- Klasse: Information-Disclosure / Authorization
- File: src/app/api/public/signup/route.ts:197 (`ilike("slug", body.partner_slug)`); src/app/api/public/partner/[slug]/route.ts:83 (`ilike("slug", slug)`); src/app/api/admin/tenants/[tenantId]/invite/route.ts:46 (`ilike("email", emailLower)`); src/app/partner/dashboard/mandanten/actions.ts:150 (`ilike("email", parsed.mandantEmail)`)
- DSGVO: nein (limited damage)
- Beschreibung: Vier Code-Pfade nutzen `.ilike()` mit unsanitiertem User-Input. PostgREST `.ilike()` interpretiert `%` und `_` als Wildcards. Im signup-flow validiert `signupBodySchema` nur Laenge (max 60) und nicht das Charset (`/^[a-z0-9-]+$/`). Ein Angreifer kann mit `partner_slug = "%"` matchen gegen jeden vorhandenen partner_organization-Row (gibt zwar nur den ersten zurueck via `.maybeSingle()` — was Cross-Tenant signup ermoeglicht: Token-Bound-Verify haengt am ersten Match). In der Invite-Route mit `emailLower` ist ein `_` als wildcard-character harmlos wenn das Profile-Schema enge Constraints hat, aber bei Race-Conditions koennte ein User-existence-oracle entstehen.
- Vorschlag: Entweder (a) `.eq()` + manuelles `toLowerCase()` statt `.ilike()` (Indexes auf `lower(slug)` und `lower(email)` sind bereits da), oder (b) Wildcard-Escaping per `body.partner_slug.replace(/[%_]/g, '\\$&')`. Option (a) ist robuster. Zusaetzlich Zod-Charset-Validation auf `partner_slug` (`/^[a-z0-9-]+$/`).
- Aufwand: S

### SEC-006 — Evidence-Upload MIME-Validation nur via Header (kein Magic-Byte-Sniff)
- Severity: Medium
- Klasse: File-Upload / Storage
- File: src/app/api/capture/[sessionId]/evidence/upload/route.ts:90-117; src/app/api/capture/[sessionId]/evidence/upload/validation.ts:11-17
- DSGVO: nein
- Beschreibung: `validateMimeType` checked nur `file.type` (Browser-controlled Content-Type Header). Ein authentifizierter Mitarbeiter kann eine `application/pdf`-deklarierte Datei hochladen, die in Wirklichkeit ein HTML-File mit JavaScript ist. Spaeter wird die Datei via Storage-Proxy ausgeleesen (admin handbook etc.). Der downstream `extractText`-Worker akzeptiert PDF/DOCX/TXT/CSV/ZIP und wuerde bei Fake-PDF crashen statt Inhalt zu extrahieren — kein direkter RCE. Aber im Combination mit zukuenftigen Storage-Proxy-Routes die die Datei mit Server-Header `application/pdf` ausleeseln, ohne Browser-Sniff zu blockieren (kein `Content-Disposition: attachment`), entsteht Stored-XSS-Risiko.
- Vorschlag: Magic-Byte-Sniff mit `file-type` package (npm) auf den ersten 4KB des Upload-Buffers. Pruefen dass `detectedMime === claimedMime`. Sonst HTTP 415 ablehnen. Plus `Content-Disposition: attachment` bei jeder zukuenftigen Evidence-Download-Route (existiert bereits in handbook-download — Pattern uebertragen).
- Aufwand: S

### SEC-007 — ai_jobs INSERT-Payload akzeptiert beliebige JSON ohne Schema-Check
- Severity: Medium
- Klasse: Worker-Authorization / Defense-in-Depth
- File: src/app/api/capture/[sessionId]/evidence/upload/route.ts:181-189; src/app/api/dialogue/recording-ready/route.ts:122-130; weitere Stellen in src/app/admin/handbook/actions.ts u.a.
- DSGVO: nein
- Beschreibung: Server-Code schreibt `ai_jobs.payload` als unstrukturierte JSONB. Worker (`src/workers/condensation/run.ts`) liest dieses Payload und reicht es an Bedrock-Pipelines weiter. Es gibt keine Job-Type-spezifische Payload-Validation auf DB-Ebene (CHECK-Constraint) oder auf Worker-Ebene (Zod-Parse). Wenn ein Angreifer via SQL-Injection oder ein Bug einer anderen Route eine ai_jobs-Row mit job_type='evidence_extraction' + manipuliertem Payload anlegt, koennte der Worker arbitrary `evidence_file_id` zwischen Tenants verarbeiten. Aktuell kein bekannter Bypass-Pfad, defense-in-depth-Lichtblick.
- Vorschlag: Worker-side: Zod-Schemas pro `job_type` definieren, beim Pickup parsen, bei Validation-Fail Job auf `failed` markieren + Audit-Log. DB-side optional CHECK-Constraint via SECURITY-DEFINER-Validation-Function.
- Aufwand: M

### SEC-008 — `tenantName`-Interpolation in Email-HTML ohne Escape
- Severity: Medium
- Klasse: Email-HTML-Injection
- File: src/lib/email.ts:43-46, 53-58, 63-68 (INVITE_TEMPLATES); 78-104, 108-115 (MIRROR_INVITE_TEMPLATES); 240-260 (EMPLOYEE_INVITE_TEMPLATES); 153-167 (mirror invite HTML), 220-234 (tenant invite HTML)
- DSGVO: nein
- Beschreibung: `tenantName` wird per Template-Literal in HTML-Email-Body geschrieben (`<strong>${tenantName}</strong>`) ohne HTML-Escape. tenant.name kommt aus `tenants`-Tabelle und ist heute nur durch strategaize_admin/tenant_admin setzbar — also kein direkter externer Angriffsweg. Aber: tenant_admin kann tenant.name selbst aendern und damit Phishing-Mails an Mitarbeiter aussenden mit eingebetteten `<a href="evil.com">echte Anmeldung</a>`-Links, oder bei einem zukuenftigen Self-Service-Tenant-Setup (V8+ on-premise) externe Akteure das Feld setzen.
- Vorschlag: `escapeHtml()`-Helper (existiert in `src/components/handbook/SearchResultsList.tsx:86-93`) in einen `src/lib/html-escape.ts`-Helper extrahieren. Alle `${tenantName}`/`${displayName}`-Interpolations in `src/lib/email.ts` darueber routen. Plus Zod-Constraint auf tenants.name (max 100 Zeichen, keine `<`/`>`).
- Aufwand: S

### SEC-009 — Bestand `secrets-onboarding.txt` im Repo-Root (kein direkter Leak, aber gefaehrlich)
- Severity: Medium
- Klasse: Secret-Handling / Repo-Hygiene
- File: secrets-onboarding.txt (vorhanden), .gitignore:37 (`secrets-*.txt` Pattern aktiv)
- DSGVO: ja (potenzielle PII / Service-Role-Key Exposure bei Fehler)
- Beschreibung: Datei `secrets-onboarding.txt` liegt physisch im Repo-Root (1673 bytes). `.gitignore` enthaelt das Pattern `secrets-*.txt` (ISSUE-001 resolution). Datei ist damit nicht-getrackt. Aber: das Pattern `secrets-*.txt` matched nicht `secrets onboarding.txt` (mit Space) oder `Secrets-Onboarding.txt` (Case-Insensitive ist im git config-default OS-abhaengig: auf Windows wird oft case-insensitive matching genutzt, auf Linux case-sensitive). Wer auf seinem System eine andere Schreibweise nutzt, riskiert akzidentelles `git add .`-Commit. Zusaetzlich enthaelt die canonical-pattern-Liste aus `.claude/rules` einen `env vars_*.txt`-Eintrag, der hier ebenfalls fehlt.
- Vorschlag: (a) Datei umbenennen auf `secrets/onboarding.env` (verschiebt sie in den bereits ignorierten `secrets/`-Folder); (b) `.gitignore` um `env vars_*.txt`, `*.env.production`, `*credentials*` ergaenzen; (c) pre-commit-Hook (z.B. via husky oder lefthook) das Secrets-Pattern (`AKIA[0-9A-Z]{16}`, `eyJ`, `sk_live_`) im staged-content greppt.
- Aufwand: S

### SEC-010 — Keine Content-Security-Policy (CSP) Header
- Severity: Medium
- Klasse: XSS-Mitigation / Defense-in-Depth
- File: next.config.ts:22-41
- DSGVO: nein
- Beschreibung: `next.config.ts` setzt X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy, HSTS, Permissions-Policy. Es fehlt eine Content-Security-Policy. Kombiniert mit dem SVG-Upload-Risiko (SEC-004) und dem `dangerouslySetInnerHTML` in `SearchResultsList.tsx:70` und `layout.tsx:35` (beides defensive HTML-Escape + statischer CSS, kein User-Input) wuerde CSP eine zusaetzliche XSS-Stop-Stufe einziehen.
- Vorschlag: CSP Strict mit `default-src 'self'; script-src 'self' 'unsafe-inline' https://meet-onboarding.strategaizetransition.com; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src https://meet-onboarding.strategaizetransition.com; object-src 'none'; base-uri 'self'` als Start (Jitsi-Subdomain ist legitim eingebettet). `unsafe-inline` fuer style noch noetig wegen Tailwind dev-mode. Iterativ verfeinern. CSP-Report-Endpoint einrichten (separater Slice).
- Aufwand: M (mit Iterations- und Test-Aufwand)

### SEC-011 — Passwort-Mindestlaenge nur 8 Zeichen, keine Strength-Requirements
- Severity: Medium
- Klasse: Auth / Password-Policy
- File: src/app/auth/set-password/actions.ts:12; src/app/accept-invitation/[token]/actions.ts:56; src/app/accept-invitation/[token]/AcceptInvitationForm.tsx:29
- DSGVO: nein (DSGVO macht keine Vorgabe, ISO27001/BSI-Empfehlung aber 12+)
- Beschreibung: Beide Passwort-Setze-Pfade akzeptieren 8-Zeichen-Passwoerter ohne Komplexitaets-Anforderung. NIST SP 800-63B (Stand 2024) erlaubt 8+ als absolute Untergrenze nur mit Breach-Listen-Check (haveibeenpwned), sonst empfiehlt 12+. Strategaize Onboarding ist B2B-Plattform mit GF-Onboarding-Daten — Industry-Standard fuer dieses Datenschutz-Level ist 12+.
- Vorschlag: Mindestlaenge auf 12 Zeichen anheben, plus zxcvbn-Score-Check (Score >= 3 verlangt). Oder Pwned-Passwords-API (k-anonymity-Pfad) gegen den Hash-Prefix pruefen.
- Aufwand: S

### SEC-012 — Worker-ENV AWS_REGION ohne Validation auf eu-*-Praefix
- Severity: Low
- Klasse: DSGVO / Data-Residency
- File: src/workers/condensation/run.ts:24-30; src/lib/llm.ts:9; src/lib/ai/embeddings/titan.ts:22
- DSGVO: ja
- Beschreibung: `AWS_REGION` ist PflichtENV ohne Validation. Wenn beim Coolify-Deploy versehentlich `us-east-1` gesetzt wird, leitet der Bedrock-Client Customer-Daten an US-Endpoint weiter — direkter DSGVO-Verstoss. Code-Default ist `eu-central-1` (fail-open auf Frankfurt wenn ENV fehlt), aber wenn ENV gesetzt UND falsch ist greift Default nicht.
- Vorschlag: Worker-Boot-Validation: `if (!process.env.AWS_REGION.startsWith("eu-")) { console.error("REFUSING start: AWS_REGION must be eu-*"); process.exit(1); }`. Plus dasselbe in `src/lib/llm.ts` bei jedem Bedrock-Call-Init.
- Aufwand: S

### SEC-013 — Logger-Stack-Traces an strategaize_admin auch in error_log-Tabelle (Info-Disclosure)
- Severity: Low
- Klasse: Information-Disclosure / Logging
- File: src/lib/logger.ts:20-35 (logToDb schreibt full err.stack); src/app/api/admin/errors/route.ts:14-18 (`select` enthaelt stack)
- DSGVO: ja (nur strategaize_admin sieht es — RLS-protected — aber bei stack-Trace mit Filepath/Variable koennen Daten-Auskunfts-Anfragen entstehen)
- Beschreibung: Vollstaendige JS-Stack-Traces werden in error_log gespeichert und ueber `/api/admin/errors` an strategaize_admin ausgeleesen. Stack-Traces enthalten Datei-Pfade, Source-Map-Zeilen, ggf. Variable-Namen die PII aus dem capture-Kontext enthalten. Bei DSGVO-Auskunfts-Pflicht oder Datenschutz-Audit muss strategaize_admin diese Logs vollstaendig durchsuchen koennen. Aktuell low impact weil error_log RLS-protected, aber nicht-DSGVO-disziplin-konform mit der `metadata.email_hash`-Strategie aus public_signup.
- Vorschlag: Stack-Trace-Redaction-Layer der bekannte PII-Felder (email-pattern, postgres-row-payload) maskiert. Plus Retention-Policy via Cron der error_log > 90 Tage purged.
- Aufwand: M

### SEC-014 — Static Server-RLS-Policies erlauben write durch tenant_admin auf tenants (offen seit ISSUE-031-Fix)
- Severity: Low
- Klasse: RLS / Defense-in-Depth
- File: sql/rls.sql:25-29 (nur tenant_select_own_tenant Policy, keine UPDATE-Policy fuer tenant_admin)
- DSGVO: nein
- Beschreibung: ISSUE-031 hat fuer Wizard-State-Updates auf service-role umgeschaltet (Workaround). Die strukturelle Behebung — eine echte tenant_admin-UPDATE-RLS-Policy auf bestimmten Spalten (z.B. wizard_state, language) — ist als V4.3-Followup aufgelistet, aber nicht umgesetzt. Damit muessen alle State-Maschinen-UPDATEs durch tenant_admin auf service-role-Bypass laufen — jeder neue Slice der das vergisst hat einen silent broken-Pfad. Risikoklasse Maintainability, nicht-direkt Security.
- Vorschlag: `tenant_admin_update_own_tenant`-Policy auf `tenants` mit `USING(id=auth.user_tenant_id() AND auth.user_role()='tenant_admin')` plus Column-Whitelist via `WITH CHECK` auf updatable columns. Bestehende service-role-UPDATEs nicht aendern (defense-in-depth).
- Aufwand: M

### SEC-015 — partner-branding-Logo Server-Proxy ohne ETag / If-None-Match (Cache-Poisoning Defense-in-Depth)
- Severity: Low
- Klasse: HTTP-Header / Defense-in-Depth
- File: src/app/api/partner-branding/[partner_tenant_id]/logo/route.ts:118-125
- DSGVO: nein
- Beschreibung: Der Logo-Endpoint setzt `Cache-Control: public, max-age=3600` ohne ETag. Falls partner_admin ein neues Logo hochlaedt, sieht der User bis zu 60 Min die alte Cache-Version. Bei kompromittiertem Logo (SEC-004) bleibt die malicioese Datei zusaetzlich im CDN/Browser-Cache. Cosmetic vs. SVG-XSS-Mitigation.
- Vorschlag: `ETag: sha256(storage_path + uploaded_at)`. Bei Update: server-side Revalidation. Falls SEC-004 als (Option a) per SVG-Entfernung geloest wird, ist dieser Punkt weitgehend obsolet.
- Aufwand: S

### SEC-016 — npm-audit Findings (ISSUE-026 + ISSUE-040 schon dokumentiert, plus moeglich Dependency-Drift)
- Severity: Low
- Klasse: Dependency / Build-Time
- File: package.json (top-level), package-lock.json
- DSGVO: nein
- Beschreibung: Bekannt: postcss <8.5.10 bundled in Next.js (Build-Time-only, kein Runtime-Pfad — ISSUE-026); fast-xml-builder <=1.1.6 (Build-Time-only via AWS SDK — ISSUE-040). Beide produktions-pfad-unrelevant. Empfehlung: regelmaessig `npm outdated next` + `npm audit fix --force` pruefen, aber kein V8-Blocker.
- Vorschlag: Maintenance-Slice in V8.x, parallel zu Next-Minor-Bump.
- Aufwand: S

### SEC-017 — Email-Template Direct-URL-Render ohne Verifier (Open-Redirect Defense-in-Depth)
- Severity: Low
- Klasse: Open-Redirect / Defense-in-Depth
- File: src/lib/email.ts:228 (`<a href="${verifyUrl}">`); src/app/api/admin/tenants/[tenantId]/invite/route.ts:117 (verifyUrl-Construction); src/app/api/public/signup/route.ts:399 (verifyUrl)
- DSGVO: nein
- Beschreibung: `verifyUrl` wird in Email-HTML als `<a href>` interpoliert. Construction-Pfad nutzt `process.env.NEXT_PUBLIC_APP_URL`, ist also nicht User-controlled. Aber `appUrl` enthaelt kein trailing slash check; wenn appUrl auf `https://...com/` endet, kann doppelter `/` entstehen. Cosmetic. Open-Redirect-Pfad nicht direkt erreichbar — der `verifyUrl`-Builder uebernimmt nicht-trustable input.
- Vorschlag: `appUrl`-Construction normalisieren (`.replace(/\/$/, "")`) + Test fuer URL-Build-Edge-Cases.
- Aufwand: S

### SEC-018 — fetch ohne timeout/AbortSignal (DoS Defense-in-Depth)
- Severity: Low
- Klasse: Reliability / Defense-in-Depth
- File: src/lib/whisper.ts:40 (transcribeAudio fetch ohne timeout), src/lib/ai/whisper/local.ts:39 (gleich), src/components/meeting-guide/ai-suggestions.tsx:29
- DSGVO: nein
- Beschreibung: Mehrere serverseitige fetch()-Aufrufe an Whisper-Container nutzen kein `signal: AbortSignal.timeout(...)`. Wenn der Whisper-Container haengt, blockiert der Request-Handler bis Next.js / Coolify-Proxy-Timeout. Tiefe-DoS-Vector durch malicioese Audio-Uploads die Whisper-Container in Endlosschleife schicken.
- Vorschlag: `AbortSignal.timeout(30_000)` an alle fetch-Calls + try/catch + 504-Gateway-Timeout returnen.
- Aufwand: S

### SEC-019 — Session-Cookie SameSite=lax statt strict (CSRF Defense-in-Depth)
- Severity: Low
- Klasse: CSRF / Session-Security
- File: src/app/auth/callback/route.ts:75 (`sameSite: "lax"`); src/lib/supabase/middleware.ts:169 (`sameSite: "lax"`)
- DSGVO: nein
- Beschreibung: NEXT_LOCALE und Session-Cookies nutzen SameSite=lax. Supabase-Default. Reicht fuer most-cases — Top-Level-Navigations + GET sind erlaubt. POST von cross-site Sub-Resources werden geblockt. State-changing GET-Requests (z.B. wenn jemand bewusst `<a href="/admin/tenants/X/delete">` via Email-Link traegt) waeren nicht durch SameSite-Lax geblockt. Aktuell schwerwiegend keine Delete-via-GET im Code. Defense-in-Depth.
- Vorschlag: Auf `sameSite: "strict"` umstellen wenn cross-domain-Login-Flow zu IS aus V7-Self-Signup nicht broken wird. Test-Slice required.
- Aufwand: S

## Bereits bekannte Issues (Filter)

- ISSUE-001 (resolved 2026-04-14): secrets-onboarding.txt im Repo-Root. Datei existiert weiterhin physisch (1673 bytes), aber via `.gitignore`-Pattern `secrets-*.txt` ausgeschlossen. Resterisiko in SEC-009 behandelt (case-sensitivity, alternative Schreibweisen, pre-commit-Hook fehlt).
- ISSUE-007 (open, Low): JWT enthaelt stale tenant_owner-role-Claim bis erste Re-Auth nach Migration 026. Praktisch keine Relevanz mehr, da Migration laenger als alle Refresh-Token-Lifetimes zurueck.
- ISSUE-026 (open, Low): postcss <8.5.10 bundled in Next.js. Build-Time-only, kein Runtime-XSS-Vector im Onboarding-Code. → SEC-016.
- ISSUE-028 (open, Low): V3 RECORDING_WEBHOOK_SECRET nicht in Prod-ENV gesetzt. Webhook funktional inaktiv. → siehe SEC-003 (Pre-Aktivierungs-Blocker).
- ISSUE-031 (resolved): RLS-UPDATE-Policy auf tenants fehlt fuer tenant_admin. Workaround via service-role-Client. Strukturelle Behebung als V4.3-Followup offen. → SEC-014.
- ISSUE-040 (open, Low): fast-xml-builder <=1.1.6 Build-Time-Vuln via AWS SDK. → SEC-016.
- ISSUE-051 (open, Low): profiles.first_name/last_name fehlen fuer Lead-Push-Payload-Qualitaet. Kein Security-Issue, Datenqualitaet.
- ISSUE-073 (open, Low): IMPRESSUM_VAT-Platzhalter. Kein Security-Issue, Compliance-Pflicht-Inhalt vor erstem echten Live-Pilot.

## Audit-Methodik

- Voll-Coverage von src/app/api/**/route.ts (32 Routes) gegen Auth/Tenant/Validation-Triple.
- Voll-Coverage von Server-Actions ("use server"-Files, ~18 Files) inkl. Auth-Gate-Pattern.
- Voll-Coverage von sql/**/*.sql (92 Files) auf SECURITY DEFINER + SET search_path, RLS ENABLE ohne Policy, Storage-Bucket public-Flag und allowed_mime_types, raw-SQL-Concat via EXECUTE format() (alle nutzen %I — sicher).
- Grep auf Secret-Patterns (sk_live_, AKIA*, eyJ, postgres://, -----BEGIN) in src/** — keine Treffer.
- Grep auf process.env.X ohne NEXT_PUBLIC_ in Client-Components ("use client"-First-Find + 3000-char-Window) — keine Treffer.
- Grep auf dangerouslySetInnerHTML — 2 Treffer, beide mit HTML-Escape (SearchResultsList.tsx) bzw. statische Strings (layout.tsx). Safe.
- Grep auf target=_blank ohne rel=noopener — alle 3 Stellen haben rel=noopener noreferrer. Safe.
- Grep auf direkten OpenAI/Anthropic-API-Calls oder us-*-Region-Strings — keine Treffer.
- Pruefung gegen Strategaize-data-residency.md Rule: Bedrock eu-central-1 default, local Whisper, ENV-driven AWS_REGION (SEC-012 Validation-Gap).
- Pruefung gegen jitsi-jibri-deployment.md Rule fuer Recording-Webhook (SEC-003 Path-Traversal Defense-in-Depth).
- Existing-issues-Filter aus docs/KNOWN_ISSUES.md (61 ISSUEs).
