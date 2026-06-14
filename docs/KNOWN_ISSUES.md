# Known Issues

### ISSUE-102 — V9.1 Coolify Scheduled-Tasks scheitern mit `curl: not found` (3 Forward-Bucket-Crons ~21h dormant)
- Status: resolved
- Severity: High
- Area: Coolify Scheduled-Tasks (inbound-email-imap-sync / email-bulk-pipeline-trigger / bulk-email-retention-sweep) / Next.js-standalone-Alpine-App-Container
- Summary: Live entdeckt im /post-launch V9.1 T+21h (2026-06-13, RPT-466). Die 3 V9.1-Coolify-Scheduled-Tasks feuern korrekt auf Cadence (imap-sync `*/5`), scheiterten aber bei JEDER Ausfuehrung mit `Job permanently failed after 1 attempts: sh: curl: not found`. Das Task-Command nutzte `curl -fsS -X POST <url> -H "x-cron-secret: $CRON_SECRET"`; der Alpine-App-Container hat aber nur `wget` (kein curl). Die Endpoints selbst funktionieren (manueller `docker exec wget` → `{success:true}`). Effekt: V9.1-Kern-Feature (continuous Forward-Bucket-Inbound-Sync) war seit dem ~08:18-Redeploy (2026-06-12) ~21h dormant — kein Auto-Pull aus IONOS. KEIN Datenverlust (IONOS haelt Mail; `last_uid=1` resumed beim naechsten erfolgreichen Sync). Aeltere April/Mai-Tasks (pending-signup-cleanup, capture-reminders) waren nicht betroffen (andere Command-Form).
- Impact: Continuous-Inbound-Sync + Pipeline-Trigger + Retention-Sweep liefen nicht automatisch. Im Internal-Test-Mode (Founder-only) ohne Datenverlust, aber das V9.1-Kern-Versprechen (always-on Inbound) war nicht operativ.
- Resolution: 2026-06-13 im /post-launch. Alle 3 Task-Commands in `coolify-db scheduled_tasks.command` von `curl -fsS -X POST <url> -H "..."` auf `wget -qO- --post-data='' --header="..." <url>` umgestellt (Fix vorab im Container validiert: wget-over-HTTPS → `{success:true}`). Verifikation: naechster `*/5`-Tick 06:10:02 UTC = **success** `{"success":true,...,"lastUid":1}` (vorher 06:05/06:00 = failed `curl: not found`); app `error_log` bestaetigt `cron:inbound-email-imap-sync run` um 06:10:04 (Endpoint vom Scheduler erreicht). pipeline-trigger (hourly) + retention-sweep (daily) tragen den identischen validierten Fix, bestaetigen auf ihrem naechsten Tick.
- Next Action: Cross-Repo-Pflicht — alle Coolify-Scheduled-Task-Commands gegen Alpine-App-Container muessen `wget` statt `curl` nutzen; /deploy muss „Scheduled-Task EXECUTES successfully" verifizieren (nicht nur „registered"). Dev-System-IMP angelegt.

### ISSUE-100 — Stale Code-Default Bedrock-Modell-IDs in 4 Adaptern (V8.1-Augmentation potenziell latent broken)
- Status: open
- Severity: Medium
- Area: LLM-Adapter Code-Defaults (`src/lib/ai/bedrock-sonnet/email-pattern.ts:51`, `src/lib/ai/bedrock-haiku/index.ts:42`, `src/lib/bulk-email/ai-assisted-setup.ts:24`, `src/lib/llm/v8-1-augmentation/augment.ts:46`)
- Summary: Code-Audit 2026-06-12 (Modell-Inventar): 4 Dateien defaulten auf rohe, im AWS-Konto/eu-central-1 NICHT invokebare Modell-IDs (`anthropic.claude-3-5-sonnet-20241022-v2:0`, `anthropic.claude-3-haiku-20240307-v1:0`) — dieselbe Klasse wie ISSUE-099. Der Kern-Pfad (3-Agenten-Condensation + ~11 Worker) nutzt korrekt `eu.anthropic.claude-sonnet-4-20250514-v1:0` via `LLM_MODEL`. Die 3 V9-/V9.1-Adapter (email-pattern, bedrock-haiku, ai-assisted-setup) sind zur Laufzeit via Coolify-ENV `BEDROCK_V9_SONNET_MODEL_ID`/`BEDROCK_V9_HAIKU_MODEL_ID` (DEC-210) auf Sonnet 4 gepatcht → laufen. ABER die **V8.1-Handbuch-Augmentation** (`augment.ts`, ENV `BEDROCK_V8_1_MODEL_ID`) ist wahrscheinlich NICHT per ENV gepatcht → **latent broken**, falls die ENV in Coolify nicht gesetzt ist.
- Impact: V8.1-Augmentation (LLM-Empfehlungs-Anreicherung im Mandanten-Report/Handbuch-Pfad) wirft beim naechsten Aufruf ggf. „invalid model identifier", non-fatal abgefangen → Augmentation still leer. V9-Bulk + V9.1-Setup laufen via ENV-Patch.
- Workaround: Coolify-ENV `BEDROCK_V8_1_MODEL_ID=eu.anthropic.claude-sonnet-4-20250514-v1:0` setzen (analog DEC-210). Verify ob gesetzt: `docker exec <app> printenv BEDROCK_V8_1_MODEL_ID`.
- Next Action: Code-Defaults GEFIXT in SLC-V9.5-A (/backend+/qa PASS 2026-06-12, RPT-456, Branch `v9-5-bulk-deep-extraction`): 3 Sonnet-Adapter → `eu.anthropic.claude-sonnet-4-20250514-v1:0` (Pricing $3/$15 unveraendert = Sonnet-3.5-Tier), bedrock-haiku → `eu.anthropic.claude-haiku-4-5-20251001-v1:0` + Cost-Konstanten $0.25/$1.25 → $1/$5 (Haiku-4.5-Tier, R-A-1). ENV-Override unangetastet. RESTLICHE VERIFIKATION (offen bis /deploy): exakte Bedrock-Inference-Profile-ID fuer Haiku 4.5 + eu-central-1-Verfuegbarkeit via `aws bedrock list-inference-profiles --region eu-central-1` ODER Live-Bedrock-Smoke live-bestaetigen (ID aus claude-api-Skill first-party `claude-haiku-4-5-20251001` + Repo-Konvention `eu.anthropic.<id>-v1:0` abgeleitet, NICHT live-AWS-verifiziert). ENV-Override (`BEDROCK_V9_HAIKU_MODEL_ID`) ist das Sicherheitsnetz bei Drift. **/deploy V9.5 2026-06-14 — Founder-Entscheidung: Override bleibt auf `eu.anthropic.claude-sonnet-4-20250514-v1:0` (eu-Sonnet-4), eu-Haiku-4.5 NICHT umgestellt/verifiziert.** Begruendung: kein Risiko einer ungueltigen Model-ID im Deploy; die Haiku-Stufe laeuft uebergangsweise auf eu-Sonnet-4 (bewiesen lauffaehig, teurer). V9.5-Synthese-Live-Smoke 2026-06-14 lief vollstaendig auf eu-Sonnet-4 (Cost-Ledger: 2× email_bulk_synthesis + 1× email_bulk_critic, alle `eu.anthropic.claude-sonnet-4-20250514-v1:0`). Bleibt `open` (deferred) — Aktivierung von eu-Haiku-4.5 erst wenn Founder die Kostenoptimierung will + `aws bedrock list-inference-profiles --region eu-central-1` die ID bestaetigt.

### ISSUE-099 — V9 Bedrock-Modell-IDs ohne eu-Inference-Profile-Praefix (invalid model identifier)
- Status: open
- Severity: High
- Area: V9.0/V9.1 Bedrock-LLM (`src/lib/ai/bedrock-sonnet/email-pattern.ts`, `src/lib/ai/bedrock-haiku/index.ts`, `src/lib/bulk-email/ai-assisted-setup.ts`, Coolify-ENV `BEDROCK_V9_SONNET_MODEL_ID`/`BEDROCK_V9_HAIKU_MODEL_ID`)
- Summary: Live entdeckt 2026-06-12 (V9.1 Setup-Assistent „nicht erreichbar", error_log `setup-ui:forward-setup | The provided model identifier is invalid.`). Die V9-Bedrock-Adapter (Haiku/Sonnet) defaulten auf ROHE Foundation-Model-IDs (`anthropic.claude-3-5-sonnet-20241022-v2:0`, `anthropic.claude-3-haiku-20240307-v1:0`) und die Coolify-ENV `BEDROCK_V9_SONNET_MODEL_ID` ist ebenfalls roh gesetzt. Bedrock eu-central-1 verlangt aber das **Inference-Profile** mit `eu.`-Praefix (vgl. funktionierender Adapter `src/lib/llm.ts`: `eu.anthropic.claude-sonnet-4-20250514-v1:0`). Raw-ID → On-Demand-Invoke abgelehnt.
- Impact: ALLE V9-Bedrock-Calls scheitern live: V9.1 Setup-Assistent (summarizeSetupIntent) + V9.0/V9.1 Pipeline (Pre-Filter Haiku + Pattern-Extraktion Sonnet). Der reine IMAP-Inbound-Durchstich (Mail ankommen + speichern + zuordnen) ist NICHT betroffen (kein Bedrock); die KI-Verarbeitung danach schon. Latenter Bug seit V9.0 (Live-Bedrock-Smoke war deferred).
- Workaround: Manuelles Endpoint-Anlegen funktioniert (kein KI-Vorschlag noetig).
- Befund 2026-06-12 (Live-Invoke-Test gegen AWS-Konto, eu-central-1): NUR `eu.anthropic.claude-sonnet-4-20250514-v1:0` ist nutzbar (ACTIVE + Invoke OK). `eu.anthropic.claude-3-5-sonnet-20241022-v2:0` = ValidationException „invalid". `eu.anthropic.claude-3-haiku-20240307-v1:0` = ACTIVE gelistet, aber Invoke „Access denied, marked Legacy" (kein Zugriff). Claude 3.5 Haiku nicht verfuegbar. → Die V9-Default-Modelle (3.5 Sonnet v2 + Haiku 3) sind im Konto/Region nicht zugaenglich.
- Next Action: Coolify-ENV BEIDE auf Sonnet 4 setzen: `BEDROCK_V9_SONNET_MODEL_ID=eu.anthropic.claude-sonnet-4-20250514-v1:0` + `BEDROCK_V9_HAIKU_MODEL_ID=eu.anthropic.claude-sonnet-4-20250514-v1:0` (kein nutzbares Haiku — Pre-Filter laeuft uebergangsweise auf Sonnet 4, teurer). Redeploy, Live-Verify (Setup-Assistent + Pipeline-Trigger gegen den wartenden continuous-Run). Follow-up: Code-Defaults in `bedrock-sonnet`/`bedrock-haiku` auf eu-Sonnet-4 umstellen; Cost-Cap-Pricing-Konstanten (Sonnet 3.5 $3/$15) an Sonnet 4 anpassen; fuer guenstigen Pre-Filter Bedrock-Model-Access fuer Claude 3.5 Haiku beantragen.

### ISSUE-098 — V9.1 Forward-Setup-UI zeigt nicht-zustellbare bulk-<slug>@bulk-Adresse im Single-Mailbox-Modus
- Status: open
- Severity: Medium
- Area: V9.1 Setup-UI (`src/app/dashboard/bulk-email-import/forward-setup/`, `MailClientInstructions`, `SetupTokenDisplay`)
- Summary: Live entdeckt 2026-06-12. Die UI zeigt als Weiterleitungs-Ziel `bulk-<slug>@bulk.strategaizetransition.com` (Catchall-Form, nicht editierbar) und die Mail-Client-Anleitung weist an, dorthin weiterzuleiten. Die Subdomain `bulk.strategaizetransition.com` hat aber KEINEN MX-Record (dig leer) → Mails dorthin bouncen. Im As-built-Single-Mailbox-Modus (DEC-205/206) laeuft alles ueber das eine IONOS-Postfach `bulk@strategaizetransition.com` (MX → IONOS), das der IMAP-Sync abholt; die `bulk-<slug>@…`-Adresse ist die ZUKUENFTIGE Catchall-Form (noch nicht eingerichtet).
- Impact: User folgt der UI-Anleitung, leitet an eine bouncende Adresse weiter → keine Mail kommt an, Pipeline scheint kaputt. UI-Falle. RUNBOOK dokumentiert die Diskrepanz, die UI selbst nicht.
- Workaround: Im Single-Mailbox-Modus an `bulk@strategaizetransition.com` weiterleiten (nicht an die UI-Adresse). Sync ordnet alle Mailbox-Mails dem einzigen aktiven Endpoint zu (resolveDefaultEndpoint, kein To-Matching).
- Code-Fix 2026-06-12 (SLC-V9.1-E, DEC-211, RPT-451): ENV-Modus-Schalter `INBOUND_MAILBOX_ADDRESS` + zentraler Resolver `src/lib/inbound-email/forward-address.ts`. Gesetzt → UI zeigt das reale Postfach + Test-Mail geht dorthin (slug-unabhaengig); nicht gesetzt → bisheriges Catchall-Verhalten. /qa Code-Side PASS (tsc/ESLint 0, 154 Tests gruen inkl. ISSUE-098-Cases). Status bleibt `open`, weil die Live-UI erst nach Founder-ENV-Set + Redeploy korrekt anzeigt.
- Next Action: Founder setzt `INBOUND_MAILBOX_ADDRESS=bulk@strategaizetransition.com` (identisch zu IMAP_USER) in Coolify + Redeploy → Live-Verify (UI zeigt reale Adresse, Test-Mail `received=true`) → ISSUE-098 resolved. Redeploy ersetzt den Burn-In-Container, daher gebuendelt mit/nach `/post-launch V9.1` (nicht waehrend des laufenden T+24h-Fensters).

### ISSUE-097 — Entitlement-Modell: kein Unterschied Steuerberater-Mandant (Diagnose-Scope) vs. Voll-Kunde (Bulk-Import)
- Status: open
- Severity: Medium
- Area: OP Rollen-/Entitlement-Modell (`profiles.role`, Auth-Gate `src/app/dashboard/bulk-email-import/**/page.tsx`)
- Summary: Live entdeckt 2026-06-12 (Founder-Frage). Ein per Steuerberater eingeladener Mandant ist `tenant_admin` seines Tenants — dieselbe Rolle wie ein Voll-Kunde/GF. Die Bulk-Email-Import- + Forward-Setup-Seiten gaten ausschliesslich auf `role === 'tenant_admin'`. Damit kann ein reiner Diagnose-Mandant die Voll-Kunden-Funktion (Bulk-Import) per direkter URL erreichen — im Dashboard nur durch fehlenden Menue-Link „versteckt" (security-by-no-nav, kein echtes Entitlement). Es gibt keinen Mechanismus „Mandant → Voll-Kunde heben/erweitern".
- Impact: Im Internal-Test-Mode (Founder-only) unkritisch. Vor Customer-Live problematisch: kein sauberer Scope-Schnitt zwischen Diagnose-Mandant und zahlendem Voll-Kunden. Persona-/Entitlement-Modellierung fehlt.
- Workaround: Keiner noetig im Pilot (kein Menue-Link, nur Founder testet).
- Next Action: DEC treffen — Tenant-Tier/Feature-Entitlement-Flag (gleicher Login, Features erweitert bei Konvertierung) statt reinem Rollen-Gate. Vor Customer-Live (module-lifecycle-discipline). Mit Founder durchgehen.


### ISSUE-096 — V9.1 RLS-Behavioral-Pen-Test fehlt fuer 3 Inbound-Foundation-Tabellen
- Status: open
- Severity: Low
- Area: V9.1 RLS-Test-Matrix (`src/__tests__/rls/`, `src/__tests__/migrations/112-v91-inbound-foundation.test.ts`)
- Summary: Gesamt-V9.1-/qa (RPT-447) zeigte: ein voller Behavioral-4-Rollen-Pen-Test (withJwtContext SELECT/INSERT/UPDATE/DELETE pro Rolle, SAVEPOINT-Pattern) existiert nur fuer `email_inbound_sync_state` (`v91-inbound.rls.test.ts`, 10 Cases). Die 3 Foundation-Tabellen `email_inbound_endpoint`, `email_forward_allowlist`, `email_validation_reject_log` (MIG-112) haben nur Policy-Existenz- + Schema-Verifikation (Policy-Count + RLS-enabled + CHECK in `112-v91-inbound-foundation.test.ts`), keinen Cross-Tenant-Verhaltens-Test.
- Impact: Gering im V9.1-Internal-Test-Mode (Founder-only, keine Kundendaten). Die Policies existieren, sind korrekt typisiert (admin_all + tenant-scoped) und folgen dem identischen V9-Standard-Pattern wie das behavioral getestete `email_inbound_sync_state` und `v9-bulk-email`. Risiko steigt erst vor Customer-Live, wenn diese Tabellen reale Kunden-Email-Daten + Sender-Allowlists tragen.
- Workaround: Keiner noetig im V9.1-Pilot.
- Next Action: Vor Customer-Live (Modul 1+2+3 komplett, module-lifecycle-discipline) Behavioral-4-Rollen-Matrix fuer die 3 Foundation-Tabellen ergaenzen (Pattern-Reuse aus `v91-inbound.rls.test.ts`). Nicht V9.1-Release-blockierend.

### ISSUE-095 — V9.1 SLC-V9.1-C Retention-Idempotency haengt an knowledge_unit.metadata->>bulk_run_id
- Status: open
- Severity: Low
- Area: V9.1 SLC-V9.1-C Retention-Sweep (`src/lib/bulk-email/retention-idempotency.ts`)
- Summary: `isRunImportedToHandbook` entscheidet ueber Hard-Delete-Skip allein via `knowledge_unit WHERE source='email_bulk' AND metadata->>'bulk_run_id' = runId`. `handbook-import.ts` dokumentiert (DEC-193), dass `metadata` defensiv optional ist und der INSERT bei fehlender Spalte OHNE metadata retry-t. Faende sich ein importierter Run, dessen knowledge_unit OHNE metadata persistiert wurde, gaebe der Check einen False-Negative → der Run wuerde nach 90d hart-geloescht.
- Impact: Gering. Die live-DB hat `knowledge_unit.metadata` als V4-Foundation-Pflichtfeld mit `'{}'`-Default (V9.0 SLC-168), d.h. der Defensive-Retry-ohne-metadata-Pfad greift praktisch nicht. Selbst im Worst-Case bleibt die importierte knowledge_unit (das eigentliche Handbuch-Pattern) erhalten — nur die Raw-Source-Emails (email_bulk_run + email_message + Storage) gingen verloren; deren Loeschung ist DSGVO-erwuenscht. Verlust beschraenkt sich auf Source-Traceability eines importierten Runs.
- Workaround: Keiner noetig im V9.1-Pilot (Founder-only).
- Next Action: Live-Smoke (AC-9 in /deploy) verifiziert, dass importierte email_bulk-Patterns `metadata.bulk_run_id` gesetzt haben. Optionale Belt-and-Suspenders-Idempotency (zusaetzlicher body-Markdown-Run-Link-Match) als V9.2+.

### ISSUE-094 — V9 SLC-168 Admin-Audit Monats-Cost-Query nutzt nicht-existente Spalte `month_start`
- Status: resolved
- Severity: Low
- Resolution: 2026-06-11 — Fix in SLC-V9.1-D MT-5 /backend (RPT-443): `src/app/admin/audit/bulk-email/page.tsx:179-180` selektiert + filtert jetzt auf `month` statt `month_start`. In SLC-V9.1-D /frontend-QA (RPT-445) code-verifiziert. Live-Smoke-Verifikation (echte Monatskosten sichtbar) bleibt /deploy-gated.
- Area: V9 SLC-168 Admin-Audit-Page (`src/app/admin/audit/bulk-email/page.tsx:173-174`)
- Summary: Die Monats-Cost-Aggregat-Query selektiert + filtert auf `month_start` (`.select("tenant_id, month_start, ...").eq("month_start", monthStartIso)`), aber die View `vw_bulk_email_cost_monthly` (MIG-054/109) hat die Spalte `month` (nicht `month_start`). Die Query wirft `column month_start does not exist`, wird vom umgebenden try/catch geschluckt → `costRows` bleibt leer → "Cost-Aggregat aktueller Monat" zeigt 0/leer. Pre-existing aus V9 SLC-168, NICHT aus SLC-V9.1-B. Discovery durch SLC-V9.1-B /qa DB-vs-Code-Paritaets-Check (RPT-440).
- Impact: Admin-Audit "Cost-Aggregat aktueller Monat"-Tabelle zeigt fuer alle Tenants 0 EUR / 0 Runs, obwohl Monatskosten existieren koennen. Nur Anzeige-Bug (Cross-Tenant-Admin-Sicht), kein Funktions-/Daten-Schaden. Cap-Enforcement (continuous-cost-cap.ts) liest korrekt `month` und ist NICHT betroffen.
- Workaround: Keiner noetig — rein kosmetisch in der Audit-Anzeige.
- Next Action: 1-Zeichen-Fix `month_start` → `month` (Select + .eq) in SLC-V9.1-D (beruehrt dieselbe Admin-Audit-Page) oder als Quick-Follow-up. Bewusst nicht in SLC-V9.1-B gefixt (out-of-slice-scope, surgical-changes-Disziplin).

### ISSUE-093 — V9 Bedrock-Haiku-3-Modell Legacy/Deprecation in eu-central-1
- Status: open
- Severity: High
- Area: V9 Pre-Filter-Worker (`src/workers/bulk-email/handle-pre-filter-job.ts`) + Bedrock-Haiku-Adapter (`src/lib/ai/bedrock-haiku/index.ts`)
- Summary: Production-ENV `BEDROCK_V9_HAIKU_MODEL_ID=eu.anthropic.claude-3-haiku-20240307-v1:0` (Stand 2026-06-09 in Coolify-Container `app-bwkg80w04wgccos48gcws8cs-162742787231`). Bei Versuch eines Bedrock-Calls 2026-06-09 14:17 CEST waehrend V9.1 SLC-V9.1-A MT-1 Skeleton-Validation: `ResourceNotFoundException: Access denied. This Model is marked by provider as Legacy and you have not been actively using the model in the last 30 days. Please upgrade to an active model on Amazon Bedrock`. Haiku 3.5 (`anthropic.claude-3-5-haiku-20241022-v1:0` mit und ohne `eu.` Prefix) liefert `ValidationException: The provided model identifier is invalid` in eu-central-1 — Cross-Region-Inference-Profile fuer Haiku 3.5 nicht in eu-central-1 verfuegbar. V9.1 SLC-V9.1-A MT-1 wurde mit Sonnet-4 Override-Workaround durchgefuehrt (eu.anthropic.claude-sonnet-4-20250514-v1:0, F1=1.000 erreicht, 0.0164 EUR Total).
- Impact: V9 production Pre-Filter-Worker (`handle-pre-filter-job.ts`) ist beim naechsten realen .mbox-Upload broken — Bedrock-Call wirft ResourceNotFoundException, Worker setzt `email_bulk_run.status='failed'` + `failure_reason='haiku_pre_filter_error: Access denied. This Model is marked by provider as Legacy...'`. Cost-Audit-Trail bleibt funktional (try/catch in cost-ledger-INSERT). User-sichtbar: V9-Pre-Filter-Pipeline ist defacto deaktiviert bis V9-Side-Track-Fix.
- Workaround: Coolify-ENV `BEDROCK_V9_HAIKU_MODEL_ID` auf production-aktives Modell umstellen: entweder (a) Sonnet 4 als kurzfristiger Workaround (`eu.anthropic.claude-sonnet-4-20250514-v1:0`, ~10x Cost vs Haiku 3 aber hoechste Quality) oder (b) Haiku 3.5 via cross-region-Inference-Profile (us.anthropic.claude-3-5-haiku-20241022-v1:0 — verletzt aber data-residency.md eu-only-Pflicht), oder (c) AWS-Bedrock-Console "Activate Model" auf Haiku 3 erneut anfordern (~24h Approval).
- Next Action: V9-Side-Track-IMP: (1) AWS-Bedrock-Console pruefen ob Haiku 3 reaktivierbar oder Haiku 3.5 EU-Cross-Region freischaltbar, (2) Coolify-ENV update, (3) V9-DEC fuer Long-Term-Model-Choice (Sonnet-4 vs Haiku 3.5 mit US-Region-Drift-TIA). NICHT V9.1-blocking (V9.1 Skeleton-Validation lief mit Sonnet 4 Override). Diskovery durch V9.1 SLC-V9.1-A MT-1 Live-Run 2026-06-09.

### ISSUE-092 — V9 SLC-167 Migrations-Luecke: ai_cost_ledger.role + ai_jobs.job_type CHECK fehlen 'email_bulk_pattern_extraction' + 'email_bulk_pattern_extract'
- Status: resolved (2026-06-05 ~16:55 UTC via Migration 111 / MIG-056 LIVE-applied auf Coolify-Postgres `supabase-db-bwkg80w04wgccos48gcws8cs-162742842423`. ai_cost_ledger_role_check jetzt 19 Werte incl. 'email_bulk_pattern_extraction'. ai_jobs_job_type_check jetzt 19 Werte incl. 'email_bulk_pattern_extract'. RPT-422 /post-launch V9 T+immediate Discovery.)
- Severity: High
- Area: V9 SLC-167 Pattern-Extraktion (FEAT-073) — Migrations-Bundle 106-110
- Summary: SLC-167 fuehrt zwei neue CHECK-Werte ein (per L-V9-7 / IMP-1055 Asymmetrie): `ai_jobs.job_type = 'email_bulk_pattern_extract'` (ohne -tion-Suffix, im `startPatternExtraction` Server-Action) und `ai_cost_ledger.role = 'email_bulk_pattern_extraction'` (mit -tion-Suffix, im `handle-pattern-extraction-job.ts`). Migrations 107 + 108 + 109 + 110 fuegten BEIDE Werte NICHT zur CHECK-Constraint hinzu — Migration-Luecke. RPT-417 Gesamt-/qa Verdict war PASS-WITH-LOW-DEFERRED-LIVE OHNE diese DB-vs-Code-Cross-Verifikation. Discovery durch /post-launch V9 T+immediate ai_cost_ledger Live-Schema-Check vs Code-Constants.
- Impact: (a) `INSERT INTO ai_jobs (job_type='email_bulk_pattern_extract')` in `startPatternExtraction` (SLC-167 MT-4) wuerde mit CHECK-VIOLATION fehlschlagen → **Pattern-Extraction-Pipeline BLOCKED** ab Curation-Finish bis Hotfix. (b) `INSERT INTO ai_cost_ledger (role='email_bulk_pattern_extraction')` in `handle-pattern-extraction-job.ts:532-543` wuerde mit CHECK-VIOLATION fehlschlagen → **non-fatal try/catch, Pipeline laeuft technisch durch**, ABER Cost-Audit-Trail fuer Sonnet-Calls broken + vw_bulk_email_cost_monthly unterzaehlt Sonnet-Datenpunkte + DSGVO/Compliance-Audit-Trail unvollstaendig.
- Workaround: Keine — Hotfix-Migration 111 sofort applied in derselben /post-launch Session.
- Next Action: Resolved per Migration 111. Pre-existing pre-Apply-Check: 0 Pattern-Extraction-Runs in Production (kein Daten-Verlust). Cross-Repo IMP-Pflicht: `/qa` Gesamt-Verdict muss DB-vs-Code Cross-Verifikation aller neuen CHECK-Werte erzwingen (separater Dev-System-IMP geplant).

### ISSUE-091 — V9 SLC-168 Source-Attribution Visual-Polish: knowledge_unit.body wird im Handbuch-Reader single-line gerendert
- Status: resolved (2026-06-06 via Fix in `src/workers/handbook/sections.ts` `renderKnowledgeUnitsList`: Branch auf `ku.source === 'email_bulk'` → Multi-Line-Pass-through ohne `.split("\n").join(" ")`-Flatten + ohne `escapeMd` + 2-space-Prefix pro non-empty Zeile. Source-Attribution-Block (`---`-Trenner + 4 Bold-Label-Zeilen + Link) bleibt im Reader als block-getrennt sichtbar. 2 neue Vitest in `src/workers/handbook/__tests__/renderer.test.ts` — email_bulk multi-line render + non-email_bulk single-line Anti-Regression. 17/17 renderer.test.ts GREEN, TSC 0 errors auf geaenderte Files, ESLint 0/0. Fix als V9.1-Vorbereitungs-Polish-Step parallel zum V9.0 T+24h-Burn-In-Wartezeit-Fenster durchgefuehrt — ohne eigenen Slice, ohne Migration, ohne Coolify-Redeploy noetig weil Worker-Code-only Change beim naechsten Worker-Start wirksam.)
- Severity: Low
- Area: V9 SLC-168 MT-1 Path-A-Lite (DEC-193) — `src/lib/bulk-email/handbook-import.ts` `renderSourceAttributionMarkdown` Output-Form vs `src/workers/handbook/sections.ts:542` `renderKnowledgeUnitsList`
- Summary: Path-A-Lite (DEC-193) waehlt knowledge_unit-INSERT mit Source-Attribution als Multi-Line-Markdown-Block im body-Feld (Datum + Confidence + Pseudonym-Hinweis + Run-Link, getrennt durch `---` Horizontal-Rule). Worker-Renderer `renderKnowledgeUnitsList` macht beim Render `ku.body.trim().split("\n").join(" ")` → alle Zeilenumbrueche werden zu Leerzeichen. `escapeMd` (sections.ts:648) escaped NUR `|`, also Bold/Italic/Link rendern korrekt. Konsequenz: Source-Attribution-Block erscheint im Reader-Markdown-Render als single-line inline-Text statt block-formatiert. `---` Horizontal-Rule wird zu inline-Plain-Text (kein HR-Block). Bold-Felder + klickbarer Link bleiben funktional erhalten.
- Impact: Visual-Polish im Handbuch-Reader. Source-Attribution-Info ist vollstaendig sichtbar und der "Quelle ansehen"-Link bleibt klickbar (escapeMd hat keinen Effekt auf `[Link](url)`-Syntax). Founder sieht alle Felder, aber als verlaengerte Bullet-Zeile statt als block-getrenntem Quote-Block. Nicht release-blockierend, aber Visual-Polish-Carry-Over zu V9.1+.
- Workaround: Aktueller Markdown-Output ist funktional. Founder kann via Bulk-Run-Detail-Page (`/dashboard/bulk-email-import/<id>`) oder Admin-Audit-View (`/admin/audit/bulk-email`) alternativ direkt navigieren.
- Next Action: V9.1+ Renderer-Erweiterung: `renderKnowledgeUnitsList` differenziert auf `ku.source` = `'email_bulk'` → Multi-Line-Body-Pass-through ohne `.split("\n").join(" ")`-Flatten (mit Indentation-Korrektur via 2-space-Prefix pro Line). Alternativ: Worker-Renderer-Branch fuer email_bulk-Source mit Block-Quote-Markdown-Render. Schaetzung ~30-45min Code-Side + Vitest. Backlog-Kandidat BL-XXX V9.1+ Polish-Slice.
- Quelle: /qa SLC-168 RPT-416 L-1 — Worker-Render-Pfad-Verifikation in /qa entdeckt (zu Pre-MT-1 in DEC-193 nicht verifiziert). Cross-Reference: Dev-System IMP-1076 "Wenn DEC 0 Worker-Aenderung behauptet, muss Render-Pfad VOR DEC-Entscheidung verifiziert werden".

### ISSUE-090 — V9 vw_bulk_email_cost_monthly View ohne security_invoker (RLS-Bypass, MIG-051/106-Erbe)
- Status: resolved
- Resolution Date: 2026-06-04
- Resolution Slice: V9 SLC-167 MT-1 — MIG-054/109 LIVE
- Severity: High
- Area: V9 SLC-165 MT-2b / MIG-051/106 sql/migrations/106_v9_bulk_email_schema.sql Lines 451-459
- Resolution: MIG-054/109 (Migration 109) drop+recreate die View mit `WITH (security_invoker = true)` + getypten Output-Spalten (::date, ::numeric(12,4), ::integer). Tenant_admin-Caller sehen ab jetzt nur eigene Tenant-Monats-Summen via RLS-Inheritance aus email_bulk_run; service_role bleibt Cross-Tenant via BYPASSRLS. LIVE-applied auf Coolify-DB 2026-06-04. Vitest gegen Coolify-DB 7/7 PASS (3 Schema-Existence inkl. security_invoker-Reloption-Check + 4 Aggregation-Tests).
- Summary: Die View `vw_bulk_email_cost_monthly` wurde in MIG-051/106 angelegt mit `CREATE OR REPLACE VIEW ... AS SELECT ...` ohne `WITH (security_invoker = true)`. Default in PostgreSQL: View laeuft mit Owner-Privilegien (View wurde via `psql -U postgres` erstellt → Owner = postgres = Superuser = BYPASSRLS). Tenant-Admin-User haetten via SELECT auf der View Cross-Tenant-Cost-Aggregat-Daten gesehen (Tenant-A's Pre-Filter+Pattern-Cost in Tenant-B's Cockpit sichtbar).
- Impact: Cross-Tenant-Cost-Leak-Potenzial. Realer Impact: gering, weil bis SLC-167 MT-1 noch kein Production-Code aus der View liest (Cost-Cap-Service in MT-3 ist der erste Konsument, und Cron-/Audit-Lese-Jobs nutzen service_role). Aber RLS-Bypass haette mit MT-3 sofort live geschnipsteten Cross-Tenant-Leak gehabt.
- Quelle: SLC-167 MT-1 Pre-Migration-Inspection 2026-06-04 — `\d+` zeigte alte View ohne Options-Block. Sicherheitsrelevant genug fuer Pre-MT-3-Hotfix.

### ISSUE-089 — V9 SLC-165 MT-5 Worker re-validiert `storage_path` nicht gegen `${tenant_id}/`-Prefix (Defense-in-depth-Luecke)
- Status: resolved
- Resolution Date: 2026-06-02
- Resolution Slice: V9 SLC-165 MT-5 Mini-Fix-Bundle (post-/qa MT-6)
- Severity: Low
- Area: V9 SLC-165 MT-5 / src/workers/bulk-email/handle-parse-job.ts
- Resolution: Defense-in-depth Validation in `executeEmailBulkParse` zwischen Bulk-Run-Load und Status-Skip-Check eingebaut: `if (!run.storage_path.startsWith(`${run.tenant_id}/`)) throw new Error(...)`. Fired BEFORE jeder State-Change (kein status='parsing', kein storage download, kein rpc_complete). 1 neuer Vitest-Case "throws when storage_path lacks the tenant_id prefix (ISSUE-089)" verifiziert Defense + Absenz aller Side-Effects. TSC + ESLint EXIT=0, MT-5-Suite 13/13 GREEN (11 baseline + 2 neue).
- Summary: `executeEmailBulkParse` liest `run.storage_path` aus DB-Load und uebergibt direkt an `admin.storage.from("bulk-email").download(path)`. Annahme: MT-4-Caller hat den Path mit `${tenant_id}/`-Prefix gebaut. Worker selbst validiert das nicht.
- Impact: Wenn ein zukuenftiger Bug in MT-4-Caller, direkter DB-INSERT durch Admin-Operations oder eine zukuenftige Migration einen `storage_path` ohne tenant_id-Prefix erzeugt, koennte der Worker via service_role eine Datei eines anderen Tenants laden. Defense-in-depth fehlt im Worker-Code selbst.
- Quelle: RPT-386 Finding F-2; Bewertung RPT-388; Resolution Mini-Fix-Bundle nach RPT-388.

### ISSUE-088 — V9 SLC-165 MT-5 rpc_complete_ai_job ohne Error-Check auf Status-Skip-Pfad
- Status: resolved
- Resolution Date: 2026-06-02
- Resolution Slice: V9 SLC-165 MT-5 Mini-Fix-Bundle (post-/qa MT-6)
- Severity: Low
- Area: V9 SLC-165 MT-5 / src/workers/bulk-email/handle-parse-job.ts
- Resolution: Error-Check + Re-Throw im Status-Skip-Branch analog zum Happy-Path eingebaut (`const { error: skipCompleteError } = await adminClient.rpc(...); if (skipCompleteError) throw new Error(...)`). 1 neuer Vitest-Case "throws when rpc_complete_ai_job fails on status-skip path (ISSUE-088)" verifiziert Re-Throw + Absenz unintended Side-Effects. TSC + ESLint EXIT=0, MT-5-Suite 13/13 GREEN.
- Summary: Im Status-Skip-Branch (bulk_run.status != 'uploaded') wurde `adminClient.rpc("rpc_complete_ai_job", { p_job_id: job.id })` ohne Error-Check aufgerufen. Im Happy-Path war derselbe RPC explizit error-checked + re-throwt. Asymmetrie zwischen den Branches.
- Impact: Wenn rpc_complete_ai_job auf dem Skip-Pfad fehlschlaegt, bleibt der ai_job in pending-Status. Round-Robin pickt ihn wieder auf, hit gleichen Skip-Pfad, repeat. Self-healing aber Log-Spam und unsichtbare Worker-Schleife.
- Quelle: RPT-386 Finding F-1; Bewertung RPT-388; Resolution Mini-Fix-Bundle nach RPT-388.

### ISSUE-087 — V9 SLC-165 MT-4 Next.js Server-Action `bodySizeLimit` nicht konfiguriert — alle Upload-Files >1 MB scheitern an HTTP-Pipeline
- Status: resolved
- Resolution Date: 2026-06-02
- Resolution Slice: V9 SLC-165 MT-4-hotfix
- Severity: High
- Area: V9 SLC-165 MT-4 / next.config.ts + src/app/dashboard/bulk-email-import/actions.ts
- Resolution: MT-4-hotfix 2026-06-02. `next.config.ts` um `experimental: { serverActions: { bodySizeLimit: "500mb" } }` erweitert (matched `MAX_FILE_SIZE_BYTES` aus helpers.ts und Storage-Bucket file_size_limit aus Migration 106). Verifikation: TSC `--noEmit` EXIT=0, ESLint EXIT=0, `next build` zeigt "Experiments (use with caution): serverActions" + "Compiled successfully in 12.3s" — Config wird von Next.js erkannt. Page-Data-Collection bricht offline ab wegen Missing-SUPABASE_URL (pre-existing env-condition, kein Hotfix-Regress).
- Summary: `next.config.ts` enthielt keinen `experimental.serverActions.bodySizeLimit`-Eintrag. Next.js Default = 1 MB. UI akzeptiert Files bis 500 MB (`MAX_FILE_SIZE_BYTES = 524288000` in helpers.ts), Storage-Bucket hard-capt auf 500 MB (Migration 106 Line 475), Action `uploadBulkEmailRun` ist auf 500 MB ausgelegt — aber Next.js wirft `Body exceeded 1mb limit` an der HTTP-Body-Pipeline, BEVOR der Server-Action-Handler aufgerufen wird.
- Impact: Gmail-Takeout-`.mbox` (typisch 100 MB - GB) + viele `.eml` (oft 2-5 MB) waren faktisch nicht hochladbar. Vitest 17/17 PASS erfassen das nicht, weil sie die Action-Funktion direkt aufrufen und die HTTP-Pipeline umgehen.
- Caveat: 500 MB Body-Buffering im App-Container belastet RAM. Bei mehreren parallelen Uploads moegliches OOM-Risiko. Akzeptabel fuer V9.0 (Single-User-Upload-Cadence), aber Stream-Threshold + chunked-Upload als V9.1+ Backlog-Kandidat.
- Related: RPT-384 (QA-Finding F-1), SLC-165 MT-4, FEAT-070, AC-SLC-165-2, AC-SLC-165-3.
### ISSUE-088 — OP Storage-Service authenticated-Role INSERT/UPDATE/DELETE failed mit `relation "objects" does not exist` (Storage-Knex-Pool search_path-Drift)
- Status: open
- Severity: Low (no production-path affected — Code-Audit 2026-06-04 bestaetigt: alle 13 Storage-Calls in `src/` laufen ueber `createAdminClient()` = service_role; einziger client-side Upload-Pfad `FileUploadZone.tsx` ruft Server-Route `/api/capture/.../evidence/upload` via `fetch()` auf, kein direkter Storage-Call. Defense-only, kein User-Impact.)
- Area: Storage-Service v1.11.13 / Knex-Pool / Postgres search_path / `SET LOCAL ROLE authenticated`
- Discovery: 2026-06-03 waehrend V8.0.2 SLC-169 Live-Smoke (MT-4) nach MIG-109 + MIG-110 Apply. Vorher verdeckt durch ISSUE-087 GRANT-Bug (HTTP 400 mit "row-level security policy"-Cast aus 42501 GRANT-Check).
- Summary: Storage-Service v1.11.13 Knex-Pool verbindet als `supabase_storage_admin`, macht pro Request `SET LOCAL ROLE authenticated` + JWT-Claims-Setup. Beim Wechsel zu `authenticated` wird der search_path auf den authenticated-Default zurueckgesetzt — und enthaelt **kein** `storage`-Schema. INSERT-Query nutzt unqualifiziertes `objects` → PostgreSQL `42P01 relation does not exist`. **BS hat das Problem NICHT** — vermutlich aufgrund subtiler Konfigurations-Differenz im pg-Login-Path (BS hat keine `supabase_storage_admin`-rolconfig + keinen invalid DB-Level-search_path-Eintrag). OP MIG-110 (ALTER ROLE authenticated SET search_path = storage, public) wirkt beim Storage-Knex-Pool nicht — Postgres applied ALTER-ROLE-Config nur beim LOGIN, nicht beim `SET LOCAL ROLE`.
- Impact: KEIN Produktions-Impact bestaetigt durch Code-Audit 2026-06-04. Alle 13 OP-Storage-Calls in `src/` nutzen `adminClient = createAdminClient()` = service_role-Pool (handle-snapshot-job UPLOAD, evidence/upload UPLOAD+REMOVE, walkthrough-cleanup REMOVE × 2, alle 9 DOWNLOAD/createSignedUrl-Calls). Der einzige client-side Upload-Pfad (`FileUploadZone.tsx` in `src/app/capture/[sessionId]/block/[blockKey]/evidence/`) ruft `/api/capture/${sessionId}/evidence/upload` per `fetch()` auf — Server-Action-Proxy-Pattern, nicht direkt zum Storage. service_role-Pool ist nicht betroffen vom search_path-Drift (laeuft als `supabase_storage_admin` ohne ROLE-Switch).
- Reproducer: SLC-169-Live-Smoke 2026-06-03 — authenticated-JWT INSERT auf `evidence/<uuid>/test.txt` → HTTP 500 mit "objects does not exist". service_role-JWT INSERT auf gleichen Pfad → HTTP 200. Reproducer bleibt valide, aber kein Produktions-Code-Pfad triggert ihn.
- Workaround: KEIN Workaround notwendig — service_role-Architektur ist bereits sauber. Pattern fuer kuenftige client-side Uploads: weiterhin Server-Action-Proxy nutzen (Pattern aus `evidence/upload`), nicht direkter supabase-js storage.upload mit User-JWT.
- Next Action: V8.0.3 Hotfix-Slice DEFERRED bis V8.14 (Container-Upgrade Storage v1.44.2 loest Verhalten vermutlich auch). Kein Hotfix-Bedarf. Defense-only-Hinweis: NEUE Features muessen Pattern `Server-Action-Proxy mit service_role` halten — direkter Browser-supabase.storage.upload-Call ist verboten bis V8.14.
- Audit-Belege: Code-Audit 2026-06-04 via `grep -rn "storage\.from(" src/` und Cross-Check `createBrowserClient`-Komponenten + FileUploadZone-Inspektion. Detail-Liste: 5 echte Calls (3 in Comments) — 4 × `adminClient.storage`, 1 × `supabase.storage` in `cron/walkthrough-cleanup/route.ts` wo `supabase = createAdminClient()`. Erweiterte Suche `\.storage\.from(` zeigt 13 Treffer ueber 8 Files, alle adminClient.
- Related: V8.0.2 SLC-169 MT-4 Live-Smoke, V8.0.2 MIG-109 (GRANT-Fix erfolgreich), V8.0.2 MIG-110 (search_path-Defense, ohne Effekt fuer Storage-Service-Pool), BS V8.13 SLC-894 RPT-574 (Cross-Repo-Vorlage), V8.14 Container-Upgrade-Plan.

### ISSUE-087 — OP Storage-Schema GRANTs fehlen fuer authenticated+anon (Cross-Repo BS-V8.13-ISSUE-088-Pendant) [RESOLVED 2026-06-03]
- Status: resolved
- Resolution Date: 2026-06-03
- Resolution Slice: V8.0.2 SLC-169
- Severity: High (PRE-CUSTOMER-LIVE PFLICHT — Cross-Repo-Symmetrie zu BS V8.13)
- Area: Storage-Schema GRANTs / Self-Hosted Container-Versions-Drift v1.11.13
- Resolution: V8.0.2 SLC-169 (2026-06-03). MIG-109 `109_v802_storage_schema_grants.sql` idempotent applied via SSH+base64+psql als `postgres`-Superuser. Setzt fuer `authenticated`+`anon`: GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA storage (5 Tables × 4 Privileges = 20 Rows je Rolle) + GRANT USAGE,SELECT ON ALL SEQUENCES + 4 ALTER DEFAULT PRIVILEGES + NOTIFY pgrst. Pre-Apply-Audit zeigte authenticated+anon hatten NUR SELECT auf 2 unwichtige s3_-Tables (s3_multipart_uploads + s3_multipart_uploads_parts), 0 GRANTs auf buckets/migrations/objects → OP war **schlimmer betroffen als BS** (BS hatte vor MIG-043 SELECT auf alle 5 Tables). Post-Apply-Verify: authenticated+anon haben je 20 CRUD-Privileges, pg_default_acl 4 Eintraege, 18 bestehende storage.objects-RLS-Policies unangetastet. Vitest 5/5 PASS in 39ms gegen Coolify-DB-Sidecar (node:20 im strategaize-net). Live-Smoke-Beweis: LIST evidence via authenticated-JWT kommt in RLS-Layer (HTTP 400 mit "row-level security policy" Body, vorher waere es 42501 GRANT-Check-Fail gewesen). Storage v1.11.13 castet 42501 zu Misleading-RLS-Body — Echte Wurzel war GRANT-Check, nicht RLS-Policy-Eval. Cross-Repo-Mirror via `c:/strategaize/strategaize-business-system/docs/CROSS_REPO_V813_STORAGE_GRANTS.md` 1:1 portiert.
- Summary: OP `authenticated`+`anon` Rollen hatten fehlende Default-Supabase-GRANTs auf `storage.*`-Tabellen wegen alter Container-Version (Storage v1.11.13 + GoTrue v2.160). Storage v1.44+ setzt diese Init-Script-seitig — IS+ImSch betroffen waren daher nicht. Cross-Repo-symmetrischer Bug zu BS V8.13 ISSUE-088. OP war schlimmer betroffen (KEINE GRANTs vs BS nur-SELECT-vorher).
- Impact: Vor Fix waren alle Storage-Operationen mit authenticated-JWT-Session broken (42501 als RLS-Body verkleidet). Nach Fix passt GRANT-Check, aber Storage-Service-Knex-Pool hat separaten search_path-Drift → siehe [[ISSUE-088]] OP fuer Folge-Bug.
- Reports: V8.0.2 SLC-169 /backend (PARTIAL-SUCCESS — GRANT-Fix complete, search_path-Drift als ISSUE-088 separater Slice), Cross-Repo-Doc BS V8.13 SLC-894 RPT-574.

### ISSUE-086 — V8.1 Partner-Organization-Lookup verwendet falsches Schema (capture_session.partner_organization_id existiert nicht) + verdeckter Bug B (partner_organization.name existiert nicht)
- Status: resolved
- Resolution Date: 2026-06-01
- Resolution Slice: V8.1.1 SLC-164
- Severity: High
- Area: V8.1 SLC-163 / src/app/strategaize-anfrage/route.ts + src/app/dashboard/diagnose/[capture_session_id]/bericht/actions.ts
- Resolution: V8.1.1 SLC-164 (2026-06-01). Beim Pre-Fix-Code-Audit zweiter Bug aufgedeckt: `partner_organization.name` existiert ebenfalls nicht — Schema kennt nur `legal_name` + `display_name`. Bug B war durch Bug A maskiert (Lookup-Fail -> partner=null -> Fallback "Unbekannter Partner"). Fix: Helper `resolvePartnerForCaptureSession(admin, { tenant_id })` in `src/lib/cta/resolve-partner.ts` extrahiert (Pattern aus V7.2 `sendDiagnoseReportByEmail` lines 158-167 wiederverwendet). 4 Call-Sites umgestellt: (a) `src/app/strategaize-anfrage/route.ts` MT-7, (b) `triggerStrategaizeFreigabe` MT-9, (c) PDF-Magic-Link-Embedding in `sendDiagnoseReportByEmail`, (d) PDF-Magic-Link-Embedding in `downloadMandantenReportV2Pdf`. Helper-Vitest 5 Mock + 3 Live-DB-gated grün. Quality-Gates: tsc=0, eslint=0, 58 SLC-164-relevante Vitest grün, 0 Regression.
- Summary: V8.1-Code (route.ts + actions.ts) liest `session.partner_organization_id` direkt. Diese Spalte existiert nicht im Schema. Schema-Wahrheit: capture_session.tenant_id -> tenants.id (mandant-tenant) -> tenants.parent_partner_tenant_id -> tenants.id (partner-tenant) -> partner_organization.tenant_id (1:1). Effekt: `partner_organization_id` im Token-Payload bleibt leerer String. Im Endpoint faellt der Partner-Lookup auf token.payload.partner_organization_id zurueck (auch leer) -> partner-Row nicht gefunden -> StB-Notification silent-skip mit reason='no_email'. BD-Email geht trotzdem raus (BD-Email-Empfaenger kommt aus STRATEGAIZE_BD_EMAIL-ENV).
- Impact: Web-CTA und PDF-Magic-Link-CTA fuehren zu BD-Email-Send + Flag-Flip + Bestaetigungs-Page (alles OK), aber StB-Notification wird NIE versandt. Audit-Log zeigt `stb_skip_reason='no_email'` falsch (Bug, nicht echte leere contact_email). 2026-06-01 Smoke-Test Token-Roundtrip mit fake session-id passierte den idempotent_skip-Branch — der echte Bug triggert erst beim ersten realen Lead-Klick mit existierender capture_session.
- Related: SLC-163 MT-7 + MT-9, SLC-164 (Resolution), FEAT-068 AC-9 silent-skip, REL-027 Live-Smoke 2026-06-01, V7.2 actions.ts:158-167 (Pattern-Quelle).

### ISSUE-085 — V8.1 StB-Notification-Body steht als Mock im Code, nicht Founder-freigegeben
- Status: open
- Severity: High
- Area: V8.1 SLC-163 MT-4 / src/lib/email/v8-1/stb-notification.ts
- Summary: Die StB-Partner-Notification-Email enthaelt einen 4-Saetze-Body (Mock-Wording 2026-06-01 per User-Direktive), der noch nicht durch Founder freigegeben ist. Wir-Voice, neutral-informativ (DEC-169), audit-clean (Tonality-Audit `--scope=stb-notification` 0 Treffer).
- Impact: Kein Code-Side-Blocker fuer Master-Merge. **V8.1-Release-Blocker** — Final-Text muss vor produktivem Deploy stehen. AC-SLC-163-8 (Founder-freigegeben + Code-Kommentar-Datum) ist bis dahin nicht erfuellt.
- Workaround: Mock-Text bleibt sichtbar bis Tausch. Mock-Wording: "Wir informieren Sie ... heute den Kontakt zu Strategaize aufgenommen ... Strategaize wird sich direkt ... abstimmen ... Sie bleiben jederzeit Ansprechpartner ... bei Rueckfragen ... info@strategaize.de".
- Next Action: Founder liefert finalen 4-Saetze-Body. Tausch via 1:1-String-Replacement in `buildStbNotificationEmail` (Konstanten intro/followUp/role/contact) + Re-Run Audit + Re-Run Vitest. Aufwand ~10min wenn Text vorliegt.
- Related: SLC-163 MT-4, FEAT-068, RPT-371, AC-SLC-163-8, [[ISSUE-084]].

### ISSUE-084 — V8.1 Strategaize-Vorstellungs-Text steht als Mock im Code, nicht Founder-freigegeben
- Status: open
- Severity: High
- Area: V8.1 SLC-162 MT-3 / src/lib/pdf/mandanten-report-v2/pages/outro.tsx + src/app/dashboard/diagnose/[capture_session_id]/bericht/V8OutroSection.tsx
- Summary: V8.1-Outro Page 16 (PDF) + V8OutroSection (Web) zeigen aktuell einen Mock-Vorstellungs-Text in 2 Absaetzen Wir-Voice, der am 2026-06-01 per User-Direktive "Bitte hinterleg erstmal Mocktexte, sodass du es bauen kannst, und die werden wir dann spaeter austauschen" eingesetzt wurde. Mock-Text ist substanziell, audit-clean (0 Treffer auf Outro-Blacklist) und in beiden Distribution-Pfaden identisch — aber nicht durch Founder freigegeben.
- Impact: Kein Code-Side-Blocker fuer Master-Merge oder SLC-163-Implementation. **V8.1-Release-Blocker** — Final-Text muss vor produktivem Deploy in Coolify stehen. AC-SLC-162-7 (Founder-freigegeben + Code-Kommentar-Datum) ist bis dahin nicht erfuellt.
- Workaround: Mock-Text bleibt sichtbar bis Tausch. Strukturell passend ("Strategaize begleitet Unternehmer..."), kein Platzhalter-Marker mehr im String-Literal (per IMP-918 nur Code-Kommentar oberhalb).
- Next Action: V8.1-Pre-Release-User-Pflicht — Founder liefert finalen 2-3-Absatz-Text in Wir-Voice. Tausch via 1:1-String-Replacement in beiden Files (Konstante `STRATEGAIZE_VORSTELLUNG_PLACEHOLDER`) + Re-Run `node scripts/tonalitaet-audit-v8.mjs --scope=outro` + Re-Run Outro-Vitest. Aufwand ~10min wenn Text vorliegt.
- Related: SLC-162 MT-3, FEAT-067, RPT-369, AC-SLC-162-7, feedback_tonality_audit_safe_placeholders.md (IMP-918).

### ISSUE-083 — Partner-Mandant-Welcome (`tenant_kind='partner_client'`) hat keinen Logout-Button
- Status: resolved
- Severity: High
- Resolution: V7.5 SLC-146 (2026-05-25) — MandantHeader-Component (sticky-top, Email + Logout-Button, Touch-Target >=44px konsistent zu V7.4 DEC-151) auf 5 Mandanten-Pages eingebaut (Welcome + Diagnose-Start + Direkt-Kunden-Gate + Run + Bericht + Bericht-Pending failed/submitted). Pattern aus DashboardSidebar.handleLogout 1:1 portiert. Header rendert nicht fuer strategaize_admin (dort AdminDemoBanner mit Zurueck-Link).
- Area: V6 / SLC-103 MT-7 Partner-Mandant-Branch / src/app/dashboard/page.tsx
- Summary: User-Befund 2026-05-24 (Live auf `https://onboarding.strategaizetransition.com/dashboard` als Partner-Mandant "Privat" unter "QA Steuerberater Demo"). Die schlanke Welcome-Page fuer partner_client-Tenants nutzt den `DashboardClient`-Wrapper nicht und hat damit keine `DashboardSidebar`. Die existierende `logout()`-Server-Action aus `src/app/login/actions.ts:47` wird in `DashboardSidebar.tsx:202-208` nur in Direct-Client/Employee-Flows aufgerufen. Mandant sieht nur Welcome + Diagnose-Karten + Footer (Datenschutz/Impressum/Branding) — **kein sichtbarer Weg zum Abmelden**.
- Impact: Compliance-/UX-Bug. Mandant muss F12-Cookies-Loeschen oder andere Workarounds nutzen. ISO27001-/DSGVO-relevant fuer ersten echten Pilot-Partner-Onboarding. Auch auf Folge-Pages (Diagnose-Start, Run, Bericht) vermutlich gleiche Luecke — muss in BL-122-Scope verifiziert werden.
- Workaround: F12 → Application → Cookies → alle `sb-...`-Cookies fuer `onboarding.strategaizetransition.com` loeschen → Reload → landet auf `/login`. Oder Inkognito-Tab schliessen.
- Next Action: BL-122 V7.5 implementieren — minimaler User-Header (Email + Logout-Button rechts oben) auf partner_client-Welcome + Verifikation auf Diagnose-Folge-Pages. Logout-Pattern 1:1 aus `dashboard-sidebar.tsx` portieren. Touch-Target >=44px konsistent zu V7.4 DEC-151. Aufwand ~1-2h.
- Related: BL-122, V6 SLC-103, V6 SLC-104 (Partner-Branding), feedback_user_facing_scope_edit_capability_required.md (User-Direktive 2026-05-20: User-Facing-Features brauchen vollstaendige UX schon in V1).

### ISSUE-082 — Verify-Signup-ErrorPage rendert eigenes Inline-Footer + Custom-styled "Zur Anmeldung"-Link h=36 (Touch-Target-Violation Mobile)
- Status: resolved
- Resolution Date: 2026-05-28
- Resolution Slice: V7.7 SLC-147 MT-1
- Severity: Low
- Area: V7 / Auth / src/app/auth/verify-signup/_components/
- Resolution: V7.7 SLC-147 MT-1 (2026-05-28). Pre-Audit-Korrektur: nicht nur ErrorPage, auch InvalidLinkPage hatte das Custom-Link-Pattern + alle 3 ErrorPage-Komponenten (ErrorPage, InvalidLinkPage, ExpiredLinkPage) hatten den Inline-Footer-Duplikat. Fix: (a) Custom-styled `<Link>` durch `<Button asChild className="w-full"><Link>` ersetzt in ErrorPage.tsx + InvalidLinkPage.tsx — shadcn-Button-Default-Size = h-11 (44px DEC-151), Default-Variant = brand-primary-Gradient konsistent zu Login-Submit-Button. (b) Inline-Footer-Div (Datenschutz + Impressum) entfernt in allen 3 Components — StrategaizePoweredFooter rendert ohnehin global via app/layout.tsx. (c) ExpiredLinkPage.tsx: nicht mehr benoetigter `Link`-Import entfernt. Commit: e77edca auf branch slc-147-v77-polish. Quality-Gates: tsc + ESLint EXIT=0.
- Summary: V7.4 SLC-143 MT-1 Pre-Audit (RPT-342) hat aufgedeckt, dass `/auth/verify-signup`-ErrorPage-State (z.B. bei dummy-token-Render) zwei Probleme zeigt: (1) ein Custom-styled `<a href="/login">Zur Anmeldung</a>` mit Tailwind-Klassen die wie shadcn-Button aussehen, h=36px Mobile, sub-44px-Tap-Area; (2) eigener Inline-Footer mit "Datenschutz" + "Impressum"-Links h=16 — Duplikat zum globalen StrategaizePoweredFooter (insgesamt 2x Datenschutz-Link sichtbar).
- Related: RPT-342, FEAT-062, IMP-774 (Dev-System Skill-Improvement zu Audit-Coverage-Erweiterung), SLC-147 (Resolution-Slice)

### ISSUE-081 — V6 Migration 090 Architecture-Drift: 4 in ARCHITECTURE.md vorausgesetzte Helper-Objekte wurden nie erstellt
- Status: resolved
- Resolution Date: 2026-05-20
- Severity: Medium
- Area: V6 / Migration 090 / RLS-Helper / docs/ARCHITECTURE.md
- Summary: Pre-Migration-Check beim Start von SLC-136 (V7.1) 2026-05-20 hat aufgedeckt, dass die in ARCHITECTURE.md V6+V7 vorausgesetzten Helper-Objekte (`is_strategaize_admin(uuid) -> boolean`, View `partner_admin_view (user_id, partner_org_id)`, View `tenant_to_partner_view (tenant_id, partner_org_id)`, Function `current_tenant_id() -> uuid`) in der Production-DB nicht existieren. Migration 090 (`090_v6_partner_tenant_foundation.sql`) hat sie nicht angelegt. Bestehend waren stattdessen `auth.user_role()` + `auth.user_tenant_id()` aus Blueprint-V3.4-Erbschaft. V6 + V7-Code hat das Architecture-Doku-Gap nicht ausgeloest, weil die V6/V7-Policies direkt auf `auth.user_role()`-Inline-Patterns geschrieben waren — Drift erst beim V7.1-SLC-136-Migration-Check sichtbar.
- Impact: SLC-136 Migration 101 wuerde mit "function is_strategaize_admin does not exist" crashen, da Policies explizit auf diese Helper-Names verweisen (ARCHITECTURE.md V7.1-Section). SLC-138 + SLC-139 spaeter ebenfalls. Risiko: stille Architecture-Doku-Drift, weil V6-Code-Patterns andere Namen verwenden als V7.1-Architecture-Doku.
- Resolution: Per DEC-149 (User-Bestaetigung 2026-05-20) wurde Option A gewaehlt: Helper-Praeambel in Migration 101 (MIG-044) nachgezogen. 4 Objekte als idempotente CREATE OR REPLACE FUNCTION/VIEW angelegt. SLC-138 + SLC-139 nutzen die Helper wieder, statt das Pattern dort zu duplizieren. Architecture-Doku bleibt unveraendert weil Realitaet jetzt mit Doku uebereinstimmt.
- Next Action: Keine — Resolution per DEC-149. Optional zukuenftig: Pre-Migration-Check-Skript automatisieren (siehe IMP-Backlog).
- Related: DEC-149, MIG-044, ARCHITECTURE.md V7.1-Section Zeile 6549+

### ISSUE-080 — OP SMTP_PASS Drift: V7-Self-Signup-Mails silent broken bei invaliden IONOS-Credentials
- Status: resolved
- Resolution Date: 2026-05-25
- Severity: High
- Area: V7 / Operations / SMTP / src/lib/email.ts
- Resolution: V7.5-Live-Verifikation 2026-05-25 via SSH + Python smtplib STARTTLS-Login gegen smtp.ionos.de:587 mit SMTP_USER + SMTP_PASS aus dem App-Container-ENV: `AUTH OK — SMTP credentials valid`. Letzter dokumentierter Fail im error_log: 2026-05-20 07:41 UTC (`Invalid login: 535 Authentication credentials invalid`) — seitdem 0 SMTP-Auth-Failures in 14d-Scan. Vermutlich SMTP_PASS in Coolify-ENV zwischenzeitlich aktualisiert. Self-Signup-Funnel End-to-End-Test (Cross-System via Intelligence-Studio-Landing) bleibt aufgeschoben fuer ersten realen Pilot-Partner-Onboarding.
- Followup: BL-Item fuer V7.6+ — SMTP-Healthcheck als Coolify-Cron (taeglicher `transporter.verify()` + Audit-Log + Alert bei 535-Errors). Verhindert kuenftige Silent-Drifts.
- Summary: 2026-05-20 im SLC-700 Cross-System Live-Smoke entdeckt (IS RPT-219 F-1). OP-Coolify-ENV `SMTP_PASS` war gegenueber IONOS invalid. Symptom: Insert-Pfad (pending_signup-Row) funktioniert, OP returnt 202 fuer den IS-Caller — aber Mail-Send wirft IONOS `535 Authentication credentials invalid`, sichtbar nur in App-Logs `[api/public/signup] Invalid login: 535 ...`. Keine User-erkennbare Fehlermeldung. User bekommt Success-State auf IS-Landing ("Bitte pruefen Sie Ihren Posteingang"), aber keine Mail.
- Impact: V7-Self-Signup-Funnel ist **silent broken** wenn IONOS-Passwort rotiert oder Coolify-ENV-Drift. 202-trotz-Mail-Fail ist V7-Design-Entscheidung ([src/app/api/public/signup/route.ts:417-432](src/app/api/public/signup/route.ts#L417-L432) "best-effort, 202 trotzdem bei SMTP-Fail") — sinnvoll bei temporaerem Fail, gefaehrlich bei permanentem Credential-Drift. Pre-Live-Verification per V7_LIVE_SMOKE_PLAN.md MT-5 verlangt "Smoke-Send-Test gruen" → war hier nicht produktiv-aktuell.
- Workaround: User-IONOS-Passwort-Rotation + Coolify-ENV-Update + Redeploy. In SLC-700-Live-Smoke 2026-05-20 erfolgreich angewendet (Container `app-bwkg80w04wgccos48gcws8cs-075328679729`).
- Next Action: Backlog-Item fuer **SMTP-Healthcheck-Job**: periodisch `transporter.verify()` mit Coolify-Cron, bei Fail Sentry-Alert + Audit-Log-Entry. Optional Diskussion: 202→500 konvergieren bei `sendMail`-Fail oder Re-Try-Queue mit Backoff statt Silent-Fail.
- Related: IS RPT-219 F-1, V7_LIVE_SMOKE_PLAN.md MT-5, [src/lib/email.ts:9](src/lib/email.ts#L9)

### ISSUE-079 — V7 Cross-System Self-Signup-Funnel: IS-Caller-Implementation komplett fehlt
- Status: resolved
- Resolution Date: 2026-05-20
- Resolution Slice: IS-Repo SLC-700 (Master HEAD `1970caf`) + LIVE Phase 1 PASS RPT-219
- Severity: Blocker
- Area: V7 / FEAT-053 / Cross-Repo / IS-Self-Signup-Caller
- Summary: 2026-05-19 im /qa V7 Gesamt-Lauf entdeckt (RPT-309 F-1). IS-Repo `strategaize-intelligence-studio` HEAD `a7d02de` (SLC-204 Postmark+SES Webhooks) enthaelt KEINE V7-Self-Signup-Caller-Implementation. `find /app/.next/server/app -name "route*.js" | grep -iE "signup|landing|partner"` → 0 Treffer. `https://is.strategaizetransition.com/api/landing/signup` → HTTP 404 + Next-404-Prerender. PUBLIC_SIGNUP_SERVICE_KEY ENV ist in IS-Coolify-Resource gesetzt (Pre-Smoke MT-4 verified), wird aber im IS-Code nie referenziert.
- Impact: V7-Self-Signup-Funnel war Cross-System-blocked. Der Mandant konnte nirgendwo eine IS-Landing-Page sehen oder einen Verify-Flow anstossen.
- Resolution: IS-Repo SLC-700 implementiert (Slice-Planning RPT-214, Backend RPT-215, /qa-PASS-with-deferred RPT-216, Master-Merge HEAD `1970caf`). LIVE Phase 1 PASS am 2026-05-20 verifiziert per RPT-219 mit 8/8 Pflicht-Schritten gruen: IS-Landing `/de/landing/qa-steuerberater-demo` → Form-Submit → OP `/api/public/signup` → Verify-Mail → Auto-Provisioning-Chain komplett.
- Related: RPT-309 F-1, IS RPT-219 (LIVE-Resolution), V7 OP RPT-300+302+304+306+308

### ISSUE-078 — V7 OP Proxy-Whitelist fehlt /api/public/* und /auth/verify-signup → ALL Live-Endpoints 307 zu /login
- Status: resolved
- Resolution Date: 2026-05-19
- Resolution Commit: 576f5f4 (Hotfix slc-v7-hotfix-proxy-whitelist) + b03139e (Master-Merge)
- Resolution Report: RPT-310
- Severity: Blocker
- Area: V7 / FEAT-051+052+053 / OP / src/lib/supabase/middleware.ts Whitelist
- Summary: 2026-05-19 im /qa V7 Gesamt-Lauf entdeckt (RPT-309 F-2). [src/lib/supabase/middleware.ts:47-58](src/lib/supabase/middleware.ts#L47-L58) `updateSession()` Whitelist enthaelt aktuell nur `isPublicPath` (statische Pfade), `isApiHealth`, `isApiCron`, `isApiUnsubscribe`, `isApiPartnerBranding`. Fehlt komplett: `isApiPublic` (Pattern `/api/public/*`) und `isAuthVerifySignup` (Pattern `/auth/verify-signup`). Konsequenz: 100% der V7-Public-Routen werden mit 307 zu /login redirected bevor der Route-Handler sie sieht. Reproduziert via `curl -X POST https://onboarding.strategaizetransition.com/api/public/signup` UND via `docker exec node -e fetch('http://localhost:3000/api/public/signup', { redirect: 'manual' })` — beide HTTP 307 / Location: /login. SLC-131..135 Vitest-Tests haben Bug nie entdeckt weil sie Route-Handler-Functions direkt importieren (kein HTTP-Request durch Proxy).
- Impact: Vollstaendiger Production-Outage des V7-Features sobald ISSUE-079 (IS-Caller) gefixt ist. Auch jetzt verhindert es jeden direkten Browser-Klick auf `/auth/verify-signup?token=...` — Mandant koennte nie verifizieren. **Source-Code-Bug in OP, Pflicht-Fix vor V7-Live-Deploy.**
- Workaround: Keiner — Code-Edit + Re-Deploy noetig.
- Next Action: RESOLVED — Fix in BL-111 implementiert: 2 neue Konstanten `isApiPublic = pathname.startsWith("/api/public/")` + `isAuthVerifySignup = pathname.startsWith("/auth/verify-signup")` ergaenzt, `!user`-Redirect-Bedingung erweitert. Vitest `src/lib/supabase/__tests__/middleware.test.ts` NEU mit 5 Cases (3 Whitelist-Smoke + 2 Regression-Guard). RED-GREEN-Cycle verifiziert: pre-fix 3/5 rot, post-fix 5/5 gruen. Live-Verify 2026-05-19 nach Coolify-Redeploy: POST `/api/public/signup` mit invalid-key → HTTP 401 invalid_service_key (NICHT 307). GET `/api/public/partner/:slug` → HTTP 404 vom Route-Handler. GET `/auth/verify-signup?token=X` → HTTP 200 Server-Component. Regression-Guard `/dashboard` weiterhin HTTP 307 → /login.
- Related: RPT-309 F-2 (Bug-Discovery), RPT-310 (Resolution), V7 OP RPT-300+302+304+306+308 (Slice-Vitest-Bias-Limitation), V4.3 SLC-053 RPT-134 (middleware.ts→proxy.ts Rename), Dev-System IMP-651 (Live-Endpoint-Smoke in Slice-/qa)

### ISSUE-077 — Webpack-Build-Fail durch route.ts-Helper-Exports in evidence/upload (Next 16 strict-validation)
- Status: resolved
- Resolution Date: 2026-05-28
- Resolution Slice: V7.7 SLC-147 MT-2
- Severity: Low
- Area: V7.7-Polish / Next 16 / route.ts-Validation
- Resolution: V7.7 SLC-147 MT-2 (2026-05-28). 5 Helper-Symbole (ALLOWED_MIME_TYPES, MAX_FILE_SIZE, validateMimeType, validateFileSize, sanitizeFilename) aus `src/app/api/capture/[sessionId]/evidence/upload/route.ts` in neue `src/app/api/capture/[sessionId]/evidence/upload/validation.ts` ausgelagert. `route.ts` importiert ueber `./validation`. POST-Handler unveraendert. Test-File `__tests__/upload-validation.test.ts` Import-Pfad auf `../upload/validation` umgestellt. Quality-Gates: tsc + ESLint EXIT=0, Vitest upload-validation 23/23 PASS. Commit: 147a66e auf branch slc-147-v77-polish. **Production-Verhalten unveraendert** — Coolify nutzt weiter Turbopack-Default-Build; Aenderung schliesst lokalen Webpack-Build-Gate.
- Summary: `src/app/api/capture/[sessionId]/evidence/upload/route.ts` (SLC-019, Commit 23deb56) exportiert Helper-Functions `validateMimeType`, `validateFileSize` + Constants `ALLOWED_MIME_TYPES`, `MAX_FILE_SIZE` aus einem Next.js-route.ts-File. Next 16 Webpack-Build strict-validiert route.ts-Exports und reject diese: `"validateMimeType" is not a valid Route export field. Next.js build worker exited with code: 1`. Default-Turbopack-Build (was Coolify-Production nutzt) ignoriert das und PASSES. Lokaler `next build --webpack` failt damit zuverlaessig — keine SLC-bezogene Regression, sondern pre-existing seit SLC-019. Entdeckt 2026-05-19 in OP V7 SLC-135 /backend RPT-307 F-1.
- Related: OP V7 SLC-135 RPT-307 F-1, Dev-System IMP-643 (Turbopack-Junction), Original-Commit 23deb56 (SLC-019), SLC-147 (Resolution-Slice).

### ISSUE-076 — V6.3 SLC-105 ai_cost_ledger Silent INSERT-Fail (role='light_pipeline_block' nicht in CHECK-Constraint)
- Status: resolved
- Resolved: 2026-05-17
- Severity: High
- Area: V6.3 / SLC-105 / Light-Pipeline / Cost-Ledger
- Summary: `src/workers/condensation/light-pipeline.ts:342` schreibt `role: "light_pipeline_block"` in ai_cost_ledger nach jedem Bedrock-Block-Call. CHECK-Constraint `ai_cost_ledger_role_check` (Migration 030) erlaubt diesen Wert nicht — INSERT failt mit Constraint-Violation. `captureException` schluckt den Fehler (Cost-Logging ist intentional non-fatal), Pipeline laeuft weiter, Bericht wird korrekt finalized. **Aber: AC-14 ("Bedrock-Kosten pro Run werden in ai_cost_ledger protokolliert") ist silent broken.** Im /qa-Live-Smoke 2026-05-17 entdeckt: 6/6 INSERTs in Worker-Log mit `violates check constraint`, ai_cost_ledger leer fuer Test-Tenant. Vitest-Suite konnte das nicht erkennen weil Tests gegen In-Memory-Mock-DB liefen (RPT-282 hatte L-2 korrekt auf MT-11 Live-Verify deferred).
- Impact: V6.3-Cost-Tracking war von Code-Side broken — keine Diagnose-Run-Kosten in ai_cost_ledger sichtbar. Bei Production-Lauf haetten wir 0 Cost-Insights gehabt obwohl Bedrock real Tokens verbraucht. Keine User-sichtbaren Effekte, kein UX-Bug. Audit-Trail-Luecke.
- Resolution: Migration 095 (`sql/migrations/095_v63_cost_ledger_light_pipeline_role.sql`) drop + re-create der CHECK-Constraint mit `'light_pipeline_block'` als zusaetzlich erlaubtem Wert. Live applied 2026-05-17 ~08:59 UTC via sql-migration-hetzner.md (base64 + psql -U postgres). Verifikation: `pg_get_constraintdef` zeigt erweitertes Enum, Re-Smoke produziert 6/6 ai_cost_ledger-Eintraege mit $0.022080 total — AC-14 jetzt voll erfuellt. RPT-284 dokumentiert vollstaendigen Fix-Pfad.
- Related: RPT-282 L-2 (Defer-Notiz), RPT-284 (Resolution-Pfad), MIG-039, AC-14 in SLC-105.

### ISSUE-073 — IMPRESSUM_VAT Real-Wert pending — Platzhalter "BTW-Nr. wird nachgereicht" im Einsatz
- Status: open
- Severity: Low
- Area: V6.2 / FEAT-048 / Compliance / Impressum
- Summary: Die NL-BTW-Nummer der Strategaize Transition BV ist beim V6.2-Deploy noch nicht beschafft. Bewusste Entscheidung 2026-05-16: Coolify-ENV `IMPRESSUM_VAT="BTW-Nr. wird nachgereicht"` als Platzhalter setzen, statt Code-Optionalitaet einzubauen oder /deploy zu verschieben. `/impressum` rendert sauber mit "Umsatzsteuer-Identifikationsnummer (BTW): BTW-Nr. wird nachgereicht" — fuer Internal-Test-Mode TMG/DDG-konform.
- Impact: Externe Besucher von `/impressum` sehen den Platzhalter statt der echten BTW-Nummer. Funktional kein Bug. Vor erstem echten Live-Pilot-Partner (BL-104 Anwalts-Review-Gate) muss der echte Wert gesetzt sein — sonst Compliance-Risiko.
- Workaround: Platzhalter ist live (kein Crash). Coolify-ENV-Setup-Anweisung dokumentiert diesen Wert als ueberbrueckend.
- Next Action: Sobald die NL-BTW-Nummer der Strategaize Transition BV beschafft ist, User-Aktion: Coolify-UI → bwkg80w04wgccos48gcws8cs-app-Resource → Environment Variables → `IMPRESSUM_VAT` auf echten Wert setzen → Container-Reload. Geschaetzt ~2 Min. Kein Code-Touch, kein Re-Build, kein Re-Test noetig. Danach diese ISSUE auf resolved setzen + KNOWN_ISSUES-Eintrag updaten.
- Related: RPT-273 L-3, RPT-274 L-4, RPT-275 L-1, BL-104 (Anwalts-Review)

### ISSUE-072 — V6 External-HTTPS-Routing zur App-Resource haengt (TLS klappt, Backend-Routing 504/Connection-Hang) — Multi-Network-Falle
- Status: resolved (SLC-110 MT-1 commit `2d5b488` Compose-Labels + MT-5 Coolify-Reload+Redeploy durch 2026-05-15. Live-Verifikation per /post-launch RPT-263: `docker inspect app-...092232049513` zeigt `traefik.docker.network=bwkg80w04wgccos48gcws8cs` + `traefik.http.services.app-svc.loadbalancer.server.port=3000` aktiv. App auf 2 Networks weiterhin (bwkg + strategaize-net), aber Traefik kennt jetzt explicit das richtige Routing-Interface. Extern `/login` HTTP 200 TTFB 178ms — Falle eliminiert. Image-Tag `62dddaffe6...` (HEAD-commit) live, 16/16 Container Up healthy.)
- Severity: High (war Blocker, Permanent-Fix durch SLC-110 MT-1+MT-5)
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
- Status 2026-05-18 (V7 SLC-133 Self-Signup-Pfad teilweise resolved): Beim V7 Self-Signup-Verify-Flow (siehe `src/lib/signup/auto-provision.ts`) werden `first_name` + `last_name` aus pending_signup direkt in `user_metadata` geschrieben (Schritt 2 `auth.admin.createUser({ user_metadata: { tenant_id, role, first_name, last_name }})`). Die existierende `deriveNameFromUser`-Funktion in `src/workers/lead-push/handle-job.ts:289-357` liest diese Werte sauber aus, kein Email-Local-Part-Fallback mehr fuer V7-Self-Signup-Mandanten. **V6-Bestand bleibt betroffen** (Partner-Invite-Pfad via `accept-invitation/actions.ts` setzt nur `tenant_id` + `role` in user_metadata, KEIN first_name/last_name) — Schema-Migration-Variante aus "Next Action" oben als V7.1-Optional-Backfill weiterhin offen, dann auch fuer V6-Bestand sauber.

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
- Status: resolved (Code-Side komplett 2026-05-15. SLC-110 MT-3 commit `dae24ff` cached `resolveBrandingForTenant` per React `cache()`. F-110-H1 Wiring-Gap aus RPT-261 mit commit `2bc8625` geschlossen — `src/lib/supabase/server.ts` `createClient` ist jetzt ebenfalls mit `cache()` gewrappt, sodass Layout und Page dieselbe SupabaseClient-Instanz erhalten und die Object.is-Args-Memoization in `resolveBrandingForTenant` korrekt greift. Smoke `src/lib/supabase/__tests__/server-cache.test.ts` 1/1 PASS, Branding-Resolver-Tests 12/12 PASS (keine Regression). Live-Empirie pending MT-5 Coolify-Redeploy — Network-Tab muss genau 1x `rpc_get_branding_for_tenant` pro Request zeigen.)
- Severity: Low (Original-Performance-Impact ~5-10ms ohne User-Effekt)
- Area: V6 / SLC-104 MT-9 / Performance / Branding-Resolver
- Summary: Pro `/dashboard`-Request bei Mandanten ruft `src/app/layout.tsx:21` `resolveBrandingForCurrentRequest()` (→ `resolveBrandingForTenant`) auf, und `src/app/dashboard/page.tsx:71-74` ruft `resolveBrandingForTenant` erneut mit derselben tenant_id auf. Ergebnis: 2 identische RPC-Calls + 2 `rpc_get_branding_for_tenant`-Auswertungen pro Page-Load.
- Impact: Performance-Overhead von ~5-10ms pro Request. Bei Skalierung (~10-100 Mandanten/Partner, ~3-10 Page-Loads/Tag/Mandant) tragbar, aber unnoetig. RPC + Postgres im selben Docker-Netzwerk, kein User-sichtbarer Verzoegerungs-Effekt.
- Workaround: Keiner noetig — Funktion ist korrekt, nur doppelt evaluiert.
- Resolution: Zwei-stufige Behebung. (1) SLC-110 MT-3 commit `dae24ff`: `resolveBrandingForTenant` in `src/lib/branding/resolve.ts` mit React `cache()` gewrappt, Object.is-Args-Memo. (2) F-110-H1 commit `2bc8625`: `createClient` in `src/lib/supabase/server.ts` mit React `cache()` gewrappt — pro Render-Phase eine SupabaseClient-Instanz, damit der Resolver-Memo Cross-Caller (Layout↔Page) greift. Smoke `server-cache.test.ts` verifiziert 1x `createServerClient` bei 2x `createClient()`. Deduplikation ist Request-Scope (cache() ist render-context-bound), Branding-Aenderungen werden beim naechsten Request sofort sichtbar.
- Related: SLC-104 Slice Section B Caching-Note, RPT-236 Finding L-7, RPT-261 F-110-H1, RPT-262.

### ISSUE-048 — Branding-Resolver-Default-DisplayName "Strategaize" leakt im RPC-Fehler-Edge-Case in den Mandanten-Welcome-Block
- Status: resolved (SLC-110 MT-2 commit `db04665` + MT-5 Coolify-Redeploy 2026-05-15. Code-Side: Fallback-Predicate erweitert um STRATEGAIZE_DEFAULT_BRANDING.displayName-Vergleich, 5 neue Vitest PASS. Live-Wirksamkeit: Image-Tag `62dddaffe6...` (HEAD inkl. db04665) live auf app-Container ...092232049513. RPC-Fehler-Case ist Sehr-selten-Trigger (~0.01% RPC-Failure-Rate, RPC+Postgres im gleichen Docker-Netzwerk), reine Live-Empirie auf den Fehler-Case zu warten unrealistisch — Code-Side-Verifikation per Vitest reicht. /post-launch RPT-263 bestaetigt 0 errors in error_log seit Deploy, kein abnormales Verhalten beobachtet.)
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

### ISSUE-101 — `next build` bricht in der Page-Data-Collection fuer /api/public/partner/[slug] ohne Runtime-ENVs ab (pre-existing, Compile PASS)
- Status: open
- Severity: Low
- Area: Build / CI
- Summary: `npx next build` ohne gesetzte Supabase-Runtime-ENVs schlaegt NACH erfolgreichem Compile in der Page-Data-Collection-Phase fehl (`Failed to collect page data for /api/public/partner/[slug]` — supabase-js `validateSupabaseUrl` via `src/lib/logger.ts` Modul-Init). Per git-stash-Gegenprobe 2026-06-12 auf dem Pre-SLC-V9.5-D-Stand identisch reproduziert — pre-existing, KEIN V9.5-Regress (RPT-462 L-3).
- Impact: Lokale Full-Build-Verifikation ohne Prod-ENVs ist nicht moeglich; maskiert bei Nicht-Unterscheidung Compile vs Collection echte Build-Regresses. Coolify-Build (mit ENVs) ist nicht betroffen.
- Workaround: Compile-Phase als Gate nutzen + Fail per git-stash-Gegenprobe gegen Pre-Change-Stand verifizieren (IMP-1242). 
- Next Action: Route/Logger so haerten, dass Modul-Init ohne ENVs nicht wirft (lazy createClient) ODER Build-Doku mit ENV-Anforderung; spaetestens im /final-check V9.5 als bekannter Umstand fuehren.

