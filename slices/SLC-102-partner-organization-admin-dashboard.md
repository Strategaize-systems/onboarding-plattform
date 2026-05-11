# SLC-102 — Partner-Organisation + Onboarding-Flow + Admin-Dashboard (FEAT-042)

## Goal

Strategaize-Admin-UI fuer Partner-Verwaltung (`/admin/partners`) + Partner-Admin-Dashboard (`/partner/dashboard`). Strategaize-Admin kann eine neue Partner-Organisation anlegen, Owner-User per Magic-Link einladen, sieht Querblick auf alle Partner. Partner-Admin kann sich einloggen, sieht eigene (leere) Mandanten-Liste + Stammdaten-Edit + Branding-Sub-Section (Stub, vollstaendig in SLC-104). **Schema kommt komplett aus SLC-101** — SLC-102 ist UI + Server Actions + Auth-Routing-Erweiterung fuer `partner_admin`-Rolle. **Kein Branding-Resolver, keine CSS-Custom-Properties, kein Lead-Push.**

## Feature

FEAT-042 (Partner-Organisation + Onboarding-Flow + Admin-Dashboard). Pattern-Reuse: FEAT-031 Tenant-Onboarding-Wizard (Magic-Link, Server Action Pattern, ENV-konfigurierbarer Sender) + V4 Admin-Tenants-Liste (`src/app/admin/tenants/`) + V4 Employee-Sidebar-Pattern + FEAT-027 Status-Karten-Pattern.

## In Scope

### A — Server Actions

Pfad: `src/app/admin/partners/actions.ts` (NEU) und `src/app/partner/dashboard/actions.ts` (NEU).

**`createPartnerOrganization(input: { legal_name, display_name, contact_email, contact_phone?, country: 'DE'|'NL' })`** (Rolle `strategaize_admin`):

1. Pflicht-Validation (Zod): alle Felder + country-Enum.
2. BEGIN TX:
   - INSERT `tenants` mit `tenant_kind='partner_organization'`, `parent_partner_tenant_id=NULL`, `name=display_name`.
   - INSERT `partner_organization` mit Stammdaten + `partner_kind='tax_advisor'` hardcoded (DEC-111), `tier=NULL`, `created_by_admin_user_id=auth.uid()`.
   - INSERT `partner_branding_config`-Eintrag mit Default-Strategaize-Blau `#2563eb`, `logo_url=NULL` — **NUR wenn die Tabelle bereits existiert (post-SLC-104)**. In SLC-102 wird dieser INSERT als Conditional-INSERT mit Existence-Check der Tabelle implementiert, oder als no-op-Fall in SLC-102 belassen und in SLC-104 nachgezogen. Empfehlung: in SLC-102 als TODO mit klarem Kommentar; SLC-104 ergaenzt das automatisch.
   - INSERT `error_log` mit `category='partner_organization_created'`, `metadata={ partner_tenant_id, legal_name, country, created_by_admin_user_id }` (Audit-Pattern aus DEC-088).
3. COMMIT.
4. Return `{ ok: true, partner_tenant_id }`.

**`invitePartnerAdmin(input: { partner_tenant_id: string, email: string, first_name?: string, last_name?: string })`** (Rolle `strategaize_admin`):

1. Pflicht-Validation + Cross-Check: `partner_tenant_id` muss `tenant_kind='partner_organization'` sein.
2. Generiere Magic-Link-Token via bestehender FEAT-031-Pattern (`src/app/api/auth/invitation/route.ts` Logic wiederverwenden — Hilfs-Funktion extrahieren falls noch nicht).
3. INSERT `invitation` (oder bestehendes Schema) mit:
   - `target_tenant_id = partner_tenant_id`
   - `target_role = 'partner_admin'`
   - `email`, `first_name?`, `last_name?`
   - `token = <gen>`, `expires_at = now() + 7 days`
4. Versende E-Mail an `email` via existing SMTP-Adapter (FEAT-031-Reuse), Template-Inhalt analog Tenant-Admin-Einladung aber mit Partner-Branding-Wording (zunaechst Strategaize-Branding, partner-Branding kommt nach SLC-104).
5. INSERT `error_log` mit `category='partner_admin_invited'`, `metadata={ partner_tenant_id, email }`.
6. Return `{ ok: true, invitation_id }`.

**`updatePartnerStammdaten(input: { partner_tenant_id, display_name?, contact_email?, contact_phone? })`** (Rolle `partner_admin`):

1. Pflicht-Validation: aufrufender User muss `partner_admin` sein UND seine `user_tenant_id() == partner_tenant_id`.
2. UPDATE `partner_organization` SET ... WHERE `tenant_id = partner_tenant_id`.
3. INSERT `error_log` mit `category='partner_stammdaten_updated'`.
4. Return `{ ok: true }`.

**`acceptPartnerAdminInvitation(token: string)`** (bei Magic-Link-Klick, public):

1. Verifiziere Token via FEAT-031-Pattern.
2. Erstelle `auth.users`-Eintrag mit Rolle `partner_admin` + `tenant_id = invitation.target_tenant_id`.
3. Markiere Invitation als `accepted`.
4. Redirect `/partner/dashboard`.

### B — Strategaize-Admin-UI

Pfade: `src/app/admin/partners/page.tsx` + `src/app/admin/partners/new/page.tsx` + `src/app/admin/partners/[partner_tenant_id]/page.tsx` (alle NEU).

**`/admin/partners`** (Liste):
- Server-Component Auth-Gate: nur `strategaize_admin`.
- Tabelle: `legal_name`, `country`, `partner_kind`, `created_at`, Anzahl aktive Mandanten (LEFT JOIN `partner_client_mapping` mit `invitation_status='accepted'`), letzter Diagnose-Bericht-Datum (LEFT JOIN `capture_session` ueber Mandanten mit `status='finalized'` und `template.slug='partner_diagnostic'` — kann in SLC-102 als 0 / leer angezeigt werden falls SLC-105 noch nicht durch ist; placeholder mit Hinweis "noch keine Diagnose").
- Button "Neue Partner-Organisation" → `/admin/partners/new`.

**`/admin/partners/new`** (Form):
- Native HTML Form mit `useTransition` (per feedback_native_html_form_pattern, kein react-hook-form).
- Felder: legal_name (required), display_name (required, Default = legal_name), contact_email (required), contact_phone (optional), country (Select DE/NL, required).
- Submit → Server Action `createPartnerOrganization`.
- Success: Redirect zu `/admin/partners/[neu_tenant_id]` mit Flash-Message "Partner angelegt. Jetzt Owner einladen."

**`/admin/partners/[partner_tenant_id]`** (Detail):
- Server-Component Auth-Gate: nur `strategaize_admin`.
- Sektion "Stammdaten": Anzeige aller Felder + Edit-Modal (re-uses updatePartnerStammdaten waere nicht moeglich da User strategaize_admin ist — eigene Action `updatePartnerStammdatenAsAdmin` ODER Wiederverwendung mit erweiterter Auth: in SLC-102 Empfehlung: eigene Action `updatePartnerStammdatenByAdmin` fuer strategaize_admin-Pfad).
- Sektion "Owner-Einladung": Form mit email + first_name + last_name → `invitePartnerAdmin`. Liste der pending/accepted Invitations.
- Sektion "Mandanten" (Cross-Tenant fuer strategaize_admin): Liste der Mandanten unter diesem Partner via `partner_client_mapping` + `tenants` JOIN.

### C — Partner-Admin-Dashboard

Pfade: `src/app/partner/layout.tsx` + `src/app/partner/dashboard/page.tsx` + `src/app/partner/dashboard/stammdaten/page.tsx` + `src/components/partner/PartnerSidebar.tsx` (alle NEU).

**`src/app/partner/layout.tsx`**:
- Server-Component Auth-Gate: nur `partner_admin`. Andere Rollen (`strategaize_admin` darf zwar, aber typisch ist `strategaize_admin` ueber `/admin/partners/[id]` — wir blocken `strategaize_admin` aus `/partner/*` fuer Sauberkeit nicht, **erlauben ihn aber als Read-only-Sicht via Impersonate-Switch ist V7+** — V6: nur partner_admin Zugriff).
- Sidebar: "Mein Dashboard", "Meine Mandanten" (Stub → SLC-103), "Branding" (Stub → SLC-104), "Stammdaten".
- Footer-Slot: Strategaize-Powered-Footer kommt in SLC-104; in SLC-102 wird ein einfacher Text-Footer "Powered by Strategaize" eingefuegt (kann in SLC-104 ersetzt werden durch die Server-Component-Variante mit i18n-Lookup).

**`/partner/dashboard`** (Main):
- Begruessungs-Block mit `partner_organization.display_name`.
- Mandanten-Liste-Card (in SLC-102 leer, "Sie haben noch keinen Mandanten eingeladen" + Stub-Button "Mandant einladen" → wird in SLC-103 implementiert; in SLC-102 zeigt der Button-Klick eine Coming-Soon-Toast oder ist disabled mit Hint "Verfuegbar nach SLC-103-Deploy").
- Stammdaten-Karte: zeigt legal_name + display_name + contact_email + country → Link zu `/partner/dashboard/stammdaten`.

**`/partner/dashboard/stammdaten`**:
- Form mit `updatePartnerStammdaten`-Action: display_name, contact_email, contact_phone editierbar; legal_name + country read-only (legal Aenderungen nur via strategaize_admin via `/admin/partners/[id]`).

### D — Auth-Routing-Erweiterung

Pfade: `src/middleware.ts` (oder `src/app/proxy.ts` per SLC-053-Migration), `src/lib/auth/role-check.ts` o.ae.

- `partner_admin`-Rolle als gueltige Auth-Variante registrieren.
- Pfad-Mapping: `/partner/*` → erlaubt `partner_admin` (+ strategaize_admin via Impersonate V7+); `/admin/*` → erlaubt nur `strategaize_admin`.
- Default-Redirect nach Login fuer `partner_admin`: `/partner/dashboard`.
- Default-Redirect fuer `tenant_admin`: `/dashboard` (existing).
- Default-Redirect fuer `strategaize_admin`: `/admin` (existing).

### E — TypeScript-Types + Vitest

- Server-Action-Return-Types in `src/app/admin/partners/actions.ts` exportiert.
- Vitest-Tests fuer alle 4 Server Actions:
  - `createPartnerOrganization` Happy + Auth-Reject + Validation-Reject + atomare Rollback bei Partial-Failure (mockable mit pg-tx).
  - `invitePartnerAdmin` Happy + Auth-Reject + falscher tenant_kind → Reject.
  - `updatePartnerStammdaten` Happy + Auth-Reject + Cross-Tenant-Reject.
  - `acceptPartnerAdminInvitation` Happy + Token-invalid + Token-expired.
- Mindestens 15 Vitest in `__tests__`-Files.

### F — Component Tests + Browser-Smoke

- Vitest mit React Testing Library fuer Form-Validation (legal_name required, email-Format, country-Enum).
- Browser-Smoke (User-Pflicht in MT-8): `/admin/partners` Liste leer → "Neue Partner-Organisation" → Form ausfuellen → Submit → Detail-Page → "Owner einladen" → E-Mail-Check (Magic-Link).

## Acceptance Criteria

1. Strategaize-Admin kann `/admin/partners/new` Form ausfuellen + Submit → in < 5 Minuten ein neuer Partner ist angelegt (SC-V6-2).
2. Atomare Anlage: bei Partial-Failure (z.B. INSERT `partner_organization` schlaegt fehl nach `tenants` INSERT) wird die Tx rolled back, kein Orphan-Tenant.
3. Owner-User erhaelt Magic-Link-E-Mail mit korrektem `/accept-invitation?token=...`-Link, beim Klick wird `auth.users`-Eintrag mit `role='partner_admin'` + korrektem `tenant_id` erstellt.
4. Login als `partner_admin` fuehrt zu `/partner/dashboard` mit leerer Mandanten-Liste (SC-V6-3).
5. `/admin/partners`-Liste zeigt alle Partner-Organisationen mit korrektem Status.
6. `/admin/partners/[id]`-Detail zeigt Stammdaten + Mandanten-Liste (Cross-Tenant fuer strategaize_admin).
7. `partner_admin` von Partner A kann NICHT `/partner/dashboard` als Partner B aufrufen — Auth-Gate plus DB-RLS verhindern Cross-Partner-Sicht (SC-V6-3-Variante; konkrete Pen-Test-Faelle bereits in SLC-101).
8. `error_log` enthaelt `category='partner_organization_created'` + `category='partner_admin_invited'` + `category='partner_stammdaten_updated'`-Eintraege pro Aktion.
9. Form-Validierung serverseitig (Zod) + clientseitig (HTML5 required, type=email). Submit ohne Pflichtfeld liefert klare Fehler-UI.
10. ESLint 0/0 auf neuen Files. `npm run build` PASS. Vitest neue Tests gruen lokal. Pen-Test-Suite aus SLC-101 weiter gruen.

## Micro-Tasks

| # | Task | Files | Verify |
|---|------|-------|--------|
| MT-1 | Server Actions `createPartnerOrganization` + `invitePartnerAdmin` + Vitest | `src/app/admin/partners/actions.ts` (NEU) + `__tests__/` | 4 Vitest gruen, atomare TX-Rollback verifiziert |
| MT-2 | Auth-Routing-Erweiterung + role-check fuer `partner_admin` | `src/middleware.ts` / `src/lib/auth/role-check.ts` (modifiziert) | Vitest 4 Faelle: 4 Rollen × 2 Pfad-Klassen (`/admin/*` und `/partner/*`) |
| MT-3 | Strategaize-Admin-UI `/admin/partners` + `/new` + `/[id]` | `src/app/admin/partners/page.tsx` + `new/page.tsx` + `[partner_tenant_id]/page.tsx` (NEU) | `npm run build` PASS, lokaler Smoke (Form + Submit + Detail) PASS |
| MT-4 | Partner-Admin-Dashboard `/partner/dashboard` + Layout + Sidebar | `src/app/partner/layout.tsx` + `dashboard/page.tsx` + `components/partner/PartnerSidebar.tsx` (alle NEU) | `npm run build` PASS, lokaler Login als partner_admin → leere Mandanten-Liste sichtbar |
| MT-5 | Partner-Admin-Stammdaten-Page + `updatePartnerStammdaten`-Action + Vitest | `src/app/partner/dashboard/stammdaten/page.tsx` + Action in `actions.ts` | 3 Vitest Happy/Auth-Reject/Cross-Tenant-Reject |
| MT-6 | `acceptPartnerAdminInvitation`-Server-Action + Magic-Link-Integration in bestehendes /accept-invitation Pattern | `src/app/api/auth/invitation/route.ts` (modifiziert) + `actions.ts` | 3 Vitest Happy/Token-invalid/Token-expired; manueller Smoke: Token klicken → `auth.users` Eintrag entsteht |
| MT-7 | Quality-Gates: Lint + Build + Test + Audit; Regression V5.1 Walkthrough-Routen + V4.2 Wizard-Routen | (gesamt) | 0/0 Lint, Build PASS, alle Vitest gruen inkl. Pen-Test-Suite aus SLC-101, 0 neue npm-Vulns |
| MT-8 | User-Pflicht-Browser-Smoke nach Coolify-Deploy | Live-URL | E2E: strategaize_admin laed `/admin/partners` (leer); legt Partner an; laed Owner ein; partner_admin klickt Magic-Link; partner_admin sieht `/partner/dashboard` mit eigenem display_name |

## Out of Scope (deferred)

- Mandanten-Einladungs-Flow `inviteMandant` + Mandanten-Liste-mit-Status → SLC-103
- `partner_branding_config`-Tabelle + Branding-Resolver + CSS-Custom-Properties → SLC-104
- Diagnose-Werkzeug-Karte im Mandanten-Dashboard → SLC-105
- Lead-Push UI → SLC-106
- Mehrere Partner-Admin-Users pro Partner-Tenant → V7+
- `partner_employee`-Rolle → V7+
- Vorschau-Frame fuer Branding-Live-Preview → SLC-104
- Resend-Button fuer Magic-Link → V6.1 (kein V6-Block, ggf. simple Re-Trigger der invitePartnerAdmin Action)

## Tests / Verifikation

- **Vitest-Mindestumfang**: 15+ neue Tests (4 createPartnerOrganization + 3 invitePartnerAdmin + 3 updatePartnerStammdaten + 3 acceptPartnerAdminInvitation + Auth-Routing-Matrix).
- **Live-Build**: `npm run build` PASS mit allen neuen Routen im Build-Output.
- **Browser-Smoke** (MT-8): End-to-End-Flow auf Live-URL nach Coolify-Deploy.
- **Pen-Test-Regression**: SLC-101 Pen-Test-Suite weiter PASS (additive Server Actions duerfen RLS nicht beschaedigen).

## Risks

- **R-102-1** Partial-Failure beim atomaren Partner-Anlegen (zwischen `tenants` INSERT und `partner_organization` INSERT). **Mitigation**: BEGIN/COMMIT mit allen INSERTs in einer Tx; bei Fehler ROLLBACK + klare Error-Message an UI.
- **R-102-2** Magic-Link-Pattern erwartet bestehende `invitation`-Tabelle aus FEAT-031 — falls Schema fehlt oder anders heisst, muss in MT-1 angepasst werden. **Mitigation**: in MT-1 Schema-Lookup zuerst, Adaptation falls noetig (kein Schema-Drift erlaubt — wir erweitern nur `target_role` Enum um `partner_admin` falls vorhanden).
- **R-102-3** Auth-Routing-Erweiterung koennte bestehende Pfade brechen (z.B. Default-Redirect-Logic). **Mitigation**: in MT-2 Pflicht-Vitest fuer 4 Rollen × bestehende Routen (Regression).
- **R-102-4** `partner_branding_config` INSERT bei Partner-Anlage ist V6-spezifisch, Tabelle existiert erst nach SLC-104. **Mitigation**: in MT-1 Conditional-INSERT mit Pre-Check via `to_regclass('public.partner_branding_config')` oder Try/Catch — bei Tabelle-nicht-vorhanden: skip mit Warning-Log. Nach SLC-104-Deploy wird Branding automatisch beim naechsten Partner-Anlegen erzeugt; Bestand-Partner brauchen einen separaten Backfill-Schritt in SLC-104.

## Cross-Refs

- DEC-104 (Diagnose=Template-Variante, kein neuer Mode — relevant fuer Mandanten-Liste-Status-Spalte spaeter)
- DEC-108 (Pflicht-Footer hardcoded — SLC-102 Stub-Footer, SLC-104 Server-Component)
- DEC-111 (`partner_kind` und `tier` mit V8-Erweiterbarkeit — V6 immer `tax_advisor`/NULL)
- FEAT-042 (Spec)
- ARCHITECTURE.md V6-Sektion (Data Flow A — Partner-Onboarding)
- V4.2 SLC-046 + FEAT-031 (Tenant-Onboarding-Wizard, Magic-Link-Pattern)
- V4.1 SLC-043 (Cross-Tenant-Admin-Sichten)
- feedback_native_html_form_pattern (post-SLC-552 Business-System Lehre — kein react-hook-form)
- feedback_no_browser_supabase (alle DB-Calls ueber Server Actions/API-Routes, kein Browser-Supabase-Client)

## Dependencies

- **Pre-Conditions**: SLC-101 done + Pen-Test PASS + Migration 090 LIVE (DEC-110). Ohne `tenant_kind`-Spalte + `partner_admin`-Rolle kann SLC-102 nicht laufen.
- **Blockt**: SLC-103 (Mandanten-Einladung braucht Partner-Dashboard-UI als Einsprungspunkt), SLC-104 (Branding lebt im Partner-Dashboard).
- **Wird nicht blockiert von**: BL-095 Inhalts-Workshop (das ist nur fuer SLC-105 relevant).
