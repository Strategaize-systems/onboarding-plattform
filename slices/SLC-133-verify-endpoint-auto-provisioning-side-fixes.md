# SLC-133 — Verify-Endpoint + Auto-Tenant-Provisioning + ISSUE-051 + F-1 Side-Fixes (FEAT-053-Kern)

## Goal

Funktionaler Abschluss des V7 Self-Signup-Flows: der Verify-Endpoint `GET /auth/verify-signup` validiert den Klartext-Token aus der Email, sucht den Pending-Row via SHA-256-Hash, fuehrt transactional die Tenant-Auto-Provisioning durch (neuer `tenant` mit kind=`partner_client` + neuer `auth.users` + neue `profiles`-Row mit korrektem first_name/last_name + neuer `partner_client_mapping` mit invitation_source=`self_signup` + DSGVO-Consent-Felder), markiert die Pending-Row als `verified` und redirected den Mandanten auf `/auth/set-password?session=<onetime>` (Magic-Link-Style analog V6 Accept-Invitation).

Zwei Side-Fixes inline mitgenommen:
- **ISSUE-051**: first_name/last_name in profiles wurde fuer V6-Self-Signup nicht gesetzt (existed nicht). Mit V7-Auto-Provisioning wird das pro Mandant korrekt gesetzt (V6-Bestand bleibt unbetroffen, V7.1-Backfill optional).
- **F-1**: `src/app/dashboard/diagnose/actions.ts:242-243` Kommentar-Drift (`status='queued'` + `scheduled_at=now()` real ist `status='pending'`). 1-Zeilen-Diff im selben Backend-Touch.

Nach diesem Slice ist der Funnel funktional komplett — fehlt nur Pen-Test-Verifikation (SLC-134) + Cleanup-Cron + Live-Smoke (SLC-135).

## Feature

FEAT-053 — Self-Signup Email-Verify + Auto-Tenant-Provisioning (Haupt-Feature, Kern-Mechanik).

**Pattern-Reuse (per `strategaize-pattern-reuse.md`):**
- `src/app/accept-invitation/[token]/actions.ts` (V6) — Vorlage fuer Magic-Link-Provisioning-Sequenz + `auth.admin.createUser` + redirect-to-set-password.
- `src/app/api/admin/tenants/[tenantId]/invite/route.ts` (V6) — `auth.admin.createUser({ email, password: random, email_confirm: true })` Pattern.
- Migration 091 `partner_client_mapping` (V6) Reuse — V7 INSERT mit neuen invitation_source/dsgvo-Spalten aus Migration 098.
- `src/lib/signup/pending-signup-repo.ts` (aus SLC-132) — Lookup-by-Hash + Status-Update.
- `.claude/rules/coolify-test-setup.md` fuer Vitest gegen Coolify-DB.
- `.claude/rules/strategaize-pattern-reuse.md` — Auth-Callback ist Standard-Pattern.

**Cross-Project-Pattern-Check (BLOCKING per CLAUDE.md Rule 5):**
- V7-Verify-Endpoint ist Spiegel des V6-Accept-Invitation-Flows. 1:1-Port mit Quell-Pfad-Header-Kommentar im Endpoint-File pro `feedback_auth_callback_proxy_origin`-Memory.
- Set-Password-Redirect-Pattern existiert. Keine Neu-Implementierung.
- Transactional-Provisioning-Pattern existiert in V6 Accept-Invitation (BEGIN/COMMIT/ROLLBACK + auth.admin-Calls). Reuse.

## Background

V6 Accept-Invitation-Pattern (`src/app/accept-invitation/[token]/actions.ts`):
1. Token aus URL → DB-Lookup auf `invitation`-Tabelle.
2. `auth.admin.generateLink({ type: 'invite' })` schickt direkt einen Invite-Token — User existiert ab erstem Klick.
3. Mandant landet auf `/auth/set-password?session=<onetime>` und setzt Passwort.

V7 dreht die Sequenz: User existiert NICHT ab Signup-Aufruf — nur `pending_signup`-Row. Erst nach Verify-Klick wird `auth.users` + `tenant` + `profiles` + `mapping` transactional angelegt. Spammer erzeugen keinen DB-Bloat in `auth.users`, nur in `pending_signup` (mit 24h TTL via SLC-135-Cleanup).

Transactional Property ist entscheidend: wenn auth.admin.createUser failt (cross-Partner-Email-Konflikt) muss tenant-INSERT zurueckgerollt werden. Sonst halb-angelegter Tenant ohne User.

Email-Konflikt cross-Partner ist explizit erlaubt mit 409-Error per DEC-135 (1 Email = 1 globaler auth.users-Account in V7). V8+ kann Email-Aliasing pro Partner ermoeglichen.

## In Scope

### Auto-Provisioning Pure-Function

`src/lib/signup/auto-provision.ts`:

```typescript
export type AutoProvisionInput = {
  pending_signup_id: string;
  partner_tenant_id: string;
  email: string;
  email_lower: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  dsgvo_consent_text_version: string;
  dsgvo_consent_accepted_at: string;
};

export type AutoProvisionResult =
  | { ok: true; new_tenant_id: string; new_user_id: string }
  | { ok: false; error: 'email_conflict_cross_partner' | 'tenant_insert_failed' | 'profile_insert_failed' | 'mapping_insert_failed' };

export async function provisionSelfSignupTenant(input: AutoProvisionInput): Promise<AutoProvisionResult>;
```

Implementierungs-Details:
- Nutzt Supabase Service-Role-Client (RLS-bypass).
- Schritt 1: `auth.admin.createUser({ email, password: crypto.randomBytes(24).toString('hex'), email_confirm: true, user_metadata: { tenant_id: <new_tenant_id>, role: 'tenant_admin' } })`.
- Schritt 2: INSERT `tenant` mit `kind='partner_client'`, `parent_tenant_id=partner_tenant_id`.
- Schritt 3: INSERT `profiles` mit `id=new_user_id`, `tenant_id=new_tenant_id`, `role='tenant_admin'`, `first_name`, `last_name`, `email=input.email`.
- Schritt 4: INSERT `partner_client_mapping` mit `partner_tenant_id`, `client_tenant_id=new_tenant_id`, `invitation_status='accepted'`, `invitation_source='self_signup'`, `accepted_at=now()`, `dsgvo_consent_text_version`, `dsgvo_consent_accepted_at`.
- Schritt 5: UPDATE `pending_signup` SET `status='verified'`, `verified_at=now()` WHERE id=`pending_signup_id`.

Transactional Eigenschaft: Self-hosted Supabase + GoTrue (auth.admin.createUser) ist NICHT in derselben PostgreSQL-Transaction wie unsere INSERTs. Mitigation:
- **Schritt-Reihenfolge tauschen**: auth.admin.createUser ZUERST (kann nicht zurueckgerollt werden, aber liefert new_user_id + erkennt Email-Konflikt). Erst dann unsere PostgreSQL-Transaction in BEGIN..COMMIT.
- Wenn auth.admin.createUser failt → Returnt early mit `email_conflict_cross_partner`, KEIN Tenant-Insert.
- Wenn auth.admin.createUser klappt aber PostgreSQL-Transaction failt → Rollback nur unsere INSERTs. `auth.users`-Row bleibt zurueck (Manual-Cleanup-Pflicht via Strategaize-Admin oder TTL-Cleanup-Cron in V8+).
- Akzeptierter Tradeoff: in V7 Internal-Test-Mode minimales Risiko. V8+ kann via Supabase-Triggers oder Outbox-Pattern saubereres Rollback bauen.

### Verify-Endpoint Page + Server-Action

`src/app/auth/verify-signup/page.tsx` (Server-Component):

```typescript
// Pattern aus src/app/accept-invitation/[token]/page.tsx
// (per feedback_auth_callback_proxy_origin + strategaize-pattern-reuse Rule).

export default async function VerifySignupPage({ searchParams }: { searchParams: { token?: string } }) {
  if (!searchParams.token) return <InvalidLinkPage />;

  const tokenHash = hashWithSha256(searchParams.token);
  const pending = await findPendingByTokenHash(tokenHash);

  if (!pending) return <InvalidLinkPage reason="not_found" />;
  if (pending.status === 'verified') return redirect(`/login?info=already_verified&email=${encodeURIComponent(pending.email_lower)}`);
  if (pending.status === 'expired' || pending.expires_at < new Date()) return <ExpiredLinkPage />;

  // status='pending' AND not expired → Auto-Provisioning
  const result = await provisionSelfSignupTenant({...});

  if (!result.ok) {
    return <ErrorPage reason={result.error} />;
  }

  // Erfolgsfall: Magic-Login-Session generieren
  const onetimeToken = await generateMagicLinkSession(pending.email_lower);
  return redirect(`/auth/set-password?session=${onetimeToken}`);
}
```

Bei Doppel-Klick auf gleichen Link:
- Erster Klick: status='pending' → Provisioning → status='verified' → redirect /auth/set-password.
- Zweiter Klick: status='verified' → redirect /login mit Info-Param (User soll sich normal einloggen, Passwort bereits gesetzt).

Bei expired Link:
- Page: "Bestaetigungslink abgelaufen (24h). Bitte Signup wiederholen ueber Ihre Partner-Kanzlei." mit Re-Send-Button → V8+ (V7 verlangt Re-Signup ueber Landing-Page).

### Magic-Link-Session-Helper

`src/lib/signup/magic-link.ts`:

```typescript
export async function generateMagicLinkSession(email: string): Promise<string>;
// Reuse src/app/accept-invitation/[token]/actions.ts Magic-Link-Pattern:
// supabase.auth.admin.generateLink({ type: 'magiclink', email })
// → returnt onetime-Token, der in /auth/set-password verifiziert wird.
```

Falls Magic-Link-Generation failt (theoretisch nur bei GoTrue-Outage): Page zeigt Info "Bitte erneut einloggen via Passwort-Vergessen-Link" — Tenant ist bereits erstellt, Mandant kann ueber `/login` → "Passwort vergessen" weitermachen.

### Side-Fix ISSUE-051

V6 hat in einigen Self-Signup-aehnlichen Flows die first_name/last_name in profiles nicht gesetzt. V7-Auto-Provisioning setzt die Spalten direkt aus `pending_signup.first_name` und `.last_name`. V7-Selbst-Signup-Mandanten haben damit automatisch korrekt befuellte profiles.

Code-Touch: `src/lib/signup/auto-provision.ts` Schritt 3 (Profile-INSERT) — bereits in Scope oben.

V6-Bestands-Mandanten (von Partner-Invite angelegt) bleiben unbetroffen. ISSUE-051-Resolution gilt fuer V7-Self-Signup-Pfad. Backfill fuer V6-Bestand → V7.1-Optional (BL bleibt offen wenn nicht behoben).

### Side-Fix F-1

`src/app/dashboard/diagnose/actions.ts:242-243` Kommentar:
- Heute: `// status='queued', scheduled_at=now()` (Drift, real ist `pending`).
- Korrektur: `// status='pending'` (echtes Verhalten).

1-Zeilen-Diff im selben Backend-Touch (Slice ist Backend-heavy).

### Vitest-Coverage

**auto-provision.ts (`src/lib/signup/__tests__/auto-provision.test.ts`):**
1. Happy-Path: alle 5 Schritte gruen → `{ ok: true, new_tenant_id, new_user_id }`.
2. Email-Konflikt cross-Partner (auth.admin.createUser wirft `email_taken`): early-return `email_conflict_cross_partner`, KEIN tenant-Insert.
3. Tenant-Insert-Failure (z.B. partner_tenant_id existiert nicht): rollback unsere INSERTs, return `tenant_insert_failed`. (auth.users bleibt orphan).
4. Profile-Insert-Failure (FK-Violation): rollback unsere INSERTs nach tenant, return `profile_insert_failed`. (auth.users + tenant bleiben orphan, akzeptiert per V7-Tradeoff).
5. Mapping-Insert-Failure: rollback, return `mapping_insert_failed`.
6. first_name + last_name werden aus pending in profiles korrekt geschrieben (ISSUE-051 Resolution-Test).
7. Pending-Status wird nach Erfolg auf `verified` gesetzt mit `verified_at`.

**Verify-Endpoint (`src/app/auth/verify-signup/__tests__/page.test.ts`):**
1. Token-Hash-Mismatch (token nicht in DB) → Invalid-Link-Page.
2. Token aber Status='expired' → Expired-Link-Page.
3. Token aber expires_at in Vergangenheit → Expired-Link-Page.
4. Token + Status='pending' + not expired → Auto-Provisioning + redirect /auth/set-password.
5. Doppel-Klick (Status='verified' nach erstem Klick) → redirect /login mit already_verified.
6. Auto-Provisioning Email-Konflikt → Error-Page mit reason='email_conflict_cross_partner'.

**Race-Condition-Test (`src/app/auth/verify-signup/__tests__/race.test.ts`):**
1. Zwei parallele Verify-Klicks mit gleichem Token: genau eines provisioniert (UNIQUE-Constraint auf `pending_signup` blockt zweiten Update auf status='verified' nicht, aber zweiter Lookup sieht 'verified' wenn parallel-COMMIT durch). Verifikation via Vitest-DB-Lock-Simulation.

Tests laufen gegen Coolify-DB im node:20-Container.

### Quality-Gates am Slice-Ende

- ESLint 0/0 auf alle neuen + geaenderten Files.
- tsc EXIT=0 volltree.
- `npm run build` PASS lokal mit Dummy-ENVs.
- `npm run test` gegen Coolify-DB: alle pre-existing PASS + ~14 neue Tests (7 auto-provision + 6 endpoint + 1 race) PASS, 0 Regression.

## Out of Scope

- **Pen-Test-Suite-Erweiterung** mit allen 18 Negativ-Cases → SLC-134.
- **TTL-Cleanup-Cron** → SLC-135.
- **Re-Send-Verify-Mail-Button** auf Pending-Page → V8+ UX-Erweiterung.
- **Backfill V6-Bestands-Mandanten first_name/last_name** → V7.1 Optional-Polish (ISSUE-051 fuer V6-Daten bleibt offen).
- **Auth-Tx-Rollback-Mechanik** fuer auth.users-Cleanup bei PostgreSQL-Fail → V8+ (V7-Tradeoff dokumentiert).
- **Custom Magic-Link-Domain pro Partner** → V8+ Subdomain-Mapping.
- **Multi-Sprach-Variante der Verify-Pages** → V8+ NL.
- **DSGVO-Consent-Versionierung als eigene Tabelle** → V8+ Audit-Tabelle.
- **Webhook-Notification an Partner-Admin** bei neuem Signup → V8+.
- **Partner-Approve-Workflow** → V8+ (V7 = Auto-Accept).

## Acceptance Criteria

| AC | Beschreibung |
|---|---|
| AC-1 | `src/lib/signup/auto-provision.ts` `provisionSelfSignupTenant` implementiert mit 5-Schritt-Sequenz: auth.admin.createUser → tenant INSERT → profiles INSERT → partner_client_mapping INSERT → pending_signup UPDATE status='verified'. |
| AC-2 | Email-Konflikt cross-Partner: auth.admin.createUser wirft → early-return `email_conflict_cross_partner`, KEIN tenant-Insert ausgefuehrt. Vitest verifiziert. |
| AC-3 | Tenant/Profile/Mapping-Insert-Failure: PostgreSQL-Rollback nur unserer INSERTs, return discriminated-union-Error. (auth.users bleibt orphan, in V7 akzeptiert.) Vitest verifiziert. |
| AC-4 | profiles.first_name + profiles.last_name werden aus pending_signup-Row uebernommen. Vitest-Test 6 verifiziert. **ISSUE-051 resolved fuer Self-Signup-Pfad**. |
| AC-5 | partner_client_mapping.invitation_source='self_signup' korrekt gesetzt, abgrenzbar von V6 `partner_invite`-Eintraegen. |
| AC-6 | partner_client_mapping.dsgvo_consent_text_version + dsgvo_consent_accepted_at korrekt aus pending_signup uebernommen. |
| AC-7 | `src/app/auth/verify-signup/page.tsx` Server-Component implementiert mit 4 Branches (invalid_token / expired / already_verified / pending+valid). |
| AC-8 | Token-Klartext aus URL wird via `hashWithSha256` zu token_hash gehasht (Reuse aus SLC-132 MT-2). Klartext NIE in DB-Lookup. |
| AC-9 | Erfolgs-Branch: Auto-Provisioning + Magic-Link-Generation + redirect `/auth/set-password?session=<onetime>`. Reuse V6 Accept-Invitation-Pattern. |
| AC-10 | Doppel-Klick-Branch: status='verified' → redirect `/login?info=already_verified&email=...` ohne Re-Provisioning. |
| AC-11 | Expired-Branch: Status='expired' ODER expires_at < now() → Expired-Link-Page mit "Signup wiederholen"-Hinweis. |
| AC-12 | `src/app/dashboard/diagnose/actions.ts:242-243` Kommentar korrigiert auf `status='pending'`. **F-1 Side-Fix.** |
| AC-13 | Audit-Log fuer Verify-Erfolg: error_log INSERT mit category='public_signup_verify', level='info', metadata={ partner_slug, email_hash, new_tenant_id, status=200 }. Audit-Log fuer Verify-Fehler: level='error' mit error-code. |
| AC-14 | Token-Klartext + Klartext-Email NIE in error_log.metadata. RegEx-Probe `/[a-z0-9._-]+@/` scheitert. |
| AC-15 | Vitest 14 neue Cases PASS (7 auto-provision + 6 endpoint + 1 race) gegen Coolify-DB im node:20-Container. |
| AC-16 | Quality-Gates: ESLint 0/0, tsc EXIT=0, Build PASS, Vitest 0 Regression. |

## Pre-Conditions

- SLC-132 LIVE: `pending_signup`-Tabelle existiert, `findPendingByTokenHash` existiert, Service-Key-Endpoint funktional, Email-Template `renderSignupVerifyTemplate` existiert.
- Migration 098 LIVE in DB.
- V6 Accept-Invitation-Pattern in `src/app/accept-invitation/[token]/` verfuegbar als Vorlage.
- Supabase Service-Role-Client (`auth.admin.createUser` + `auth.admin.generateLink`) erreichbar.
- Self-hosted Supabase + GoTrue funktional (existing seit V4).

## Stop-Gates

- **Keine V7-Aktivierung im IS-Repo** vor SLC-134 Pen-Test PASS + SLC-135 Live-Smoke.
- **Keine parallele Aenderung an `partner_client_mapping`-Schema** waehrend SLC-133 (Race-Condition mit Migration-Lock).
- **Keine parallele Aenderung an V6 Accept-Invitation-Code** (Pattern-Vorlage, sonst Drift).

## Micro-Tasks

### MT-1: Auto-Provision Pure-Function + Vitest

- **Goal:** Transactional 5-Schritt-Provisioning, 7 Vitest gegen Coolify-DB.
- **Files:**
  - `src/lib/signup/auto-provision.ts` (NEU)
  - `src/lib/signup/__tests__/auto-provision.test.ts` (NEU)
- **Expected behavior:**
  - Discriminated-Union Result-Type fuer Success + 4 Error-Varianten.
  - Schritt-Reihenfolge: auth.admin.createUser ZUERST (Email-Konflikt-Detection), dann PostgreSQL-Transaction tenant→profile→mapping→pending-Update.
  - Bei PostgreSQL-Transaction-Fail: ROLLBACK + dokumentierter Tradeoff (auth.users orphan).
  - Vitest mocks `auth.admin.createUser` fuer Konflikt-Test (vi.spyOn).
  - SAVEPOINT-Pattern bei DB-Tests fuer erwartete FK-Violations.
- **Verification:**
  - Vitest 7/7 PASS gegen Coolify-DB.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** SLC-132 MT-4 (Pending-Repo existiert).

### MT-2: Magic-Link-Session-Helper

- **Goal:** Function `generateMagicLinkSession(email)` als 1:1-Reuse V6 Accept-Invitation-Pattern.
- **Files:**
  - `src/lib/signup/magic-link.ts` (NEU)
  - `src/lib/signup/__tests__/magic-link.test.ts` (NEU)
- **Expected behavior:**
  - Header-Kommentar mit Quell-Pfad-Hinweis auf `src/app/accept-invitation/[token]/actions.ts`.
  - `supabase.auth.admin.generateLink({ type: 'magiclink', email })` Reuse.
  - Returnt onetime-Token-String, der im `/auth/set-password?session=`-Flow verifizierbar ist.
  - 2 Vitest: Happy-Path-Mock + Failure-Mock (returnt null/Error).
- **Verification:**
  - Vitest 2/2 PASS.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** keine.

### MT-3: Verify-Endpoint Page + Branches

- **Goal:** Server-Component-Page mit 4 Branches (invalid/expired/already_verified/pending+valid), Audit-Log-Schreibung.
- **Files:**
  - `src/app/auth/verify-signup/page.tsx` (NEU)
  - `src/app/auth/verify-signup/_components/InvalidLinkPage.tsx` (NEU)
  - `src/app/auth/verify-signup/_components/ExpiredLinkPage.tsx` (NEU)
  - `src/app/auth/verify-signup/_components/ErrorPage.tsx` (NEU)
- **Expected behavior:**
  - Page-Header-Kommentar mit Quell-Pfad-Reuse-Hinweis V6 Accept-Invitation.
  - 4 Branches sauber separiert, JEDER Branch mit eigenem audit_log-Eintrag.
  - Error-Page nutzt Standard-Layout (kein Pre-Auth-Branding noetig — Verify-Link-Page ist Strategaize-zentral, kein Partner-Branding-Render).
  - Components als Server-Components, deutsche Texte.
  - Datenschutz-Link auf `/datenschutz` + Impressum-Link auf `/impressum` (V6.2).
- **Verification:**
  - `npm run build` PASS — neue Route `/auth/verify-signup` im Build-Output.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** MT-1, MT-2.

### MT-4: Verify-Endpoint Vitest-Suite

- **Goal:** 6 Endpoint-Cases + 1 Race-Condition-Test.
- **Files:**
  - `src/app/auth/verify-signup/__tests__/page.test.ts` (NEU)
  - `src/app/auth/verify-signup/__tests__/race.test.ts` (NEU)
- **Expected behavior:**
  - Mock `findPendingByTokenHash`, `provisionSelfSignupTenant`, `generateMagicLinkSession` via `vi.mock`.
  - Race-Condition-Test: 2 parallele `provisionSelfSignupTenant`-Aufrufe mit gleichem pending_signup_id, beide setzen status='verified'. Verifikation: nur eine Tx COMMITed (UPDATE WHERE status='pending' ist atomar), zweite sieht 0 rows updated → frueh-Return + 200-Redirect-Verhalten.
  - Audit-Log-Schreibung wird gemockt (`error_log`-Spy).
- **Verification:**
  - Vitest 7/7 PASS.
  - tsc EXIT=0 + ESLint 0/0.
- **Dependencies:** MT-3 (Endpoint existiert).

### MT-5: F-1 Side-Fix actions.ts Kommentar

- **Goal:** Kommentar-Korrektur 1-Zeilen-Diff.
- **Files:**
  - `src/app/dashboard/diagnose/actions.ts` (modify Z. 242-243)
- **Expected behavior:**
  - Kommentar von `// status='queued', scheduled_at=now()` (alt) auf `// status='pending'` (echtes Verhalten).
  - Kein anderer Code-Touch.
- **Verification:**
  - `grep "status='queued'" src/app/dashboard/diagnose/actions.ts` → 0 Treffer.
  - `grep "status='pending'" src/app/dashboard/diagnose/actions.ts` → mindestens 1 Treffer im Kommentar-Bereich Z. ~242.
  - tsc EXIT=0 + ESLint 0/0 (Diff hat keine TS-Logik-Aenderung).
- **Dependencies:** keine.

### MT-6: ISSUE-051 Resolution-Verifikation

- **Goal:** Verifikation dass V7-Auto-Provisioning first_name/last_name korrekt setzt. Issue auf resolved markieren.
- **Files:**
  - `docs/KNOWN_ISSUES.md` (modify — ISSUE-051 Status: open → resolved fuer Self-Signup-Pfad, V6-Bestand bleibt notiert)
- **Expected behavior:**
  - ISSUE-051-Eintrag bekommt zusaetzliche Sektion `## Status 2026-05-XX (V7 SLC-133)`:
    - Self-Signup-Mandanten (invitation_source='self_signup') haben korrekt befuellte first_name/last_name in profiles.
    - V6-Bestands-Mandanten (invitation_source='partner_invite' DEFAULT) bleiben unveraendert.
    - Optional V7.1-Backfill als Followup-BL.
  - Status bleibt `open` wenn V6-Bestand betroffen ist — `resolved` markiert nur den Resolution-Pfad fuer Self-Signup.
  - Oder: Status auf `partial_resolved` (informal, kein Cockpit-Pflichtwert) — Empfehlung: Status bleibt `open` + Sektion dokumentiert V7-Resolution-Pfad.
- **Verification:**
  - `grep "SLC-133" docs/KNOWN_ISSUES.md` → 1 Treffer.
- **Dependencies:** MT-1 (Auto-Provision implementiert).

### MT-7: Quality-Gates + Cockpit-Records

- **Goal:** Slice-End-Gates + Records.
- **Files:**
  - `slices/INDEX.md` (modify — SLC-133 status → done)
  - `planning/backlog.json` (modify — BL-108 → done)
  - `docs/STATE.md` (modify — Current Focus auf SLC-133 done, Next Step = SLC-134)
- **Expected behavior:**
  - ESLint 0/0 / tsc 0 / Build PASS / Vitest 0 Regression.
  - Records aktualisiert.
- **Verification:**
  - Alle Gates PASS in Output.
- **Dependencies:** MT-1..MT-6.

## Execution Order

Strikt sequentiell: **MT-1 → MT-2 → MT-3 → MT-4 → MT-5 → MT-6 → MT-7**.

- MT-1 muss zuerst weil MT-3 die Function nutzt.
- MT-2 muss vor MT-3 weil MT-3 das Magic-Link-Helper nutzt.
- MT-3 muss vor MT-4 weil Tests gegen die Page laufen.
- MT-5 + MT-6 sind parallelisierbar zu MT-1..MT-4 (kein Cross-Dep) — fuer Atomic-Commit-Disziplin aber sequentiell vor MT-7.

## Estimated Effort

| MT | Aufwand |
|---|---|
| MT-1 Auto-Provision + Vitest | ~180min (5-Schritt-Sequenz + 7 Vitest + Mock-Setup auth.admin) |
| MT-2 Magic-Link-Helper | ~30min (Reuse-Wrapper + 2 Tests) |
| MT-3 Verify-Endpoint Page + 3 Sub-Components | ~120min (4 Branches + Server-Component + Texte + Layouts) |
| MT-4 Endpoint-Vitest + Race-Test | ~90min (7 Tests + Race-Simulation) |
| MT-5 F-1 Side-Fix | ~5min |
| MT-6 ISSUE-051 Doku-Update | ~10min |
| MT-7 Records + Gates | ~30min |
| **Total** | **~7.5h (~1.5d Solo-Founder, plus Test-Polish-Margin → 2d realistisch)** |

## Risks

- **R-1 (Medium):** auth.users-Orphan bei PostgreSQL-Tx-Failure nach createUser-Erfolg. Mitigation: V7-Tradeoff dokumentiert in DEC-129. V8+ kann via Outbox-Pattern oder Supabase-Hooks saubereres Rollback bauen. Manual-Cleanup-Pflicht via Strategaize-Admin SQL bei Auftreten.
- **R-2 (Medium):** Magic-Link-Generation failt nach Provisioning-Erfolg. User sieht Page mit Hinweis "Bitte erneut einloggen", aber User-Erlebnis ist suboptimal. Mitigation: GoTrue-Outage ist seltenes Ereignis, Retry-Logik in MT-3-Page-Implementation (1 Retry mit 100ms-Delay). Wenn Retry failt → Error-Page mit "Bitte Passwort-Vergessen-Link nutzen"-Hinweis. Tenant existiert bereits, kein Daten-Verlust.
- **R-3 (Low):** Race-Condition zwischen 2 parallel-Klicks auf gleichen Verify-Link. Mitigation: UPDATE pending_signup SET status='verified' WHERE id=X AND status='pending' ist atomar. Zweiter Klick sieht 0-rows-updated und redirected zu /login mit already_verified-Info. Race-Test in MT-4 verifiziert.
- **R-4 (Low):** Doppel-Klick-Branch wirft falschen Email-Param-Leak in URL (`/login?email=...`). Mitigation: Email ist bereits ueber den Verify-Link bekannt. URL-Param ist nur als Convenience fuer Login-Form-Prefill. Akzeptiert per UX-Tradeoff.
- **R-5 (Low):** Email-Verify mit gefaelschtem partner_slug-Hash im URL (URL-Manipulation). Mitigation: Lookup ist ueber Token-Hash, NICHT ueber Slug. Partner-Slug-Param in URL ist nicht relevant — Pending-Row enthaelt partner_tenant_id authoritativ. Pen-Test verifiziert in SLC-134.
- **R-6 (Low):** Self-hosted GoTrue verlangt `raw_user_meta_data.tenant_id+role` Pattern (V4-Hack-Pattern). Mitigation: `auth.admin.createUser`-Call setzt `user_metadata: { tenant_id, role: 'tenant_admin' }` korrekt. Vitest verifiziert via Service-Role-Client-Mock-Spy.

## Worktree-Isolation

**Delivery Mode SaaS → Worktree-Isolation Mandatory.**

- Branch-Name: `slc-133-verify-endpoint-auto-provisioning`.
- Push nach /qa MT-7 PASS, dann Merge nach `main` am Slice-Ende.
- Status-Tracking: `slices/INDEX.md` Status `in_progress` waehrend Worktree aktiv, Update auf `done` post-Merge.

## Cross-Slice-Konsistenz

- 0 neue Migrations in SLC-133. Reuse Migration 098 aus SLC-132 (pending_signup + mapping-Extension).
- 0 neue npm-Packages. Reuse `crypto` (Node-built-in) + `node:crypto` Standard.
- Pre-Condition fuer SLC-134 erfuellt: Verify-Endpoint funktional, alle 3 Endpoints (Resolve + Signup + Verify) testbar.
- Side-Fixes (ISSUE-051 + F-1) sind sauber separierte MTs (MT-5 + MT-6), nicht im Haupt-Provisioning-Flow vermischt.

## References

- Memory `project_op_v7_architecture_done.md` — V7-Stand mit 10 DECs + Auto-Provisioning-Flow
- `docs/ARCHITECTURE.md` V7-Sektion (Line 6285-6336 Verify-Flow-Diagramm)
- `features/FEAT-053-self-signup-email-verify-auto-provisioning.md` — Detail-Spec
- `reports/RPT-297.md` — Architecture-Completion-Report
- DEC-129 (Email-Verify Custom pending_signup), DEC-131 (Pending-TTL 24h), DEC-133 (Verify-Link-Domain), DEC-135 (Doppel-Signup 409)
- `src/app/accept-invitation/[token]/actions.ts` — V6 Reuse-Vorlage fuer Magic-Link-Provisioning
- `src/app/api/admin/tenants/[tenantId]/invite/route.ts` — V6 auth.admin.createUser-Pattern
- `docs/KNOWN_ISSUES.md` — ISSUE-051 Eintrag
- `.claude/rules/coolify-test-setup.md` — Vitest gegen Coolify-DB
- `.claude/rules/strategaize-pattern-reuse.md` — Auth-Pattern-Reuse-Pflicht (BL-470 Lehre)
- `feedback_auth_callback_proxy_origin.md` — Origin-Trap-Memory + Reuse-Pflicht
