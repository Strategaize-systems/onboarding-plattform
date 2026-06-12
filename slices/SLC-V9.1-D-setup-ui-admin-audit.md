# SLC-V9.1-D — Setup-UI Conversational-First + Admin-Audit + Master-Merge (FEAT-079)

**Version:** V9.1
**Feature:** FEAT-079 (Admin-Audit Forward-Source-Statistik + Setup-UI mit Conversational-First-Pattern)
**Backlog:** BL-158
**Status:** in_progress (Code-Side done /backend RPT-443 + /frontend RPT-444 + /qa RPT-445; offen: Gesamt-V9.1-/qa + Master-Merge)
**Created:** 2026-06-09
**Priority:** High
**Estimate:** ~6-7 MTs, ~4-5 Tage Code-Side + Master-Merge + /post-launch-Prep
**Worktree Branch:** `v9-1-forward-bucket-email` (Cumulative-Single-Branch, fortgesetzt aus SLC-V9.1-C) -> Master-Merge zu `main` in MT-7

## ⚠️ AS-BUILT RECONCILE (2026-06-11, MT-7 / IMP-1192)

> **Diese Spec-Prosa wurde VOR der Implementierung geschrieben und ist an mehreren Stellen stale.** Die Implementierung folgte den /backend-Drift-Resolution-DECs (DEC-205/206/208/209), nicht dem urspruenglichen Wortlaut unten. **Maßgeblich sind: DECISIONS.md (DEC-205/206/208/209), RPT-443 (/backend), RPT-445 (/qa) und der Code** — nicht die Prosa in "In Scope" / "Micro-Tasks" / "Acceptance Criteria" unterhalb. Die ACs bleiben aus Audit-Gruenden im Original-Wortlaut stehen; die folgende Tabelle ist die verbindliche Uebersetzung in den as-built Stand.

| Thema | Spec-Prosa (stale) | As-Built (verbindlich) | Quelle |
|---|---|---|---|
| Inbound-Vendor / Region | AWS SES Inbound Ireland `eu-west-1`, `vendor='ses-ireland'`, Catchall-Routing | **IONOS-IMAP-Pull (Deutschland)**, Single-Mailbox-Modus; kein SES/S3/SNS/Lambda; kein Cross-Region | DEC-205, DEC-196→superseded |
| Audit-Mechanismus | `audit_log` mit `event_type=...` | **OP hat kein `audit_log`** — durchgaengig `error_log` (`captureInfo`), Validierungs-Rejects in Tabelle `email_validation_reject_log` | DEC-208, DEC-209 |
| Endpoint-Schema | `vendor`/`local_part`/`domain`-Spalten existieren | as-built: **slug-only** (`email_inbound_endpoint.slug`); Adresse `bulk-<slug>@<domain>` wird im Code gebaut; `vendor` = Konstanten-Label `imap-ionos` | RPT-443, DEC-205 |
| DSGVO-Consent-Felder + `pending_setup` | als bereits vorhanden angenommen | **additive Migration MIG-063/118** ergaenzt 4 Spalten + `pending_setup`-Status (LIVE) | DEC-209 |
| Setup-Token-Header | Mandatory `X-Strategaize-Forward-Token`-Pruefung | im **Single-Mailbox-Modus tolerant uebersprungen** (Mail traegt keinen Token-Header); Token nur fuer spaeteren Catchall-Modus relevant; Anleitungen setzen KEINEN Header | DEC-206 |
| Retention | message-level (`email_message.deleted_at`/`retention_until`) | **run-level** (`email_bulk_run.retention_until`+`soft_delete_at`, `email_message` via FK CASCADE); Idempotency via `knowledge_unit.metadata->>'bulk_run_id'` | DEC-208 |
| Admin-Cost-Spalte | `vw_bulk_email_cost_monthly.month_start` | Spalte heisst **`month`** (Spec-Annahme war ein Prod-Bug, gefixt in MT-5) | RPT-443, ISSUE-094 |
| Mail-Client-Anleitungen | 4 Tabs (Gmail/Outlook/Thunderbird/Apple Mail) | **3 Tabs**: Gmail / Outlook (Microsoft 365) / IONOS Webmail | RPT-444 |
| ConversationalSetupAssistant | "Pattern-Reuse aus IS V4 KI-Filter-Assistant" | OP hat **keinen** KI-Filter-Assistant — **in-repo Voice-Pattern** aus `questionnaire-form.tsx` portiert (`/api/tenant/transcribe`) | RPT-444 |
| Server-Action-Set | 6 Actions inkl. `aiAssistedSetupSummary` | as-built heisst die KI-Action `suggestSetup` (Wrapper um `summarizeSetupIntent`) | RPT-444, IMP-1196 |
| Komponenten-Dateipfade | `src/components/bulk-email/*.tsx` | as-built unter `src/app/dashboard/bulk-email-import/forward-setup/*` (kolokiert) | RPT-444 |
| `email_message.endpoint_id`-Join | message-level Join angenommen | **run-level Join** (`email_message`→`email_bulk_run.endpoint_id`) | RPT-443 |

**MT-7-Status:** COMPLIANCE.md Section 10 + RUNBOOK "V9.1 Setup-UI Founder-Walkthrough" geschrieben (2026-06-11), beide as-built. Master-Merge + Records-Flip auf `done` bleiben **gated hinter Gesamt-V9.1-/qa PASS** (AC-V9.1-D-10/12) — NICHT in diesem Schritt ausgefuehrt.

---

## Slice Goal

Liefert die **GF-Setup-UX-Schicht** + Admin-Audit-Closure fuer V9.1:

1. **Setup-UI mit Conversational-First-Pattern** per [[feedback-strategaize-conversational-first-ux]] BLOCKING: `/dashboard/bulk-email-import/forward-setup` mit prominentem "Mit KI beschreiben"-Button (Voice/Text → Bedrock-Sonnet → vorbefuellte Form). Form-Klick-UX nur als Fallback.
2. **4-Mail-Client-Anleitungen**: Gmail / Outlook / Thunderbird / Apple Mail Schritt-fuer-Schritt-Anleitungen fuer Forward-Regel mit Setup-Token-Header.
3. **Setup-Token-Display + Regenerate-Action**: Token wird einmalig sichtbar nach Generation, danach maskiert (...XXXX). Regenerate-Button mit Confirmation-Modal.
4. **DSGVO-Pflicht-Disclaimer**: "Ich bestaetige, dass ich die weitergeleiteten Emails verarbeiten und an Strategaize uebermitteln darf." Mit Audit-Trail (`email_inbound_endpoint.dsgvo_consent_*`-Felder).
5. **Test-Send-Button**: Verifiziert Forward-Regel End-to-End (Founder klickt -> Server-Action ruft Test-Email-Helper -> wartet auf Inbound -> zeigt Success/Fail).
6. **Admin-Audit-Erweiterung Forward-Source-Statistik**: `/admin/audit/bulk-email` erweitert um Forward-Source-Vendor-Statistik (Vendor + Inbound-Volume + Validation-Reject-Rate + Cost-pro-Tenant) per ARCHITECTURE.md V9.1 Section "Component Responsibilities".
7. **Master-Merge** `v9-1-forward-bucket-email -> main` nach Gesamt-V9.1-/qa PASS.
8. **COMPLIANCE.md** Erweiterung um Cross-Region-TIA-Dokumentation (DEC-196) + V9.1-Audit-Trail-Pflichten.

Output: V9.1 Code-Side komplett, fertig fuer /qa + /final-check + /go-live (alle Internal-Test-Mode per [[module-lifecycle-discipline]]).

## In Scope

- **`src/app/dashboard/bulk-email-import/forward-setup/page.tsx`** — Setup-UI Skeleton mit Conversational-First + Form-Fallback + 4-Mail-Client-Anleitungen + Setup-Token-Display + DSGVO-Disclaimer + Test-Send-Button.
- **`src/app/dashboard/bulk-email-import/forward-setup/actions.ts`** — Server-Actions: `createInboundEndpoint`, `regenerateSetupToken`, `updateAllowlist`, `sendTestEmail`, `confirmDsgvoDisclaimer`, `aiAssistedSetupSummary` (Conversational-First Bedrock-Call).
- **`src/app/dashboard/bulk-email-import/forward-setup/__tests__/actions.test.ts`** — Vitest gegen Coolify-DB fuer alle Server-Actions.
- **`src/app/dashboard/bulk-email-import/forward-setup/__tests__/page.test.tsx`** — Vitest fuer Component-Render + Conditional-States.
- **`src/components/bulk-email/ConversationalSetupAssistant.tsx`** — Wiederverwendbare Conversational-First-Component (Voice + Text Input + Bedrock-Sonnet Call + vorbefuellte Form-Output). Pattern-Reuse: IS V4 KI-Filter-Assistant (per [[feedback-strategaize-conversational-first-ux]]).
- **`src/components/bulk-email/__tests__/ConversationalSetupAssistant.test.tsx`** — Vitest fuer Component-Logic.
- **`src/components/bulk-email/MailClientInstructions.tsx`** — 4-Tab-Anleitungen (Gmail/Outlook/Thunderbird/Apple Mail).
- **`src/components/bulk-email/SetupTokenDisplay.tsx`** — One-Time-Visible-Display mit Mask-After-First-View + Copy-to-Clipboard + Regenerate-Button.
- **`src/components/bulk-email/DsgvoDisclaimerModal.tsx`** — Modal mit Pflicht-Bestaetigungstext + Checkbox + Audit-Trail-Hinweis.
- **`src/components/bulk-email/TestSendButton.tsx`** — Button + Polling fuer Inbound-Verifikation (max 60s Timeout) + Success/Fail-Feedback.
- **`src/lib/bulk-email/forward-source-stats.ts`** — Query-Helper fuer Admin-Audit-Erweiterung: SELECT JOIN email_inbound_endpoint + email_message + email_validation_reject_log + vw_bulk_email_cost_*, aggregiert pro Tenant + Vendor.
- **`src/lib/bulk-email/__tests__/forward-source-stats.test.ts`** — Vitest gegen Coolify-DB.
- **`src/app/admin/audit/bulk-email/page.tsx`** Update — Forward-Source-Statistik-Section unten am Page-Ende (Pro Tenant: Vendor + Inbound-Volume + Reject-Rate pro reject_layer + Cost / Tenant + Last-Inbound-Timestamp).
- **`src/app/admin/audit/bulk-email/__tests__/page.test.ts`** Update — Test fuer Forward-Source-Statistik-Sichtbarkeit (strategaize_admin only).
- **`src/lib/bulk-email/ai-assisted-setup.ts`** — Bedrock-Sonnet-Adapter-Call fuer Conversational-First-Setup-Assistant. Pattern-Reuse aus V8.1 LLM-Augmentation (SLC-161).
- **`src/lib/bulk-email/__tests__/ai-assisted-setup.test.ts`** — Vitest mit Mock-Bedrock-Response.
- **`docs/COMPLIANCE.md`** Erweiterung Section "V9.1 Cross-Region-TIA + Audit-Trail" mit DEC-196-Verweis + 4 audit_log-Event-Types (`email_inbound_received`, `email_validation_rejected`, `email_retention_sweep_run`, `email_inbound_endpoint_dsgvo_consent`).
- **`docs/RUNBOOK.md`** Erweiterung Section "V9.1 Setup-UI Founder-Walkthrough" mit Schritt-fuer-Schritt-Anleitung fuer ersten Setup-Endpoint.

## Out of Scope

- **In-App Notification-Channel** (statt Email-only) — V9.2+
- **Multi-Mitarbeiter-Setup-UI** (employee/tenant_member Access auf Setup-UI) — V9.2+
- **Sender-Allowlist-Default-On** — V9.1.x (per DEC-199)
- **DKIM-Re-Sign-Verifikation-Setup** — V9.2+
- **Auto-Restore-aus-Soft-Delete-UI** — V9.2+
- **Founder-Override-UI** (statt RUNBOOK-Manuell-SQL) — V9.2+
- **Customer-Onboarding-Flow** — Per [[module-lifecycle-discipline]] deferred bis Modul 1+2+3 komplett
- **Anwalts-Sign-off + DSGVO-Pre-Live-Check** — Per [[feedback-no-strategaize-live-until-all-systems-ready]] deferred

## Pre-Conditions

- ✓ SLC-V9.1-A + SLC-V9.1-B + SLC-V9.1-C alle DONE
- ✓ AWS-Founder-Setup-Steps 1-6 LIVE
- ✓ V8.1 SMTP-Adapter (`src/lib/email/sender.ts`) verfuegbar
- ✓ V8.1 LLM-Augmentation-Pattern (`src/lib/llm-augmentation/`) verfuegbar (Bedrock-Sonnet eu-central-1)
- ⏳ Founder-Conversational-First-UX-Wording-Freigabe (~1h: Setup-Assistant-Prompt-Template + DSGVO-Disclaimer-Wording final)

## Micro-Tasks

### MT-1: Setup-UI Skeleton + 4-Mail-Client-Anleitungen + Setup-Token-Display
- **Goal**: `forward-setup/page.tsx` Skeleton mit Layout + MailClientInstructions-Component + SetupTokenDisplay-Component.
- **Files**:
  - `src/app/dashboard/bulk-email-import/forward-setup/page.tsx` (NEU, Server-Component)
  - `src/components/bulk-email/MailClientInstructions.tsx` (NEU)
  - `src/components/bulk-email/SetupTokenDisplay.tsx` (NEU)
  - `src/components/bulk-email/__tests__/MailClientInstructions.test.tsx` (NEU)
  - `src/components/bulk-email/__tests__/SetupTokenDisplay.test.tsx` (NEU)
- **Expected behavior**:
  - Page-Layout: Hero-Section "Forward-Bucket-Email Setup" + Conversational-First-Hint "Mit KI beschreiben"-Button-Placeholder (MT-3 fuellt) + 4-Tab MailClientInstructions + Setup-Token-Display (wenn Endpoint existiert) + Allowlist-Section + DSGVO-Disclaimer-Placeholder (MT-5)
  - MailClientInstructions: 4 Tabs (Gmail / Outlook / Thunderbird / Apple Mail) mit jeweils 4-5 Schritt-fuer-Schritt-Screenshots/Beschreibungen wie Forward-Regel mit `X-Strategaize-Forward-Token`-Header zu setzen ist
  - SetupTokenDisplay: One-Time-Visible nach Generation (sessionStorage), danach maskiert (`...XXXX`). Copy-to-Clipboard-Button. Regenerate-Button mit Confirmation-Modal.
  - Reuse shadcn/ui Tabs + Card + Button + Dialog Components
- **Verification**: Vitest fuer Components, Manuell-Smoke (Storybook oder Dev-Server) zeigt 4 Tabs + Setup-Token-Display Maskierung funktional.
- **Dependencies**: SLC-V9.1-C DONE

### MT-2: Server-Actions (createInboundEndpoint, regenerateSetupToken, updateAllowlist, sendTestEmail, confirmDsgvoDisclaimer)
- **Goal**: 5 Server-Actions implementieren mit Vitest gegen Coolify-DB.
- **Files**:
  - `src/app/dashboard/bulk-email-import/forward-setup/actions.ts` (NEU)
  - `src/app/dashboard/bulk-email-import/forward-setup/__tests__/actions.test.ts` (NEU)
- **Expected behavior**:
  - `createInboundEndpoint(localPart: string): Promise<EndpointResult>`:
    - Pruefe Local-Part-Format `bulk-<slug>` (Validation)
    - Pruefe ob Endpoint mit gleichem (vendor, local_part, domain) schon existiert (Unique-Constraint)
    - Generiere `setup_token` = 32-byte URL-safe Random (`crypto.randomBytes(32).toString('base64url')`)
    - INSERT email_inbound_endpoint mit tenant_id (aus auth.getUser), vendor='ses-ireland', domain='bulk.strategaizetransition.com', status='pending_setup' (wird durch Test-Send-Erfolg auf 'active' gesetzt)
    - INSERT audit_log (event_type='email_inbound_endpoint_created', payload={endpoint_id, local_part})
    - Return: `{ endpoint, setup_token }` (token nur diesem Call, danach maskiert)
  - `regenerateSetupToken(endpointId)`: UPDATE setup_token + setup_token_created_at + audit_log (event_type='email_inbound_endpoint_token_regenerated')
  - `updateAllowlist(endpointId, allowedPattern, patternType, enabled)`: INSERT email_forward_allowlist + audit_log
  - `sendTestEmail(endpointId)`: Reuse V8.1 SMTP-Adapter, sendet Test-Mail an `bulk-<slug>@bulk.strategaizetransition.com` mit korrektem Setup-Token-Header. Polling fuer Inbound-Verifikation (siehe MT-6).
  - `confirmDsgvoDisclaimer(endpointId)`: UPDATE email_inbound_endpoint SET dsgvo_consent_text_version, dsgvo_consent_accepted_at=now(), dsgvo_consent_user_id=auth.getUser, status='active' (wenn pending_setup) + audit_log (event_type='email_inbound_endpoint_dsgvo_consent', payload={endpoint_id, consent_version}). 7-Jahre-Aufbewahrung-Markierung.
- **Verification**: Vitest gegen Coolify-DB:
  - createInboundEndpoint mit valider localPart -> 1 Row + 1 audit_log + Token returned
  - createInboundEndpoint mit Duplicate-localPart -> Unique-Constraint-Violation gefangen + Error-Response
  - regenerateSetupToken -> Token-Aenderung in DB + Audit
  - updateAllowlist -> Row + Audit
  - confirmDsgvoDisclaimer -> status='active' + dsgvo_consent_* Felder + Audit
  - sendTestEmail -> Test-Mail via SMTP gesendet (Mock-SMTP fuer Test)
  - Cross-Tenant-RLS: createInboundEndpoint fuer Tenant-A -> kein Sichtbarwerden fuer Tenant-B
- **Dependencies**: MT-1

### MT-3: Conversational-First-Setup-Assistant + Bedrock-Sonnet-Call
- **Goal**: `ConversationalSetupAssistant.tsx` Component mit Voice+Text Input + Bedrock-Sonnet Call + Form-Vorausfuellen.
- **Files**:
  - `src/lib/bulk-email/ai-assisted-setup.ts` (NEU, Pure-Function `summarizeSetupIntent(input: string): Promise<SetupSuggestion>`)
  - `src/components/bulk-email/ConversationalSetupAssistant.tsx` (NEU, Client-Component)
  - `src/lib/bulk-email/__tests__/ai-assisted-setup.test.ts` (NEU, Mock-Bedrock)
  - `src/components/bulk-email/__tests__/ConversationalSetupAssistant.test.tsx` (NEU)
- **Expected behavior**:
  - `summarizeSetupIntent(input)`: Bedrock-Sonnet-Call mit System-Prompt "Du bist Setup-Assistant fuer V9.1 Forward-Bucket-Email. User beschreibt: '<input>'. Extrahiere: { suggestedLocalPart: string, suggestedAllowlistPatterns: string[], reasoning: string }. Output JSON."
  - Pattern-Reuse aus IS V4 KI-Filter-Assistant (per [[feedback-strategaize-conversational-first-ux]] BLOCKING)
  - Component: Voice-Input-Button (Whisper-Adapter Reuse aus V2 SLC-022) + Text-Area-Fallback + "KI-Vorschlag generieren"-Button -> Call to ai-assisted-setup.ts -> Form-Felder vorausfuellen + Reasoning anzeigen
  - Component-Wiring: PageProps `onSuggestionApplied(suggestion)` callback
- **Verification**: Vitest fuer ai-assisted-setup.ts (Mock-Bedrock-Response liefert valid JSON). Component-Vitest mit User-Interaction-Simulation: Voice-Click triggert Whisper, Text-Input + KI-Vorschlag-Click -> Form vorausgefuellt.
- **Dependencies**: MT-2

### MT-4: DSGVO-Disclaimer-Modal + Test-Send-Button
- **Goal**: 2 Components mit Audit-Trail-Integration.
- **Files**:
  - `src/components/bulk-email/DsgvoDisclaimerModal.tsx` (NEU)
  - `src/components/bulk-email/TestSendButton.tsx` (NEU)
  - `src/components/bulk-email/__tests__/DsgvoDisclaimerModal.test.tsx` (NEU)
  - `src/components/bulk-email/__tests__/TestSendButton.test.tsx` (NEU)
- **Expected behavior**:
  - DsgvoDisclaimerModal: Pflicht-Text "Ich bestaetige, dass ich die weitergeleiteten Emails verarbeiten und an Strategaize uebermitteln darf. Diese Bestaetigung wird mit Timestamp und User-ID unloeschbar 7 Jahre gespeichert (DSGVO-Pflicht-Audit)." + Checkbox + Aktivieren-Button (disabled bis Checkbox aktiv) + Audit-Trail-Hinweis ("Diese Bestaetigung wird in audit_log mit event_type='email_inbound_endpoint_dsgvo_consent' gespeichert").
  - TestSendButton: Button-Click -> Server-Action `sendTestEmail(endpointId)` -> Spinner mit Polling alle 3s, max 60s Timeout -> Success-Toast "Test-Mail erfolgreich empfangen!" wenn email_message-Row binnen 60s erscheint, Error-Toast "Test-Mail nicht empfangen — bitte Setup pruefen (DNS, MX-Record, Setup-Token im Forward-Header)" sonst.
- **Verification**: Vitest fuer Components mit Mock-Server-Actions. Manuell-Smoke fuer DSGVO-Modal-Flow + TestSend-Polling-UI.
- **Dependencies**: MT-2

### MT-5: Admin-Audit-Erweiterung Forward-Source-Statistik
- **Goal**: `forward-source-stats.ts` Query-Helper + Page-Erweiterung von `/admin/audit/bulk-email/page.tsx`.
- **Files**:
  - `src/lib/bulk-email/forward-source-stats.ts` (NEU)
  - `src/lib/bulk-email/__tests__/forward-source-stats.test.ts` (NEU)
  - `src/app/admin/audit/bulk-email/page.tsx` (UPDATE — Section "Forward-Source-Statistik" am Page-Ende)
  - `src/app/admin/audit/bulk-email/__tests__/page.test.ts` (UPDATE — Test fuer Section-Sichtbarkeit)
- **Expected behavior**:
  - `getForwardSourceStats(): Promise<ForwardStatsRow[]>` (strategaize_admin Cross-Tenant):
    - JOIN email_inbound_endpoint + email_message (Inbound-Volume + Last-Inbound) + email_validation_reject_log (Reject-Rate-Buckets per reject_layer) + vw_bulk_email_cost_monthly (Cost-pro-Tenant)
    - Group by tenant_id + vendor
    - Return: `[{ tenant_id, tenant_slug, vendor, endpoint_status, inbound_count_30d, reject_count_30d_by_layer, monthly_cost_eur, last_inbound_at }]`
  - Page-Section: Sortierbare Tabelle, 1 Row pro (tenant + vendor) Kombination, Color-Coding bei Reject-Rate > 20% (Spam-Influx-Hinweis)
  - Sichtbar nur fuer strategaize_admin (RLS-Default + zusaetzlicher Role-Check vor SQL-Roundtrip fuer Performance)
- **Verification**: Vitest gegen Coolify-DB:
  - Seed 2 Tenants mit verschiedener Inbound/Reject-Mix -> Query returnt 2 Rows mit korrekten Aggregaten
  - strategaize_admin sieht Section, tenant_admin/member sehen sie NICHT (RLS-Route-Guard)
- **Dependencies**: MT-2

### MT-6: Polling-Helper fuer Test-Send-Verifikation
- **Goal**: `pollForInboundEmail(endpointId, sinceTimestamp): Promise<EmailMessageRow | null>` Helper + Integration in TestSendButton.
- **Files**:
  - `src/lib/bulk-email/poll-inbound.ts` (NEU)
  - `src/lib/bulk-email/__tests__/poll-inbound.test.ts` (NEU)
- **Expected behavior**:
  - Helper macht Polling alle 3s (max 60s = 20 Attempts): `SELECT email_message WHERE endpoint_id=$1 AND received_at > $2 ORDER BY received_at DESC LIMIT 1`
  - Return: First-Match-Row oder NULL bei Timeout
- **Verification**: Vitest gegen Coolify-DB mit Seed-Email-Inject nach 6s -> Helper-Return nach ~6s mit Row.
- **Dependencies**: MT-4

### MT-7: COMPLIANCE.md + RUNBOOK Erweiterung + Master-Merge + Records-Closure
- **Goal**: COMPLIANCE.md + RUNBOOK Updates + Master-Merge `v9-1-forward-bucket-email -> main` + slices/INDEX, planning/backlog, features/INDEX, STATE-Final-Updates.
- **Files**:
  - `docs/COMPLIANCE.md` (UPDATE — Section "V9.1 Cross-Region-TIA + Audit-Trail" + 4 audit_log Event-Types-Auflistung)
  - `docs/RUNBOOK.md` (UPDATE — Section "V9.1 Setup-UI Founder-Walkthrough")
  - `slices/INDEX.md` (UPDATE — SLC-V9.1-D `in_progress -> done`)
  - `features/INDEX.md` (UPDATE — FEAT-079 `in_progress -> done`)
  - `planning/backlog.json` (UPDATE — BL-158 `in_progress -> done`, BL-153 V9.1-Umbrella `in_progress -> done`)
  - `docs/STATE.md` (UPDATE — Current Focus, Last Stable Version bleibt V9 BIS /post-launch T+24h PASS per IMP-950)
- **Expected behavior**:
  - COMPLIANCE.md V9.1-Section per DEC-196: "Cross-Region innerhalb EU, kein Dritt-Land-Transfer per EuGH Schrems II, AWS-Standard-DPA via AWS-Europe-SARL-EU-Subsidiary." + 4 audit_log Event-Types `email_inbound_received` + `email_validation_rejected` + `email_retention_sweep_run` + `email_inbound_endpoint_dsgvo_consent`.
  - RUNBOOK V9.1 Setup-UI-Walkthrough: 5-Schritt-Anleitung (1. Setup-UI oeffnen, 2. Conversational-Setup mit "Mit KI beschreiben", 3. Setup-Token kopieren, 4. Mail-Client Forward-Regel mit Header setzen, 5. Test-Send + DSGVO-Disclaimer bestaetigen).
  - Master-Merge: `git checkout main && git merge --no-ff v9-1-forward-bucket-email -m "feat(V9.1): Continuous-Stream Forward-Bucket-Email — SLC-V9.1-A..D"` + `git push origin main`. Pre-Merge-Verifikation: Gesamt-V9.1-/qa PASS + alle 4 Slice-/qa PASS dokumentiert in `reports/`.
  - Records: BL-153 V9.1-Umbrella `done` + BL-154..158 `done` + FEAT-075..079 `done`. `planning/roadmap.json` v9-1 `status: 'active' -> 'released'` (geschieht erst nach /go-live + /deploy + /post-launch T+24h PASS per IMP-950 BLOCKING).
- **Verification**: Master-Merge erfolgreich, alle Records Cockpit-konsistent, Cockpit zeigt korrekte V9.1-Closure-Status.
- **Dependencies**: MT-1..MT-6 alle DONE + Gesamt-V9.1-/qa PASS

## Acceptance Criteria

- **AC-V9.1-D-1**: Setup-UI `/dashboard/bulk-email-import/forward-setup` rendert mit Conversational-First-Button + Form-Fallback + 4-Mail-Client-Anleitungen + Setup-Token-Display + DSGVO-Disclaimer + Test-Send-Button.
- **AC-V9.1-D-2**: ConversationalSetupAssistant: Voice-Input (Whisper-Adapter Reuse) + Text-Input + Bedrock-Sonnet-Call mit Pattern-Reuse aus IS V4 KI-Filter-Assistant per [[feedback-strategaize-conversational-first-ux]] BLOCKING.
- **AC-V9.1-D-3**: `createInboundEndpoint` Server-Action erzeugt email_inbound_endpoint mit `vendor='ses-ireland'`, `status='pending_setup'`, 32-byte URL-safe setup_token + audit_log Entry.
- **AC-V9.1-D-4**: SetupTokenDisplay: Token ist nach Generation einmalig sichtbar (sessionStorage), danach maskiert `...XXXX`. Regenerate-Action mit Confirmation-Modal funktional.
- **AC-V9.1-D-5**: DsgvoDisclaimerModal: Pflicht-Text + Checkbox + Aktivieren-Button + Audit-Trail-Hinweis. Bestaetigung setzt email_inbound_endpoint.status='active' + dsgvo_consent_* Felder + audit_log Entry mit event_type='email_inbound_endpoint_dsgvo_consent'.
- **AC-V9.1-D-6**: TestSendButton: Server-Action sendet Test-Mail an `bulk-<slug>@bulk.strategaizetransition.com` + Polling-UI alle 3s max 60s + Success/Fail-Toast.
- **AC-V9.1-D-7**: Admin-Audit Forward-Source-Statistik-Section in `/admin/audit/bulk-email` sichtbar fuer strategaize_admin, NICHT fuer tenant_admin/member. Pro Tenant: Vendor + Inbound-Volume-30d + Reject-Rate-30d-by-Layer + Monthly-Cost + Last-Inbound-Timestamp.
- **AC-V9.1-D-8**: COMPLIANCE.md enthaelt V9.1-Cross-Region-TIA-Section (DEC-196) + 4 audit_log Event-Types-Auflistung.
- **AC-V9.1-D-9**: RUNBOOK V9.1 Setup-UI-Walkthrough enthaelt 5-Schritt-Anleitung.
- **AC-V9.1-D-10**: Master-Merge `v9-1-forward-bucket-email -> main` mit `--no-ff` erfolgreich, Pre-Merge-Verifikation: Gesamt-V9.1-/qa PASS dokumentiert in `reports/`.
- **AC-V9.1-D-11**: TypeScript-Compile EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN, Playwright-Smoke-Test fuer Setup-UI-Flow PASS (manuell oder via Playwright-MCP).
- **AC-V9.1-D-12**: Cockpit-Records-Konsistenz: BL-153..158 alle `done`, FEAT-075..079 alle `done`, SLC-V9.1-A..D alle `done`. `planning/roadmap.json` v9-1 bleibt `status: 'active'` bis /post-launch T+24h PASS per IMP-950 BLOCKING.

## Notable Risks / Dependencies

- **R1 (Conversational-First-Friction)**: Founder koennte den "Mit KI beschreiben"-Button als overhead empfinden bei einmaligem Setup. Mitigation: Form-Fallback bleibt prominent verfuegbar. Per [[feedback-strategaize-conversational-first-ux]] ist Conversational-First-Pattern aber BLOCKING (hoechste Prio im V4.1 Polish-Bundle).
- **R2 (Setup-Token-Drift zwischen UI-Display und DB)**: User-Refresh nach Token-Display verliert Klartext-Token, regenerate-Button noetig. Mitigation: Klarer Hinweis "Token wird nur einmal angezeigt — bitte kopieren!" + Regenerate-Button gut sichtbar.
- **R3 (DSGVO-Disclaimer-Wording-Drift)**: Wording koennte rechtlich nicht ausreichend sein bei spaeterem Customer-Live. Mitigation: V9.1 ist Internal-Test-Mode (Founder-only Pilot per [[module-lifecycle-discipline]]). Anwalts-Konsultation deferred bis Modul 1+2+3 komplett.
- **R4 (Test-Send-Polling-Timeout)**: Bei AWS-SES-Sandbox-Mode oder DNS-Drift koennte Test-Send-Mail nicht binnen 60s ankommen. Mitigation: Error-Toast mit klaren Debug-Hinweisen (DNS, MX-Record, Setup-Token-Header).
- **R5 (Forward-Source-Stats-Performance)**: Bei vielen Tenants koennten Query-Roundtrips langsam werden. Mitigation: Page-Load mit Loading-Spinner, Query-Optimization mit korrekten Indexes (bereits in MIG-057 + MIG-058 angelegt).
- **R6 (Master-Merge-Konflikt-Risiko)**: Cumulative-Single-Branch ueber 4 Slices koennte bei main-Concurrent-Aenderungen Konflikte haben. Mitigation: Vor Master-Merge `git pull origin main` + Rebase-Versuch + bei Konflikten Manual-Resolve.
- **R7 (Voice-Input Mobile-Browser-Compat)**: Whisper-Adapter via getUserMedia braucht HTTPS + Microphone-Permission. Mitigation: Text-Input-Fallback immer verfuegbar.
- **D1**: Hard-Dependency auf SLC-V9.1-A + B + C alle DONE.
- **D2**: Hard-Dependency auf V8.1 SMTP-Adapter + V8.1 LLM-Augmentation-Pattern + V2 Whisper-Adapter (alle Strategaize-Standard).
- **D3**: Hard-Dependency auf Gesamt-V9.1-/qa PASS vor Master-Merge.
- **D4**: Founder-Wording-Freigabe Pre-Cond fuer MT-3 (Conversational-Setup-Prompt-Template + DSGVO-Disclaimer-Text final).

## Worktree

- **Branch**: `v9-1-forward-bucket-email`
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v91`
- **Master-Merge**: `v9-1-forward-bucket-email -> main` in MT-7 nach Gesamt-V9.1-/qa PASS, mit `--no-ff` fuer Audit-Trail-Sichtbarkeit
- **Branch-Cleanup**: nach Master-Merge `git worktree remove c:/strategaize/strategaize-onboarding-plattform-v91 && git branch -D v9-1-forward-bucket-email`

## Next After SLC-V9.1-D

**/qa Gesamt-V9.1-Review** (~1-2h Pflicht, per CLAUDE.md mandatory-completion-report.md Section 9 — Gesamt-/qa vor /final-check). Sucht Drift zwischen 4 Slice-/qa PASS und Gesamt-Setup. Verifiziert RLS-Test-Matrix-Komplettheit + Cross-Slice-Wiring.

Danach: **/final-check V9.1** (~2-3h, 7-Dim-Audit per CLAUDE.md Section "QA after implementation steps") -> **/go-live V9.1** (GO/NO-GO + REL-XXX-Setup) -> **/deploy V9.1** (Coolify-Redeploy + Live-Smoke) -> **/post-launch V9.1 T+immediate + T+24h** (BLOCKING per IMP-950 vor `status: 'released'` in roadmap.json).

Per [[module-lifecycle-discipline]] + [[feedback-no-strategaize-live-until-all-systems-ready]] bleibt V9.1 strikt **Internal-Test-Mode** (Founder-only Pilot) — kein Customer-Outreach, kein Pilot-Multiplikator, kein Anwalts-Sign-off-Trigger.
