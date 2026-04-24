# SLC-034 — Employee-Auth + Invitation-Flow

## Goal
Vollstaendiger Mitarbeiter-Einladungsflow: tenant_admin laedt per E-Mail ein, Mitarbeiter setzt Passwort auf `/accept-invitation/[token]`, loggt sich ein und sieht leeres Mitarbeiter-Dashboard. Migration 072 mit 3 RPCs. Auth-Anlage strikt nach DEC-011-Pattern ueber Supabase Admin-API (kein SQL-INSERT in auth.users). Mitarbeiter-Verwaltungs-UI fuer tenant_admin (Tab in /admin oder /dashboard).

## Feature
FEAT-022

## In Scope
- Migration 072 `072_rpc_employee_invite.sql`:
  - `rpc_create_employee_invitation(email, display_name, role_hint)` — tenant_admin-only. Generiert 32-Byte Token (`encode(gen_random_bytes(32),'hex')`), INSERT in employee_invitation mit status='pending', expires_at=now()+14d. Return (id, token).
  - `rpc_revoke_employee_invitation(invitation_id)` — tenant_admin-only, UPDATE status='revoked'.
  - `rpc_accept_employee_invitation_finalize(invitation_id, accepted_user_id)` — SECURITY DEFINER, wird NICHT direkt vom Client gerufen, sondern von der Server-Action nach erfolgreichem Auth-Admin-Create. UPDATE invitation status='accepted', accepted_at, accepted_user_id; INSERT profile (user_id, role='employee', tenant_id). Idempotent.
- Server-Action `acceptEmployeeInvitation(token, password)` in `src/actions/employee/accept-invitation.ts`:
  - Validiert Token gegen employee_invitation (pending + nicht expired).
  - Ruft `supabase.auth.admin.createUser({ email, password, email_confirm: true })` via Service-Role-Client (DEC-011-Pattern).
  - Bei Erfolg: Ruft `rpc_accept_employee_invitation_finalize` mit neu erstellter user_id auf.
  - Bei Fehler: Kein Auth-User-Leak (Rollback via auth.admin.deleteUser falls Finalize fehlschlaegt).
  - Logging-Hinweis: keine Passwoerter loggen.
- Server-Action `inviteEmployee(formData)` in `src/actions/employee/invite.ts`:
  - Validiert tenant_admin-Rolle.
  - Ruft `rpc_create_employee_invitation`.
  - Sendet Einladungs-E-Mail via bestehender SMTP-Konfiguration (gleicher Transport wie Blueprint/V1-Mails). Mail-Template neu unter `src/lib/email/templates/employee-invitation.ts` (DE + EN + NL je nach `tenants.language`, DEC-033).
  - Link in E-Mail: `${EMPLOYEE_INVITATION_BASE_URL}/accept-invitation/${token}`.
- Server-Action `revokeEmployeeInvitation(invitationId)` in `src/actions/employee/revoke.ts`.
- UI-Route `/app/accept-invitation/[token]/page.tsx` (Server Component):
  - Laedt Invitation via server-seitigem supabase-anon oder service_role. Zeigt Email + Display-Name + Tenant-Name.
  - Client-Component `AcceptInvitationForm`: Passwort + Passwort-Bestaetigung + Submit (calls Server-Action).
  - Error-States: Expired / Revoked / Already-Accepted / Invalid Token.
  - Nach Erfolg: Redirect nach `/dashboard` mit Auto-Login (Server-Action setzt Session-Cookie).
- UI-Route `/admin/team/page.tsx` (oder `/dashboard/team`) fuer tenant_admin:
  - Server-Component laedt Mitarbeiter-Liste + Invitation-Liste (pending/accepted/revoked).
  - Client-Component `InviteEmployeeDialog` mit Form (email, display_name, role_hint).
  - Client-Component `EmployeeList` mit Revoke-Button pro pending.
  - Verwendet bestehende shadcn/ui-Komponenten (Table, Dialog, Button, Input, Badge).
- ENV-Dokumentation in `.env.example` erweitert:
  - `EMPLOYEE_INVITATION_FROM=onboarding@strategaizetransition.com`
  - `EMPLOYEE_INVITATION_EXPIRY_DAYS=14` (optional override).
- Leeres Mitarbeiter-Dashboard unter `/app/employee/page.tsx` — zeigt "Noch keine Aufgaben" und User-Name. Vollversion mit Aufgaben-Liste folgt in SLC-037.
- Middleware-Update `src/lib/supabase/middleware.ts`: `role='employee'` → redirect zu `/employee` bei Login, nicht `/admin` oder `/dashboard`.

## Out of Scope
- Mitarbeiter-Capture-UI (QuestionnaireMode fuer Mitarbeiter) — SLC-037.
- Bridge-Engine und bridge_proposal Flow — SLC-035/036.
- Magic-Link — explizit DEC-035 (V4.2 re-evaluiert).
- Multi-Tenant-Mitarbeiter — V4 Out-of-Scope.
- Auto-Reminder-E-Mails — V4.2.
- Mitarbeiter-Profile-Editor (Foto / Bio) — out-of-scope.
- RLS-Matrix-Vervollstaendigung — SLC-037.

## Acceptance Criteria
- AC-1: tenant_admin kann ueber UI einen Mitarbeiter einladen; Invitation-Row entsteht mit pending-Status.
- AC-2: E-Mail wird an die angegebene Adresse geschickt (SMTP-Log sichtbar in Worker- oder App-Container-Logs).
- AC-3: Aufruf `/accept-invitation/[token]` zeigt Formular. Submit mit validem Passwort erzeugt auth.users-Row + profiles-Row (role='employee'), setzt Invitation auf accepted.
- AC-4: Mitarbeiter ist nach Submit eingeloggt und landet auf `/employee`.
- AC-5: `/employee` zeigt "Noch keine Aufgaben" mit User-Name aus profile.
- AC-6: Abgelaufene Tokens (`expires_at < now()`) zeigen Fehler statt Formular.
- AC-7: Revoked Tokens zeigen Fehler statt Formular.
- AC-8: tenant_admin kann Pending-Invitation revoken; Status wechselt zu revoked, E-Mail-Link funktioniert danach nicht mehr.
- AC-9: Zweiter Annahme-Versuch mit gleichem Token wird blockiert (Invitation-Status ist accepted, kein zweiter User wird erzeugt).
- AC-10: Cross-Tenant-Isolation: tenant_admin sieht NUR Mitarbeiter seines Tenants.
- AC-11: RLS-Test-Matrix (aus SLC-033) wird um Invitation-spezifische Tests erweitert (mind. 4 neue Faelle).

## Dependencies
- Vorbedingung: SLC-033 done (Migrations 065, 066, 075 landed).
- Folge-Voraussetzung fuer: SLC-035 (Bridge nutzt profiles.role='employee'), SLC-037 (Mitarbeiter-Dashboard mit echten Aufgaben).

## Worktree
Mandatory (SaaS, Auth-kritischer Flow).

## Migrations-Zuordnung
072 (aus MIG-023).

## Pflicht-QA-Vorgaben
- `/qa` muss folgende Punkte abdecken:
  - End-to-End-Browser-Smoke-Test: tenant_admin laedt ein → E-Mail kommt an (SMTP-Log) → Link öffnen → Passwort setzen → Login → Dashboard-Redirect.
  - Negative-Tests: Expired Token, Revoked Token, Double-Accept, Invalid Token.
  - RLS-Matrix-Erweiterung fuer employee_invitation (mind. 4 Faelle).
  - Audit-Log-Check: auth.users-Eintrag existiert, profiles-Eintrag existiert mit role='employee', kein auth.users ohne matching profile entstanden.
  - `npm run test` gruen (Unit-Tests + RLS-Tests).
  - SQL-Migration auf Hetzner nach Pattern.
- IMP-112: Re-Read vor Write auf STATE.md, INDEX.md, backlog.json.
- DEC-011-Pattern-Compliance: Keine direkte SQL-INSERT in auth.users im RPC. Server-Action orchestriert Auth-Admin-API.

## Risks
- Auth-Admin-API-Fehler ohne Rollback koennten verwaiste auth.users erzeugen. Mitigation: Try/catch in Server-Action mit `auth.admin.deleteUser` wenn `rpc_accept_employee_invitation_finalize` fehlschlaegt.
- SMTP-Konfiguration im Staging vs. Prod. Mitigation: Lokal Test-SMTP-Log pruefen; Prod-Test mit einer eigenen E-Mail-Adresse in smoke-test.
- Passwort-Validierung: Supabase-Default-Mindestlaenge (6 Zeichen) — UI-Seitig mind. 8 Zeichen erzwingen.

### Micro-Tasks

#### MT-1: Migration 072 — 3 RPCs
- Goal: rpc_create_employee_invitation, rpc_revoke_employee_invitation, rpc_accept_employee_invitation_finalize.
- Files: `sql/migrations/072_rpc_employee_invite.sql`, `sql/schema.sql`
- Expected behavior: SECURITY DEFINER. Rollen-Checks im RPC-Body. Token-Generation mit `encode(gen_random_bytes(32), 'hex')` fuer 64-char hex. Finalize-RPC idempotent: wenn status bereits accepted, NO-OP ohne Fehler (oder Re-Write mit gleichem accepted_user_id pruefen).
- Verification: Je RPC ein Integration-Test gegen Coolify-DB (`rls.spec.ts`-Style). tenant_member darf rpc_create NICHT aufrufen. strategaize_admin darf ALLES.
- Dependencies: SLC-033 done
- TDD-Note: TDD strikt. Test vor RPC schreiben.

#### MT-2: Server-Action inviteEmployee + E-Mail-Template
- Goal: `src/actions/employee/invite.ts` + `src/lib/email/templates/employee-invitation.ts`
- Files: beide + Unit-Tests `invite.test.ts`
- Expected behavior: Action validiert tenant_admin via Server-Client. Erwartet FormData mit email + display_name + role_hint. Ruft RPC, erhaelt token, baut Link, sendet E-Mail. 3 Sprach-Varianten (DE/EN/NL) via `tenants.language` Lookup. Template enthaelt: Tenant-Name, Einlader-Name, Ablaufdatum, Link.
- Verification: Unit-Test mockt SMTP + RPC, verifiziert Link-Aufbau und Sprach-Wahl. Manueller Test in DEV mit echter E-Mail.
- Dependencies: MT-1
- TDD-Note: Red (failing test) → Green (action mit SMTP-Mock).

#### MT-3: Server-Action acceptEmployeeInvitation mit DEC-011-Pattern
- Goal: `src/actions/employee/accept-invitation.ts` + Tests.
- Files: Action-File + `accept-invitation.test.ts`
- Expected behavior: Validiert Token via direktem SELECT mit Service-Role. Check pending + nicht expired. Ruft `supabase.auth.admin.createUser`. Bei Erfolg ruft Finalize-RPC. Wenn Finalize fehlschlaegt: `auth.admin.deleteUser` (Rollback). Nach Erfolg setzt Session-Cookie und Redirect.
- Verification: Unit-Tests mit Mock-Supabase-Client: Happy-Path, Expired-Token, Invalid-Token, Admin-Create-Fail (keine verwaiste auth.users), Finalize-Fail (Rollback wirkt).
- Dependencies: MT-1
- TDD-Note: Strikt TDD.

#### MT-4: UI-Route /accept-invitation/[token]/page.tsx + Form
- Goal: Server-Component laedt Invitation + Client-Form rendert Passwort-Input.
- Files: `src/app/accept-invitation/[token]/page.tsx`, `src/app/accept-invitation/[token]/AcceptInvitationForm.tsx`
- Expected behavior: Server-Component prueft Token, lädt Display-Name + Email + Tenant-Name. Zeigt Error-Page bei Invalid/Expired/Revoked/Accepted. Client-Form mit Passwort-Inputs (2x Bestaetigung, min 8 Zeichen) + Submit ruft Server-Action. Error-Darstellung inline.
- Verification: Playwright/Manual-Test: Expired Token → Error-Page; Valid Token → Form; Submit → Redirect /employee.
- Dependencies: MT-3
- TDD-Note: UI-Komponent-Unit-Tests optional, Browser-Smoke-Test Pflicht.

#### MT-5: Mitarbeiter-Verwaltungs-UI fuer tenant_admin
- Goal: Neue Route /admin/team (oder /dashboard/team) + Dialog + Liste.
- Files: `src/app/admin/team/page.tsx`, `src/app/admin/team/InviteEmployeeDialog.tsx`, `src/app/admin/team/EmployeeList.tsx`
- Expected behavior: Server-Component laedt profiles WHERE tenant_id AND role='employee' PLUS employee_invitation WHERE tenant_id. Tabs oder Abschnitte fuer "Aktive Mitarbeiter" und "Offene Einladungen". Dialog-Form fuer neue Einladung. Revoke-Button pro pending.
- Verification: Browser-Test: Einladung erstellen → sichtbar in Liste → Revoke → Status wechselt.
- Dependencies: MT-2
- TDD-Note: UI-Tests optional, Browser-Smoke Pflicht.

#### MT-6: Leeres Mitarbeiter-Dashboard /employee
- Goal: Route /employee fuer role='employee'.
- Files: `src/app/employee/page.tsx`, `src/app/employee/layout.tsx`, ggf. `EmployeeShell.tsx`
- Expected behavior: Layout checkt role='employee' (Redirect falls nicht). Seite zeigt "Willkommen, {display_name}! Noch keine Aufgaben." Leerer State mit Hinweis "Dein tenant_admin wird dir Aufgaben zuweisen."
- Verification: Mitarbeiter-Login -> Landing auf /employee. Andere Rollen werden auf /admin oder /dashboard redirected.
- Dependencies: MT-3
- TDD-Note: Minimal-Seite, Browser-Test genuegt.

#### MT-7: Middleware-Update fuer employee-Routing
- Goal: Middleware leitet Login/Default-Route rollen-korrekt.
- Files: `src/lib/supabase/middleware.ts`
- Expected behavior: Nach Login-Cookie: role='employee' → /employee; role='tenant_admin' → /dashboard; role='strategaize_admin' → /admin/tenants. Falsche Route-Zugriffe (employee greift auf /admin): 403 oder Redirect.
- Verification: Unit-Test fuer Middleware oder Integration mit Playwright.
- Dependencies: MT-6
- TDD-Note: Middleware-Tests sind in Next.js tricky; Browser-E2E reicht.

#### MT-8: RLS-Matrix-Erweiterung + Negative-Tests
- Goal: Tests fuer employee_invitation RLS-Perimeter.
- Files: `src/__tests__/rls/v4-perimeter-matrix.test.ts` (erweitern aus SLC-033)
- Expected behavior: Mindestens 4 neue Testfaelle: employee SELECT employee_invitation → 0 rows; tenant_admin SELECT Cross-Tenant → 0 rows; tenant_member SELECT employee_invitation → 0 rows; anon SELECT token-match → evaluated separat ueber RPC.
- Verification: `npm run test -- v4-perimeter-matrix` gruen.
- Dependencies: MT-1
- TDD-Note: Unit-Tests mandatory.

#### MT-9: Record-Updates + ENV-Update
- Goal: STATE.md + INDEX.md + backlog.json + .env.example.
- Files: `docs/STATE.md`, `slices/INDEX.md`, `planning/backlog.json`, `.env.example`
- Expected behavior: SLC-034 Status `done`, BL-041 Status weiter `in_progress`, ENV dokumentiert.
- Verification: Re-Read vor Write (IMP-112).
- Dependencies: MT-1..MT-8
- TDD-Note: Doku.

## Aufwand-Schaetzung
~6-8 Stunden inklusive E-Mail-Template + Browser-Smoke. Risiko-Puffer Auth-Admin-Pattern: +2h. Gesamt: ~8-10 Stunden.
