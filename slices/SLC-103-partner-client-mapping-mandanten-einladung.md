# SLC-103 — Partner-Client-Mapping + Mandanten-Einladung (FEAT-043)

## Goal

Partner-Admin laedt einen Mandanten ein, der Mandant wird als eigener `partner_client`-Tenant angelegt und ueber `partner_client_mapping` an den Partner gebunden. Mandant erhaelt Magic-Link, kann sich einloggen, sieht ein Mandanten-Dashboard `/dashboard` mit Begruessungs-Block + Diagnose-Werkzeug-Eingang (Stub, vollstaendig in SLC-105). **Schema kommt aus SLC-101** — SLC-103 liefert Server Actions + UI fuer Einladungs-Flow + revoke + Mandanten-Dashboard-Grundgeruest. **Kein Branding-Resolver (kommt SLC-104), keine Diagnose-Pipeline (SLC-105), kein Lead-Push (SLC-106).**

## Feature

FEAT-043 (Partner-Client-Mapping + Mandanten-Einladung). Pattern-Reuse: FEAT-031 Magic-Link + Verifikations-Token-Pattern, FEAT-022 Employee-Auth-Pattern (Token-Klick → User-Anlage), SLC-102 Partner-Admin-Dashboard-Strukturen.

## In Scope

### A — Server Actions

Pfade: `src/app/partner/dashboard/clients/actions.ts` (NEU) + Erweiterung von `src/app/api/auth/invitation/route.ts` fuer Mandanten-Token.

**`inviteMandant(input: { mandant_email, mandant_company_name, mandant_first_name, mandant_last_name })`** (Rolle `partner_admin`):

1. Pflicht-Validation (Zod): alle Felder + email-Format.
2. Auth-Check: aufrufender User muss `partner_admin` sein; nutzt eigene `user_tenant_id()` als `partner_tenant_id`.
3. Pflicht-Validation: noch keine `partner_client_mapping`-Row mit dieser `mandant_email` unter diesem Partner (UNIQUE-Check vor INSERT — falls existing mapping mit `invitation_status='invited'`: Resend-Pfad in V6.1, fuer V6 Reject mit klarem Error "Mandant bereits eingeladen").
4. BEGIN TX:
   - INSERT `tenants` mit `tenant_kind='partner_client'`, `parent_partner_tenant_id=<partner_tenant_id>`, `name=mandant_company_name`.
   - INSERT `partner_client_mapping` mit `partner_tenant_id`, `client_tenant_id=<neu>`, `invited_by_user_id=auth.uid()`, `invitation_status='invited'`, `invited_at=now()`. (Trigger `check_partner_client_mapping_tenant_kinds` aus SLC-101 prueft Tenant-Kinds.)
   - Generiere Magic-Link-Token via FEAT-031-Pattern, INSERT `invitation` mit `target_tenant_id=<neu>`, `target_role='tenant_admin'`, `metadata={ source: 'partner_client', partner_tenant_id, mapping_id }`.
   - INSERT `error_log` mit `category='partner_mandant_invited'`, `metadata={ partner_tenant_id, mandant_tenant_id, mandant_email, mapping_id }`.
5. COMMIT.
6. Versende Magic-Link-E-Mail via existing SMTP-Adapter. E-Mail-Subject lokalisiert (DE default; NL kommt V6.1).
7. Return `{ ok: true, mapping_id, mandant_tenant_id }`.

**`acceptMandantInvitation(token: string)`** (public, beim Magic-Link-Klick):

1. Verifiziere Token + lade Invitation-Metadata.
2. Validierung: Invitation muss `target_role='tenant_admin'` UND `metadata.source='partner_client'` haben.
3. BEGIN TX:
   - INSERT `auth.users` mit Rolle `tenant_admin`, `tenant_id=invitation.target_tenant_id`, `email`, `first_name`, `last_name`.
   - UPDATE `partner_client_mapping` SET `invitation_status='accepted'`, `accepted_at=now()` WHERE `client_tenant_id=invitation.target_tenant_id`.
   - Markiere Invitation als `accepted`.
   - INSERT `error_log` mit `category='partner_mandant_accepted'`.
4. COMMIT.
5. Auth-Cookie setzen + Redirect `/dashboard`.

**`revokeMandantInvitation(mapping_id)`** (Rolle `partner_admin`):

1. Auth-Check: aufrufender User muss `partner_admin` sein UND das Mapping muss zu seinem Partner-Tenant gehoeren.
2. Pflicht-Validation: Mapping muss `invitation_status='invited'` sein (revoke nur fuer noch nicht angenommene Invitations — accepted/already-revoked sind Reject).
3. UPDATE `partner_client_mapping` SET `invitation_status='revoked'`, `revoked_at=now()`.
4. Invalidiere Magic-Link-Token (UPDATE `invitation` SET `revoked_at=now()` oder analog).
5. INSERT `error_log` mit `category='partner_mandant_revoked'`.
6. Return `{ ok: true }`.

**Hinweis zu revoke vs delete**: bei `invitation_status='revoked'` bleibt die `tenants`-Row + `partner_client_mapping`-Row erhalten — keine Cascade-Loeschung. Cleanup-Cron fuer ungenutzte revoked-Tenants ist V7+ Backlog (analog V5 `walkthrough-cleanup-daily`).

### B — Partner-Admin-UI Erweiterung

Pfade: `src/app/partner/dashboard/clients/page.tsx` (NEU), `src/app/partner/dashboard/clients/new/page.tsx` (NEU), `src/components/partner/MandantenListe.tsx` (NEU), Erweiterung von `src/app/partner/dashboard/page.tsx` (aus SLC-102).

**`/partner/dashboard/clients`** (Mandanten-Liste):
- Server-Component Auth-Gate: `partner_admin`.
- Lade Mandanten via JOIN `partner_client_mapping` + `tenants` WHERE `partner_tenant_id = auth.user_tenant_id()`.
- Tabellen-Spalten: `tenants.name` (Firmenname), `invitation_status` (mit Tailwind-Badge: invited=yellow, accepted=green, revoked=gray), `invited_at`, `accepted_at`, Sub-Status der Diagnose (in SLC-103 placeholder "Diagnose nicht gestartet"; SLC-105 ergaenzt Mapping zu capture_session-Status).
- Aktionen pro Row: "Einladung widerrufen" (nur fuer invited), "Bericht ansehen" (nur fuer accepted+finalized, placeholder fuer SLC-105).

**`/partner/dashboard/clients/new`** (Form):
- Native HTML Form (feedback_native_html_form_pattern).
- Felder: mandant_company_name (required), mandant_email (required, type=email), mandant_first_name (required), mandant_last_name (required).
- Submit → `inviteMandant`.
- Success: Redirect `/partner/dashboard/clients` mit Flash "Einladung an {email} versandt."
- Fehler: inline Error-Display (z.B. "Mandant bereits eingeladen").

**`/partner/dashboard`** (aus SLC-102 erweitert):
- Mandanten-Liste-Card zeigt jetzt echte Daten (max. 5 letzte) + Link "Alle ansehen" → `/partner/dashboard/clients`.
- Sub-Card "Einladungen offen" Counter (Anzahl `invitation_status='invited'`).

### C — Mandanten-Dashboard

Pfade: `src/app/dashboard/page.tsx` (Erweiterung — bestehendes `tenant_admin`-Dashboard wird tenant_kind-aware) + `src/components/dashboard/PartnerClientWelcomeBlock.tsx` (NEU).

**`/dashboard`** (existing, erweitert):
- Server-side: lade `tenant_kind` + `parent_partner_tenant_id` aus tenants-Tabelle.
- IF `tenant_kind='partner_client'`:
  - Begruessungs-Block (`PartnerClientWelcomeBlock`): "Willkommen — empfohlen von {partner_organization.display_name}" (cross-tenant Read via SECURITY DEFINER RPC kommt in SLC-104; in SLC-103 Fallback: lade `partner_organization.display_name` ueber Server-side mit elevated client oder ueber neue RPC-Stub `rpc_get_partner_display_name_for_client` analog DEC-099-Pattern; alternative MVP fuer SLC-103: in SLC-103 vereinfacht ohne Partner-Display-Name (nur "Empfohlen von Ihrem Steuerberater"), Partner-Display-Name kommt mit Branding-Resolver in SLC-104.
  - Hauptkarte "Strategaize-Diagnose-Werkzeug starten" → Link `/dashboard/diagnose/start` (Route existiert noch nicht — Placeholder/Coming-Soon in SLC-103, vollstaendig in SLC-105).
  - Sub-Karte "Mein Bericht" (sichtbar wenn Bericht existiert, in SLC-103 immer hidden).
  - Sub-Karte "Ich will mehr" (in SLC-103 hidden, SLC-106).
- ELSE: bestehendes V4/V4.1-Dashboard unveraendert (regression-frei!).

**Footer (in SLC-103)**: Text-Footer "Powered by Strategaize" (Stub aus SLC-102). Vollstaendiger Server-Component-Footer mit i18n kommt in SLC-104.

### D — Cleanup-Logic + revoke-UI

- `revokeMandantInvitation` ist Server Action, getriggert ueber Mandanten-Liste-Row-Action.
- Bestaetigungs-Modal: "Sind Sie sicher? Der Mandant kann den Magic-Link dann nicht mehr nutzen."
- Erfolgsfall: Reload + Flash "Einladung widerrufen."

### E — TypeScript-Types + Vitest

- Server-Action-Return-Types exportiert.
- Vitest fuer 3 Server Actions:
  - `inviteMandant` Happy + Auth-Reject (kein partner_admin) + Validation-Reject + Duplicate-Mandant-Reject + atomare TX-Rollback.
  - `acceptMandantInvitation` Happy + Token-invalid + Token-expired + Wrong-Target-Role-Reject.
  - `revokeMandantInvitation` Happy + Auth-Reject + Already-accepted-Reject.
- Mindestens 12 neue Vitest.

## Acceptance Criteria

1. Partner-Admin kann via `/partner/dashboard/clients/new` einen Mandant einladen.
2. Mandant erhaelt Magic-Link-E-Mail; Klick fuehrt zu Login + Auto-Setup als `tenant_admin` unter eigenem Mandanten-Tenant.
3. `partner_client_mapping` zeigt korrekt `invitation_status='accepted'` mit `accepted_at`-Timestamp.
4. Partner-Admin von Partner A kann NICHT Mandanten von Partner B in `/partner/dashboard/clients` sehen (SC-V6-3-Variante, RLS aus SLC-101 verifiziert).
5. Mandant von Partner A kann NICHT Mandant von Partner B in `/dashboard` sehen (Cross-Client-Isolation).
6. Mandant kann NICHT `/partner/*`-Routen aufrufen (`tenant_admin`-Rolle hat keinen Zugriff auf Partner-UI, Auth-Gate aus SLC-102).
7. `revokeMandantInvitation` invalidiert Magic-Link (Mandant klickt revoked Token → Error-Page).
8. Audit-Log-Eintraege fuer alle 3 Aktionen (invited / accepted / revoked) im `error_log`.
9. Trigger `check_partner_client_mapping_tenant_kinds` (aus SLC-101) wirft Exception wenn Server-Action einen ungueltigen `client_tenant_id` einschleust (z.B. direct_client als client-Side). Pen-Test-Regression aus SLC-101 weiter gruen.
10. Mandanten-Dashboard `/dashboard` zeigt fuer `partner_client`-Tenants den Welcome-Block + Diagnose-Karte-Placeholder. Direkt-Kunden (`tenant_kind='direct_client'`) sehen weiter ihr bestehendes V4/V4.1-Dashboard (regression-frei).
11. ESLint 0/0. `npm run build` PASS. Vitest neue Tests gruen. Pen-Test-Suite SLC-101 weiter gruen. SLC-102-Vitest weiter gruen.
12. SLC-103-spezifischer RLS-Test: 8 Faelle (4 Operationen × 2 Cross-Partner-Faelle) auf `partner_client_mapping` — wird Teil der `v6-partner-rls.test.ts` aus SLC-101 (die placeholder-`it.todo()` werden hier aktiviert).

## Micro-Tasks

| # | Task | Files | Verify |
|---|------|-------|--------|
| MT-1 | Server Action `inviteMandant` + atomare TX + Vitest | `src/app/partner/dashboard/clients/actions.ts` (NEU) + `__tests__/` | 5 Vitest gruen, TX-Rollback verifiziert, Trigger-Reject getestet |
| MT-2 | Server Action `acceptMandantInvitation` + Token-Verifikation + Vitest | `src/app/api/auth/invitation/route.ts` (modifiziert) + `actions.ts` | 4 Vitest Happy/Invalid/Expired/Wrong-Target |
| MT-3 | Server Action `revokeMandantInvitation` + Vitest | `actions.ts` + `__tests__/` | 3 Vitest Happy/Auth-Reject/Already-accepted-Reject |
| MT-4 | Partner-Admin Mandanten-Liste UI `/partner/dashboard/clients` | `src/app/partner/dashboard/clients/page.tsx` (NEU) + `MandantenListe.tsx` | Build PASS, Status-Badges korrekt, leere/voll-Liste-States |
| MT-5 | Mandanten-Einladungs-Form `/partner/dashboard/clients/new` | `src/app/partner/dashboard/clients/new/page.tsx` (NEU) | Native HTML Form, Submit → Action, Success-Redirect |
| MT-6 | `/partner/dashboard` Update: echte Mandanten-Liste + Counter + Stub-Button → echter Link | `src/app/partner/dashboard/page.tsx` (modifiziert) | Build PASS |
| MT-7 | Mandanten-Dashboard `/dashboard` Erweiterung: tenant_kind-aware Welcome-Block + Diagnose-Karte-Placeholder | `src/app/dashboard/page.tsx` (modifiziert) + `PartnerClientWelcomeBlock.tsx` (NEU) | Direkt-Kunden-Dashboard unveraendert, partner_client-Dashboard zeigt Welcome |
| MT-8 | Pen-Test-Faelle fuer `partner_client_mapping` aktivieren (placeholder aus SLC-101 → `it()`) | `src/lib/db/__tests__/v6-partner-rls.test.ts` (modifiziert) | 8 neue PASS-Faelle |
| MT-9 | Quality-Gates: Lint + Build + Test + Audit + Regression V4/V5.1 | (gesamt) | 0/0 Lint, Build PASS, Pen-Test-Suite vollstaendig gruen |
| MT-10 | User-Pflicht-Browser-Smoke nach Coolify-Deploy | Live-URL | E2E: partner_admin laed Mandant ein; Mandant klickt Magic-Link; Mandant sieht `/dashboard` mit Welcome + Diagnose-Karte-Placeholder; partner_admin sieht Status 'accepted' in der Liste |

## Out of Scope (deferred)

- Branding-Resolver (Mandanten-Dashboard zeigt noch Strategaize-Default-Look in SLC-103) → SLC-104
- Diagnose-Werkzeug-Pipeline + Run-Flow → SLC-105
- Diagnose-Bericht-Renderer → SLC-105
- Lead-Push UI ("Ich will mehr") → SLC-106
- Multi-User pro Mandant-Tenant (mehrere Mandanten-Mitarbeiter) → V7+, via FEAT-022 Employee-Pattern
- Bulk-Mandanten-Import (CSV) → V7+
- Pre-Filled-Profile-Daten beim Einladen → V7+
- Cleanup-Cron fuer revoked Mandanten-Tenants → V7+ Backlog
- Resend-Magic-Link-Button fuer pending Invitations → V6.1
- E-Mail-Branding pro Partner (Logo in Magic-Link-Mail) → V7+

## Tests / Verifikation

- **Vitest-Mindestumfang**: 12+ neue Tests + 8 RLS-Pen-Test-Aktivierungen.
- **Live-Build**: `npm run build` PASS.
- **Browser-Smoke** (MT-10): End-to-End-Flow auf Live-URL.
- **Pen-Test-Regression**: SLC-101 + SLC-102 weiter gruen.

## Risks

- **R-103-1** Atomare TX bei Mandanten-Anlegen ist 3-fach (`tenants` + `partner_client_mapping` + `invitation`) — Partial-Failure-Risiko. **Mitigation**: BEGIN/COMMIT mit allen 3 INSERTs in einer Tx, ROLLBACK bei Fehler.
- **R-103-2** Trigger `check_partner_client_mapping_tenant_kinds` koennte INSERT brechen wenn `tenants` INSERT noch nicht visible ist (sollte aber innerhalb derselben Tx visible sein dank PG-MVCC-Standard). **Mitigation**: Vitest verifiziert das in MT-1.
- **R-103-3** `acceptMandantInvitation` ist public Action mit Token — Token-Hijack-Risiko bei Token-Leak. **Mitigation**: existing FEAT-031-Token-Pattern hat bereits Time-Box + Single-Use; Vitest fuer Expired/Invalid in MT-2.
- **R-103-4** Mandanten-Dashboard `/dashboard` ist tenant_kind-aware Branch — Regression-Risiko fuer Direkt-Kunden. **Mitigation**: in MT-7 Pflicht-Vitest fuer beide Branches (direct_client + partner_client) + Browser-Smoke regression-Check auf bestehendem Demo-Tenant.
- **R-103-5** `partner_organization.display_name`-Lookup im Welcome-Block braucht cross-tenant Read fuer Mandant. **Mitigation**: V6 Mandanten-Welcome-Block in SLC-103 zunaechst ohne Partner-Display-Name (generischer Text "Empfohlen von Ihrem Steuerberater"), Partner-Display-Name kommt in SLC-104 zusammen mit RPC `rpc_get_branding_for_tenant` und ggf. eigener RPC oder erweiterter RPC. Alternativ: in SLC-103 Pre-Migration der RPC vorziehen (kostet 1 Migration-Step). **Empfehlung**: SLC-103 ohne Partner-Display-Name, SLC-104 ergaenzt es.

## Cross-Refs

- DEC-104 (Diagnose=Template-Variante)
- DEC-108 (Pflicht-Footer hardcoded — in SLC-103 noch Stub)
- FEAT-043 (Spec)
- ARCHITECTURE.md V6-Sektion (Data Flow B — Mandanten-Einladungs-Flow)
- V4.2 SLC-046 + FEAT-031 (Tenant-Onboarding-Wizard, Magic-Link)
- V4 FEAT-022 (Employee-Auth-Pattern, Verifikations-Token)
- feedback_native_html_form_pattern (post-SLC-552 Lehre)

## Dependencies

- **Pre-Conditions**: SLC-101 done (Schema + Trigger + RLS) + SLC-102 done (Partner-Dashboard-Strukturen + Auth-Routing).
- **Blockt**: SLC-105 (Diagnose-Werkzeug, Mandanten-Tenant muss existieren). SLC-106 (Lead-Push, Mandanten-Mapping-Attribution).
- **Wird nicht blockiert von**: SLC-104 Branding (Welcome-Block kann zunaechst ohne Branding-Resolver, SLC-104 fuegt Logo + Akzentfarbe nachtraeglich hinzu).
