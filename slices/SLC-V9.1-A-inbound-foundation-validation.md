# SLC-V9.1-A — Inbound-Foundation + Validation-Layer + IMAP-Sync (FEAT-075 + FEAT-076)

**Version:** V9.1
**Feature:** FEAT-075 (Inbound-Transport + Endpoint-Routing + Tenant-Lookup) + FEAT-076 (Forward-Validation-Layer + Spam-Defense)
**Backlog:** BL-154 + BL-155
**Status:** in_progress
**Created:** 2026-06-09
**Revised:** 2026-06-10 (REVISION R1 — DEC-205 IMAP-Reuse supersedes DEC-194 SES)
**Priority:** High
**Estimate:** ~7 MTs gesamt; davon MT-2 (Migrationen) + Validation-Layer + rpc bereits LIVE/QA'd. Rest-Aufwand R1 ~3-4 Tage Code-Side + IONOS-Postfach-Setup (~30 Min einmalig, Founder).
**Worktree Branch:** `v9-1-forward-bucket-email` (Cumulative-Single-Branch fuer SLC-V9.1-A + B + C + D, echtes `npm install` per [[feedback-worktree-npm-install-not-symlink]] BLOCKING)

---

## ⚠️ REVISION R1 (2026-06-10) — Inbound-Transport: AWS SES → IMAP-Reuse gegen IONOS

**Founder-Reuse-Direktive 2026-06-10 (DEC-205 supersedes DEC-194 + DEC-204):** Kein neues AWS-SES/S3/SNS/Lambda-Konstrukt. Stattdessen die bereits produktiv laufende **IMAP-Sync-Loesung aus dem Business-System** wiederverwenden, gegen ein **IONOS-Postfach** (DNS von `strategaizetransition.com` liegt verifiziert bei IONOS, NS `ns10xx.ui-dns.*`, Root-MX `mx0x.ionos.de`). Reuse-Quelle BLOCKING per [[strategaize-pattern-reuse]]: `strategaize-business-system/cockpit/src/lib/imap/sync-service.ts` + `api/cron/imap-sync/route.ts` + `types/imapflow.d.ts` (`imapflow@^1.3.1`).

Massgeblich ist dieser Block + ARCHITECTURE.md V9.1-Addendum REVISION-R1 + DEC-205. Der urspruengliche SES-Plan (Original-Scope-Sektionen unten als historischer Kontext markiert) ist OBSOLET.

### R1 — Was bleibt, was wegfaellt

| Baustein | R1-Schicksal | Begruendung |
|---|---|---|
| **MT-2 Migrationen** MIG-057 (112) + MIG-058 (113) + MIG-059 (114) + MIG-060 (115) | **BLEIBT — LIVE** auf 159.69.207.29 `supabase-db-bwkg80w04wgccos48gcws8cs-162742842423` | Schema + rpc sind transport-agnostisch |
| **Validation-Layer** `validation/setup-token.ts` + `validation/sender-allowlist.ts` | **BLEIBT** (Caller wechselt Webhook → IMAP-Sync; setup-token wird im Single-Mailbox tolerant, s. DEC-R1-2) | Pure-Helper, kein SES-Bezug |
| `tenant-lookup.ts` (`parseRecipientSlug` + `lookupEndpointBySlug`) | **BLEIBT** (Slug-Extraktion fuer spaeteren Catchall-Modus, DEC-204-Logik) | Recipient-Slug-Routing |
| `reject-log.ts` + `storage-persist.ts` | **BLEIBT** | transport-agnostisch |
| `rpc_inbound_record_message` (MIG-060) | **BLEIBT — LIVE** | atomarer Daily-Roll-Over + email_message |
| **MT-3** SES-Adapter `vendors/aws-ses.ts` + `vendors/index.ts` + `hmac.ts` (+ Tests) | **RAUS** (geloescht) | SES-/HMAC-spezifisch, kein Pull-Mechanismus |
| **MT-4** Webhook `src/app/api/inbound/email/route.ts` (+ Test) | **ERSETZT** durch IMAP-Cron; Persist-/Validation-Flow (Schritte 2-11) wandert in `imap-sync.ts` | kein Push mehr |
| **MT-5** Lambda `infra/lambda/forward-ses-to-op-webhook/` + `scripts/deploy-lambda.sh` | **GELOESCHT** | kein AWS-Bridge mehr noetig |
| `types.ts` HMAC-/Vendor-Typen (`ParsedInboundEvent`, `InboundEmailVendor`, `RejectReason: "hmac_invalid"`) | **GETRIMMT** | bleibt: `TenantLookupResult`, `ValidationResult`, `RejectReason` ohne `hmac_invalid` |
| **NEU** `src/lib/inbound-email/imap-sync.ts` (BS-Port) + `endpoint-resolver.ts` + Cron `api/cron/inbound-email-imap-sync/route.ts` + **MIG-061** `email_inbound_sync_state` (Migration 116) + `imapflow`-Dependency + `types/imapflow.d.ts` | **NEU** | Pull-Transport |

**Vorteil:** Die LIVE-getesteten + ge-QA'ten Teile (Schema, Persist, Validation, rpc) ueberleben; nur der Transport (SES-Push → IMAP-Pull) wird getauscht und ist selbst ein BS-Reuse. **Kein AWS-Sandbox-24h-Approval mehr** — Live-Smoke gegen ein IONOS-Postfach ist sofort moeglich.

### R1 — Geloeste Open-Questions (per /slice-planning-Revision 2026-06-10)

- **DEC-R1-2 (OQ-R1-2 Default-Endpoint-Resolve):** **ENV-Slug zuerst, dann Single-Active-Row.** `resolveDefaultEndpoint()` nutzt `INBOUND_DEFAULT_ENDPOINT_SLUG` (→ `lookupEndpointBySlug`); fehlt die ENV → SELECT die einzige `status='active'`-Row in `email_inbound_endpoint`. Fehler nur bei 0 oder >1 aktiven Rows (Ambiguitaet → captureWarning + Abort). Deckt Founder-Setup heute + spaetere Catchall-Migration ab.
- **DEC-R1-3 (OQ-R1-3 Setup-Token im Single-Mailbox):** **Tolerant.** Forwarded Mails ins IONOS-Postfach tragen keinen `X-Strategaize-Forward-Token`-Header → strikte Pruefung wuerde alles ablehnen. Im Default-Endpoint-Modus (`mode='single_mailbox'`) wird die Setup-Token-Schicht uebersprungen; die **Sender-Allowlist (Schicht 3, optional)** + die IONOS-Mailbox-Auth selbst sind die Defense. Im spaeteren Catchall-Modus (`mode='catchall'`) kehrt die Setup-Token-Pruefung zurueck (Slug-Routing-Pfad). Macht `reject_layer` weiterhin via `reject-log.ts` sichtbar.
- **OQ-R1-1 (IONOS-Postfach + IMAP-Credentials):** **FOUNDER-ACTION**, blockiert NUR MT-7 Live-Smoke (nicht MT-R1..R6). Aktion: IONOS-Postfach `bulk@strategaizetransition.com` anlegen + IMAP-Credentials (`IMAP_HOST=imap.ionos.de`, `IMAP_PORT=993`, `IMAP_USER`, `IMAP_PASSWORD`) als Coolify-ENVs setzen.

---

## Slice Goal (R1)

Liefert die **Inbound-Foundation-Schicht** fuer den V9.1-Continuous-Stream-Workflow ueber **IMAP-Pull gegen ein IONOS-Postfach**:

1. **Schema-Foundation (MIG-057..060, LIVE)**: 3 neue Tabellen + 2 ALTER + `rpc_inbound_record_message` — bereits LIVE, in R1 unveraendert.
2. **Validation-Layer (LIVE/QA'd)**: setup-token (tolerant im Single-Mailbox), sender-allowlist, tenant-lookup-Slug-Extraktion, reject-log, storage-persist — bleibt, Caller wechselt von Webhook zu IMAP-Sync.
3. **MIG-061 `email_inbound_sync_state`** (Migration 116): per-Endpoint inkrementeller IMAP-UID-State (Port aus BS `email_sync_state`).
4. **IMAP-Sync-Service** `src/lib/inbound-email/imap-sync.ts`: BS-Transport-Loop (ImapFlow connect → `last_uid`-inkrementeller Fetch → `simpleParser`) + OP-V9.1-Persist-Flow (Default-Endpoint-Resolve → tolerante Validation → storage-persist → `rpc_inbound_record_message` → sync-state-Update).
5. **Cron-Endpoint** `api/cron/inbound-email-imap-sync/route.ts`: OP-`x-cron-secret`-Pattern (analog `capture-reminders`).
6. **Cleanup**: SES-Adapter + hmac.ts + Webhook-Route + Lambda + deploy-lambda.sh + SES-ENVs entfernt; `types.ts` getrimmt.
7. **RLS-Test-Matrix** erweitert um `email_inbound_sync_state`; **IONOS-Live-Smoke** End-to-End.

Output: V9.1-Inbound-Foundation komplett ueber IMAP, fertig fuer SLC-V9.1-B Cost-Cap-Service. Keine Pipeline-Logik in diesem Slice (Sync persistiert nur; Pipeline-Trigger ist SLC-V9.1-B Scope).

## In Scope (R1)

- **Migration `sql/migrations/116_v91_email_inbound_sync_state.sql`** (MIG-061): `CREATE TABLE email_inbound_sync_state` + RLS (admin_all + tenant-scoped SELECT + service_role write) + GRANTs.
- **`src/lib/inbound-email/imap-sync.ts`** (NEU, Port aus BS) — `syncInboundEmails(): Promise<InboundSyncResult>`.
- **`src/lib/inbound-email/endpoint-resolver.ts`** (NEU) — `resolveDefaultEndpoint(admin)` per DEC-R1-2.
- **`src/lib/inbound-email/types.ts`** (TRIM) — entferne `ParsedInboundEvent`, `InboundEmailVendor`, `RejectReason: "hmac_invalid"`; ergaenze `InboundSyncResult` + `ResolvedEndpoint`.
- **`src/types/imapflow.d.ts`** (NEU, Port aus BS) — minimale ImapFlow-Typen.
- **`src/app/api/cron/inbound-email-imap-sync/route.ts`** (NEU) — POST-Handler mit `x-cron-secret`-Auth (OP-Pattern).
- **`package.json`** — `imapflow: "^1.3.1"` als Dependency (mailparser `^3.9.9` bereits vorhanden).
- **Cleanup (DELETE):** `src/lib/inbound-email/vendors/aws-ses.ts`, `vendors/index.ts`, `hmac.ts`, `__tests__/aws-ses.test.ts`, `__tests__/hmac.test.ts`, `src/app/api/inbound/email/route.ts`, `src/app/api/inbound/email/__tests__/route.test.ts`, `infra/lambda/forward-ses-to-op-webhook/` (3 Files), `scripts/deploy-lambda.sh`.
- **`.env.deploy.example`** — entferne `INBOUND_VENDOR`, `INBOUND_WEBHOOK_HMAC_SECRET`, AWS-SES-ENVs; ergaenze `IMAP_HOST`, `IMAP_PORT=993`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_INITIAL_SYNC_DAYS=90`, `INBOUND_DEFAULT_ENDPOINT_SLUG`. `INBOUND_CATCHALL_DOMAIN` bleibt dokumentiert fuer spaeteren Catchall.
- **Tests (NEU/UPDATE):**
  - `src/lib/inbound-email/__tests__/endpoint-resolver.test.ts` (NEU) — ENV-Slug-Pfad + Single-Active-Pfad + 0-Row/Multi-Row-Error.
  - `src/lib/inbound-email/__tests__/imap-sync.test.ts` (NEU) — gemockte ImapFlow + admin-Client: incremental UID-Fetch, Dedup via existing message_id, tolerante Validation, last_uid-Persist, error-skip pro Mail.
  - `src/app/api/cron/inbound-email-imap-sync/__tests__/route.test.ts` (NEU) — x-cron-secret Fail (403) / Missing (503) / Pass → syncInboundEmails aufgerufen.
  - `__tests__/migrations/116-v91-email-inbound-sync-state.test.ts` (NEU) — Schema-Verifikation gegen Coolify-DB.
  - `__tests__/rls/v91-inbound.rls.test.ts` (UPDATE) — `email_inbound_sync_state` 4-Rollen-Pen-Test ergaenzen.
  - Bestehende `setup-token.test.ts` / `sender-allowlist.test.ts` / `tenant-lookup.test.ts` (BLEIBEN, ggf. Tolerant-Mode-Case ergaenzen).

## Out of Scope (R1)

- **Continuous-Cost-Cap-Service** + Pipeline-Trigger-Cron — SLC-V9.1-B
- **Storage-Retention-Cron** (Soft/Hard-Delete) — SLC-V9.1-C
- **Setup-UI** (Conversational-First + Mail-Client-Anleitungen + Setup-Token-Display + DSGVO-Disclaimer) — SLC-V9.1-D
- **IONOS-Catchall-Aktivierung** + Multi-Endpoint-Slug-Routing (Code existiert via `parseRecipientSlug`, nur Aktivierung) — Spaeter (kostenneutral vorbereitet)
- **Synthetic-Corpus Skeleton-Validation** (urspr. MT-1) — falls noch nicht gelaufen: optional-parallel, kein R1-Blocker (Pre-Filter ist SLC-V9.1-B Pipeline-Scope)
- **Eigene Spam-Heuristik** / DKIM-Re-Sign — V9.2+
- **Anwalts-Sign-off + DSGVO-Pre-Live-Check** — per [[module-lifecycle-discipline]] deferred bis Modul 1+2+3 komplett

## Pre-Conditions (R1)

- ✓ V9 RELEASED + STABLE (REL-030)
- ✓ V9.1 /architecture DONE (RPT-429) + REVISION R1 DONE (RPT-436, DEC-205)
- ✓ MIG-057..060 LIVE (Schema + rpc) auf Coolify-Postgres
- ✓ Validation-Layer + storage-persist + tenant-lookup LIVE/QA'd (RPT-433/435)
- ✓ Worktree `v9-1-forward-bucket-email` (HEAD `025963b`) mit echtem `npm install`
- ✓ DNS verifiziert = IONOS
- ⏳ **OQ-R1-1 IONOS-Postfach + IMAP-Credentials** (FOUNDER-ACTION) — blockiert NUR MT-7 Live-Smoke

## Micro-Tasks (R1)

### MT-R1: Cleanup SES/Lambda/Webhook + types.ts trimmen + ENV-Sync
- **Goal**: Alle SES-/HMAC-/Lambda-/Webhook-Artefakte entfernen, `types.ts` auf die ueberlebenden Typen reduzieren, `.env.deploy.example` auf IMAP-ENVs umstellen.
- **Files** (DELETE): `src/lib/inbound-email/vendors/aws-ses.ts`, `src/lib/inbound-email/vendors/index.ts`, `src/lib/inbound-email/hmac.ts`, `src/lib/inbound-email/__tests__/aws-ses.test.ts`, `src/lib/inbound-email/__tests__/hmac.test.ts`, `src/app/api/inbound/email/route.ts`, `src/app/api/inbound/email/__tests__/route.test.ts`, `infra/lambda/forward-ses-to-op-webhook/index.mjs`, `.../package.json`, `.../README.md`, `scripts/deploy-lambda.sh`. (MODIFY): `src/lib/inbound-email/types.ts`, `.env.deploy.example`.
- **Expected behavior**: `types.ts` exportiert nur noch `RejectReason` (ohne `hmac_invalid`), `TenantLookupResult`, `ValidationResult`; neue Typen `InboundSyncResult` + `ResolvedEndpoint` kommen in MT-R4/R5 dazu. Keine Datei importiert mehr `aws-ses`/`hmac`/`vendors`. `.env.deploy.example` hat IMAP-Block, keine SES-Keys mehr.
- **Verification**: `grep -rE "aws-ses|verifyHmac|forward-ses-to-op|INBOUND_VENDOR|INBOUND_WEBHOOK_HMAC" src/ infra/ scripts/` → 0 Treffer (ausser History-Kommentare). `npx tsc --noEmit` EXIT=0 nach MT-R4/R5 (zwischenzeitlich erwartete Lueckenfehler ok). `git status` zeigt die Deletes.
- **Dependencies**: none

### MT-R2: MIG-061 `email_inbound_sync_state` schreiben + LIVE-Apply
- **Goal**: Migration 116 (MIG-061) anlegen, lokal validieren, LIVE auf Coolify-Postgres applien per [[sql-migration-hetzner]] (ssh + base64 + `psql -U postgres`).
- **Files**: `sql/migrations/116_v91_email_inbound_sync_state.sql` (NEU), `__tests__/migrations/116-v91-email-inbound-sync-state.test.ts` (NEU).
- **Expected behavior**: `CREATE TABLE IF NOT EXISTS email_inbound_sync_state` (`endpoint_id uuid PK REFERENCES email_inbound_endpoint(id) ON DELETE CASCADE`, `tenant_id uuid NOT NULL`, `folder text NOT NULL DEFAULT 'INBOX'`, `last_uid bigint NOT NULL DEFAULT 0`, `status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','syncing','error'))`, `last_sync_at timestamptz`, `emails_synced_total int NOT NULL DEFAULT 0`, `error_message text`, `updated_at timestamptz NOT NULL DEFAULT now()`) + RLS-Enable + 3 Policies (admin_all, tenant-scoped SELECT, service_role write) + GRANTs. BEGIN/COMMIT atomic.
- **Verification**: Lokal SQL valid. LIVE: `\d email_inbound_sync_state` zeigt Tabelle + CHECK + FK; RLS aktiv; `NOTIFY pgrst,'reload schema'` gefeuert. Vitest gegen Coolify-DB: Tabelle + Spalten + CHECK + RLS-Policies vorhanden. MIG-061 in MIGRATIONS.md `PLANNED → live` + Container-Name + Timestamp.
- **Dependencies**: none (additive Tabelle)

### MT-R3: imapflow-Dependency + Type-Shim
- **Goal**: `imapflow@^1.3.1` als OP-Dependency + minimaler Type-Shim (Port aus BS), echtes `npm install` im Worktree.
- **Files**: `package.json` (MODIFY — `imapflow` dependency), `src/types/imapflow.d.ts` (NEU, 1:1-Port aus `strategaize-business-system/cockpit/src/types/imapflow.d.ts` mit Quell-Pfad-Header-Kommentar).
- **Expected behavior**: `imapflow` in `package.json` dependencies; `package-lock.json` aktualisiert; `node_modules/imapflow` als echtes Directory vorhanden; `import { ImapFlow } from "imapflow"` typecheckt gegen den Shim.
- **Verification**: `npm install --prefer-offline` clean; `node -e "require('imapflow')"` ohne Fehler; `npx tsc --noEmit` kennt `ImapFlow`-Typen.
- **Dependencies**: none

### MT-R4: Default-Endpoint-Resolver (DEC-R1-2)
- **Goal**: `resolveDefaultEndpoint(admin)` — ENV-Slug zuerst, dann Single-Active-Row, Fehler bei Ambiguitaet.
- **Files**: `src/lib/inbound-email/endpoint-resolver.ts` (NEU), `src/lib/inbound-email/types.ts` (MODIFY — `ResolvedEndpoint` + `EndpointResolveMode`), `src/lib/inbound-email/__tests__/endpoint-resolver.test.ts` (NEU).
- **Expected behavior**: Wenn `INBOUND_DEFAULT_ENDPOINT_SLUG` gesetzt → `lookupEndpointBySlug` (Reuse) → `{ ...endpoint, mode: 'single_mailbox' }`; sonst SELECT `email_inbound_endpoint WHERE status='active'`: genau 1 Row → resolve; 0 Rows → `null` (+ captureWarning); >1 Rows → `null` (+ captureWarning Ambiguitaet). `mode` steuert die tolerante Setup-Token-Logik in MT-R5.
- **Verification**: Vitest (admin-Client gemockt): ENV-Slug-Pfad ruft `lookupEndpointBySlug`; Single-Active-Pfad bei 1 Row; `null` + Warning bei 0 und bei >1 Rows.
- **Dependencies**: MT-R1

### MT-R5: IMAP-Sync-Service (BS-Port + OP-V9.1-Persist-Flow)
- **Goal**: `syncInboundEmails()` — BS-Transport-Loop (ImapFlow connect, `last_uid`-inkrementeller Fetch, `simpleParser`, Dedup) + OP-V9.1-Persist (Endpoint-Resolve → tolerante Validation → storage-persist → `rpc_inbound_record_message` → sync-state-Update). Pro Mail Fehler → loggen + skip (BS-Pattern), `last_uid` nur bei Erfolg/Skip vorruecken.
- **Files**: `src/lib/inbound-email/imap-sync.ts` (NEU, Quell-Pfad-Header-Kommentar auf BS `sync-service.ts`), `src/lib/inbound-email/types.ts` (MODIFY — `InboundSyncResult`), `src/lib/inbound-email/__tests__/imap-sync.test.ts` (NEU).
- **Expected behavior** (Flow A R1, ARCHITECTURE.md):
  1. `resolveDefaultEndpoint(admin)` → kein Endpoint: captureWarning + early-return `{ synced:0, skipped:0, errors:0 }`.
  2. Get/create `email_inbound_sync_state` Row fuer `endpoint_id` (last_uid). Status `syncing`.
  3. ImapFlow connect (`IMAP_HOST/PORT/USER/PASSWORD`, secure 993). Mailbox-Lock `INBOX`.
  4. `last_uid===0` → initial Search `{ since: now-IMAP_INITIAL_SYNC_DAYS }` (cap 500); sonst incremental `{ uid: lastUid+1:* }` (cap 50).
  5. Pro Mail: `simpleParser(source)`; Dedup via `email_message.message_id` (skip+advance last_uid wenn existiert).
  6. **Tolerante Validation** (DEC-R1-3): `mode==='single_mailbox'` → Setup-Token-Schicht SKIP; Sender-Allowlist (Schicht 3) nur wenn ≥1 enabled Row (Reuse `evaluateSenderAllowlist`) → Fail: `insertRejectLog(allowlist_mismatch)` + skip+advance.
  7. Pass: `persistRawEml` (Reuse) → `rpc_inbound_record_message` (Reuse, atomic Daily-Roll-Over + email_message).
  8. `captureInfo('email_inbound_received', ...)` (OP-kanonischer Audit-Pfad).
  9. `last_uid = max(last_uid, msg.uid)`, `synced++`. Mail-Fehler → `errors++` + `captureException` + skip (kein last_uid-Rueckschritt → kein Reprocessing).
  10. Sync-state final `idle` + `last_uid` + `emails_synced_total += synced` + `last_sync_at`. Connection-Fehler → `status='error'` + `error_message`.
- **Verification**: Vitest (ImapFlow + admin gemockt): incremental Fetch ab last_uid; Dedup skippt existierende message_id; tolerante Validation laesst Mail ohne Token durch (single_mailbox); Allowlist-Mismatch → reject_log + skip; Full-Pass → `persistRawEml` + `rpc_inbound_record_message` aufgerufen; last_uid persistiert; pro-Mail-Error bricht den Lauf nicht ab.
- **Dependencies**: MT-R2, MT-R3, MT-R4

### MT-R6: Cron-Endpoint `/api/cron/inbound-email-imap-sync`
- **Goal**: POST-Handler mit OP-`x-cron-secret`-Auth (analog `capture-reminders`), ruft `syncInboundEmails()`.
- **Files**: `src/app/api/cron/inbound-email-imap-sync/route.ts` (NEU), `src/app/api/cron/inbound-email-imap-sync/__tests__/route.test.ts` (NEU).
- **Expected behavior**: `runtime='nodejs'`, `dynamic='force-dynamic'`, `maxDuration=30`. Auth: `x-cron-secret` vs `process.env.CRON_SECRET` (fehlt ENV → 503; Mismatch → 403; captureWarning bei Fail). Pass → `syncInboundEmails()` → JSON `{ success, synced, skipped, errors, lastUid }`. Exception → captureException + 500. captureInfo mit Run-Stats.
- **Verification**: Vitest: kein CRON_SECRET → 503; falsches Secret → 403; korrektes Secret → `syncInboundEmails` aufgerufen + 200-JSON; Throw → 500.
- **Dependencies**: MT-R5

### MT-R7: RLS-Matrix (sync_state) + IONOS-Live-Smoke + Records-Update
- **Goal**: RLS-Pen-Test fuer `email_inbound_sync_state`; End-to-End Live-Smoke gegen IONOS; Records synchronisieren.
- **Files**: `__tests__/rls/v91-inbound.rls.test.ts` (UPDATE — `email_inbound_sync_state` 4 Rollen), `slices/INDEX.md` + `features/INDEX.md` + `planning/backlog.json` + `docs/MIGRATIONS.md` (MIG-061 → live) + `docs/STATE.md` (UPDATE).
- **Expected behavior**:
  - RLS: strategaize_admin Cross-Tenant SELECT PASS; tenant_admin OWN SELECT PASS / Tenant-B 0 rows; tenant_admin INSERT/UPDATE → RLS-blocked (nur service_role); tenant_member + employee → 0 rows. SAVEPOINT-Pattern fuer expected Rejections ([[coolify-test-setup]]).
  - Live-Smoke (nach OQ-R1-1): 1 Endpoint `status='active'` provisioniert (manuell/SQL fuer Founder-Test) + `INBOUND_DEFAULT_ENDPOINT_SLUG` gesetzt → Founder schickt 1 Mail an `bulk@strategaizetransition.com` → Cron-POST mit `x-cron-secret` → binnen 1 Sync-Lauf erscheint 1 `email_message`-Row + 1 `email_bulk_run` (`status='continuous'`, `inbound_source='forward_bucket'`) + Storage-Object + `email_inbound_sync_state.last_uid` advanced + captureInfo-Audit.
- **Verification**: RLS-Pen-Tests GREEN (inkl. neue sync_state-Cases). Live-Smoke: Mail → email_message binnen 1 Cron-Lauf. slices/INDEX, features/INDEX, backlog, MIGRATIONS, STATE alle synchron. TSC=0, ESLint=0, alle Vitest GREEN.
- **Dependencies**: MT-R5, MT-R6, OQ-R1-1 (IONOS-Postfach) — nur fuer den Live-Smoke-Teil; RLS-Matrix + Records sind AWS/IONOS-frei.

## Acceptance Criteria (R1)

- **AC-R1-1**: SES-/HMAC-/Lambda-/Webhook-Artefakte vollstaendig entfernt; `grep` 0 Treffer; `types.ts` getrimmt; `.env.deploy.example` auf IMAP-ENVs umgestellt.
- **AC-R1-2**: MIG-061 (`116_v91_email_inbound_sync_state.sql`) LIVE auf Coolify-Postgres; Tabelle + CHECK + FK + RLS aktiv; Schema-Vitest GREEN.
- **AC-R1-3**: `imapflow@^1.3.1` Dependency + `src/types/imapflow.d.ts` Shim; `npm install` clean; `import { ImapFlow }` typecheckt.
- **AC-R1-4**: `resolveDefaultEndpoint` per DEC-R1-2 (ENV-Slug → Single-Active → Ambiguitaets-Abort); Vitest GREEN.
- **AC-R1-5**: `syncInboundEmails` incremental UID-Fetch + Dedup + tolerante Validation (DEC-R1-3) + storage-persist + `rpc_inbound_record_message` + last_uid-Persist; pro-Mail-Error skippt statt abzubrechen; Vitest GREEN.
- **AC-R1-6**: Cron `/api/cron/inbound-email-imap-sync` mit `x-cron-secret` (503/403/200-Pfade); Vitest GREEN.
- **AC-R1-7**: RLS-Matrix fuer `email_inbound_sync_state` (4 Rollen) GREEN inkl. service_role-only write.
- **AC-R1-8**: IONOS-Live-Smoke — 1 Founder-Test-Mail an `bulk@strategaizetransition.com` erscheint binnen 1 Cron-Lauf als `email_message` + `email_bulk_run` (continuous/forward_bucket) + Storage-Object + last_uid advanced.
- **AC-R1-9**: TypeScript-Compile EXIT=0, ESLint EXIT=0, alle Vitest GREEN; Records (slices/INDEX, features/INDEX, backlog, MIGRATIONS, STATE) synchron.

## Notable Risks / Dependencies (R1)

- **R-R1-1 (IONOS-Credentials-Dependency)**: MT-R7 Live-Smoke BLOCKED bis OQ-R1-1 (IONOS-Postfach + Coolify-ENVs). Mitigation: MT-R1..R6 + RLS-Matrix sind IONOS-frei lauffaehig; nur der End-to-End-Smoke wartet.
- **R-R1-2 (last_uid-Idempotenz)**: Falscher last_uid-Vorlauf bei Mail-Fehler wuerde Mails ueberspringen. Mitigation: last_uid nur bei Erfolg/Dedup-Skip vorruecken; bei Mail-Error kein Vorlauf (Reprocessing im naechsten Lauf), Dedup via message_id verhindert Doppel-Insert.
- **R-R1-3 (Setup-Token-Toleranz = Spam-Gap im Single-Mailbox)**: Ohne Setup-Token-Schicht ist die Sender-Allowlist + IONOS-Mailbox-Auth die einzige Defense. Mitigation: Internal-Test-Mode (Founder-only), reject_log macht Probing sichtbar, Catchall-Modus reaktiviert Setup-Token. Akzeptiert per DEC-R1-3.
- **R-R1-4 (Cron-Overlap)**: Zwei ueberlappende Cron-Laeufe koennten dieselben UIDs doppelt ziehen. Mitigation: `status='syncing'`-Guard + Dedup via message_id; Coolify-Scheduled-Task-Intervall ausreichend (≥5 Min).
- **R-R1-5 (imapflow Windows/glibc)**: Worktree-Tests gegen Coolify-DB per [[coolify-test-setup]] (node:20 glibc, SAVEPOINT). imapflow ist pure-JS, kein native-Binding → unkritisch.
- **D-R1-1**: Hard-Dependency auf MIG-057..060 LIVE (erfuellt) + Validation-Layer LIVE/QA'd (erfuellt).
- **D-R1-2**: Coolify-Scheduled-Task `/api/cron/inbound-email-imap-sync` (≥5 Min) — Founder-Setup in MT-R7 / SLC-V9.1-B-Window.

## Parallel-Execution

| MT | Parallel-Gruppe | MIG reserviert | File-Touchpoints | Notes |
|---|---|---|---|---|
| MT-R1 | A | — | inbound-email/{vendors,hmac,types}, api/inbound/email, infra/lambda, scripts | Cleanup, blockiert R4/R5 (types) |
| MT-R2 | A | **MIG-061 = Migration 116** | sql/migrations/116_*.sql | additiv, unabhaengig |
| MT-R3 | A | — | package.json, src/types/imapflow.d.ts | unabhaengig |
| MT-R4 | B | — | inbound-email/endpoint-resolver.ts, types.ts | nach MT-R1 |
| MT-R5 | B | — | inbound-email/imap-sync.ts, types.ts | nach MT-R2/R3/R4 |
| MT-R6 | B | — | api/cron/inbound-email-imap-sync/route.ts | nach MT-R5 |
| MT-R7 | C | — | __tests__/rls, INDEX/backlog/STATE/MIGRATIONS | nach MT-R5/R6 + OQ-R1-1 |

Single-Founder: sequenziell MT-R1 → MT-R2/R3 (parallel ok) → MT-R4 → MT-R5 → MT-R6 → MT-R7. MIG-061 reserviert Migration-Nummer 116 (hoechste bestehende = 115).

## Worktree

- **Branch**: `v9-1-forward-bucket-email` (HEAD `025963b`)
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v91`
- **Cumulative**: SLC-V9.1-A + B + C + D im selben Worktree; Master-Merge in SLC-V9.1-D nach Gesamt-V9.1-/qa PASS.

## Next After SLC-V9.1-A (R1)

**SLC-V9.1-B — Continuous-Cost-Cap-Service (FEAT-077)**. Konsumiert `email_bulk_run` mit `inbound_source='forward_bucket'` + `status='continuous'`, fuegt periodischen Pipeline-Trigger + Daily/Monthly-Cap + Per-Email-Approval + GF-Notification + Pipeline-Pause hinzu. Reihenfolge fix per ARCHITECTURE.md V9.1.

---

## ░░░ HISTORISCHER KONTEXT — Original-SES-Scope (OBSOLET per DEC-205) ░░░

> Der folgende Abschnitt war der urspruengliche AWS-SES-Plan (vor REVISION R1). Er ist durch DEC-205 (IMAP-Reuse) ueberholt und bleibt nur als Nachvollziehbarkeit. **Nicht implementieren.** Massgeblich ist der R1-Scope oben.

Original-Transport: GF-Mail-Forward → AWS SES Inbound Ireland eu-west-1 → S3 → SNS → Lambda `forward-ses-to-op-webhook` (HMAC-signed POST) → OP-Webhook `/api/inbound/email` → 3-Schicht-Validation (HMAC + Setup-Token + Allowlist) → Storage-Persist + email_message + email_bulk_run Daily-Roll-Over. Original-MTs: MT-0 Worktree, MT-1 Synthetic-Corpus-Skeleton-Validation, MT-2 Migrationen (→ LIVE, bleibt), MT-3 SES-Adapter+HMAC (→ raus), MT-4 Webhook (→ ersetzt durch IMAP-Cron), MT-5 Lambda+deploy-lambda.sh (→ geloescht), MT-6 Live-Smoke+RLS (→ MT-R7). Original-ENVs `INBOUND_VENDOR`, `INBOUND_WEBHOOK_HMAC_SECRET`, AWS-SES-Keys (→ entfallen). Risiken R1-R7 (AWS-Sandbox, Vendor-Lock-In, Cross-Region-TIA eu-west-1, HMAC-Secret-Drift, Lambda-Cold-Start) entfallen mit dem Pull-Modell.
