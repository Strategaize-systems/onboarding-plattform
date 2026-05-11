# FEAT-042 — Partner-Organisation + Onboarding-Flow + Admin-Dashboard

**Version:** V6
**Status:** planned
**Created:** 2026-05-11

## Zweck

Steuerberater (`partner_admin`) bekommt einen eigenen Bereich in der Plattform: Strategaize-Admin legt eine neue Partner-Organisation an, der Partner-Inhaber wird per Magic-Link eingeladen, kann sich einloggen und sieht ein Dashboard mit seinen Mandanten + Status der Diagnosen. Strategaize-Admin bekommt einen Querblick auf alle Partner-Organisationen.

## Hintergrund

Aktuell hat die Plattform nur `tenant_admin`/`tenant_member`/`employee` und keine Partner-Konzepte. Das Tenant-Onboarding-Wizard-Pattern aus FEAT-031 V4.2 (Magic-Link-Invitation, ENV-konfigurierbarer Sender) ist direkt wiederverwendbar — Partner-Inhaber ist semantisch ein „Tenant-Admin eines Partner-Tenants", technisch aber eine neue Rolle.

## In Scope

- **Neue Tabelle `partner_organization`**:
  - `id UUID PK`
  - `tenant_id UUID FK REFERENCES tenants(id) ON DELETE CASCADE UNIQUE` (1:1 mit Partner-Tenant)
  - `legal_name TEXT NOT NULL`
  - `display_name TEXT NOT NULL` (kann gleich legal_name sein)
  - `partner_kind TEXT NOT NULL DEFAULT 'tax_advisor' CHECK IN ('tax_advisor')` — V8+ erweiterbar auf `'ma_advisor'` ohne Migration
  - `tier TEXT NULL` (Spalte fuer V3+ Tier-System, V6 immer NULL — heute mit anlegen, billig)
  - `contact_email TEXT NOT NULL`
  - `contact_phone TEXT NULL`
  - `country TEXT NOT NULL CHECK IN ('DE', 'NL')` (V6: nur diese zwei)
  - `created_by_admin_user_id UUID FK REFERENCES auth.users(id)` (welcher Strategaize-Admin angelegt hat)
  - `created_at`, `updated_at` Standard
- **Strategaize-Admin-UI** `/admin/partners`:
  - Liste aller Partner-Organisationen mit Status (aktive Mandanten-Zahl, letzter Diagnose-Stand)
  - Server Action `createPartnerOrganization()`: legt `tenants`-Eintrag mit `tenant_kind='partner_organization'` an, anschliessend `partner_organization`-Eintrag, anschliessend Standard-Branding-Eintrag (Default Strategaize-Look bis Partner anpasst)
  - Server Action `invitePartnerAdmin()`: Magic-Link-Einladung mit Rolle `partner_admin`, FEAT-031-Pattern wiederverwendet
  - Detail-Seite `/admin/partners/[partner_tenant_id]`: Partner-Stammdaten + Mandanten-Liste (Cross-Tenant-Sicht fuer strategaize_admin)
- **Partner-Admin-Dashboard** `/partner/dashboard`:
  - Sichtbar nur fuer Rolle `partner_admin`
  - Liste eigener Mandanten mit Status-Spalten:
    - „eingeladen, noch nicht angemeldet"
    - „angemeldet, Diagnose nicht gestartet"
    - „Diagnose in Bearbeitung (X von Y Bloecke)"
    - „Diagnose abgeschlossen (Bericht verfuegbar)"
    - „Lead an Strategaize gepusht am [Datum]"
  - Sub-Section „Partner-Stammdaten" mit Anzeige von `legal_name`, `display_name`, `contact_email`, `country` + Edit-Modal
  - Sub-Section „Mein Branding" mit Vorschau-Frame (Live-Preview des Mandanten-UIs unter aktuellen Branding-Settings)
  - Sub-Section „Meine Einladungen" mit Pending-Magic-Links + Resend-Button (FEAT-031-Pattern)
- **Navigation**: Top-Bar zeigt fuer `partner_admin` eine Partner-Sidebar mit „Mein Dashboard", „Meine Mandanten", „Branding" — analog Employee-Sidebar-Pattern aus V4

## Out of Scope

- Tenant-Schema-Erweiterungen + neue Rolle `partner_admin` (FEAT-041 Pflicht-Vorgaenger)
- `partner_client_mapping` + Mandanten-Einladungs-Flow (FEAT-043)
- `partner_branding_config`-Tabelle + CSS-Custom-Properties (FEAT-044)
- Lead-Push-Mechanik (FEAT-046)
- Mehrere Partner-Admin-Users pro Partner-Tenant (V7+)
- Partner-Employee-Rolle mit eingeschraenkter Mandanten-Sicht innerhalb Partner-Tenant (V7+)

## Akzeptanzkriterien

- Strategaize-Admin kann via `/admin/partners` eine neue Partner-Organisation anlegen + Owner-User einladen in < 5 Minuten (SC-V6-2)
- Partner-Tenant + `partner_organization`-Eintrag werden atomisch angelegt (Transaktion oder kompensierender Cleanup bei Fehler)
- Owner-User erhaelt Magic-Link-E-Mail mit korrektem Login-Link unter Partner-Subdomain bzw. `/login?partner=<slug>`
- Login als `partner_admin` fuehrt zu `/partner/dashboard` mit leerer Mandanten-Liste (initial)
- Strategaize-Admin sieht alle Partner-Organisationen in der `/admin/partners`-Liste mit korrektem Status
- RLS-Test: `partner_admin` von Partner A kann NICHT `/partner/dashboard` von Partner B aufrufen (Server-side Auth-Gate + DB-RLS)
- Audit-Log-Eintrag in `error_log` mit `category='partner_organization_created'` pro Anlage (analog DEC-088 V5-Audit-Pattern)
- TypeScript-Types fuer `PartnerOrganization` + Server-Action-Returns
- ESLint 0/0 auf neuen Files, Build PASS

## Abhaengigkeiten

- FEAT-041 (Foundation + RLS) — Pflicht-Vorgaenger
- Reuse: Tenant-Onboarding-Wizard FEAT-031 (Magic-Link-Einladung)
- Reuse: Berater-Visibility-Verlinkung FEAT-030 (Cross-Tenant-Admin-Sichten)
- Reuse: Self-Service-Status-Cockpit FEAT-027 (Status-Karten-Pattern fuer Mandanten-Liste)

## Verweise

- RPT-209 V6 Requirements (SC-V6-2, SC-V6-3)
- RPT-208 V6 Discovery
- MULTIPLIER_MODEL.md Achse 2 T2 Lead-Qualifikation (Partner sieht eigene Mandanten + Status)
- STRATEGY_NOTES_2026-05.md Abschnitt 7 Slice-Skizze SLC-081
- Pattern-Reuse: `src/app/admin/tenants/` (Cross-Tenant-Listing), `src/app/api/auth/invitation/` (Magic-Link)
