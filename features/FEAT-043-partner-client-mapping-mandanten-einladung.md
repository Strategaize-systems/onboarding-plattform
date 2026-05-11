# FEAT-043 — Partner-Client-Mapping + Mandanten-Einladung

**Version:** V6
**Status:** planned
**Created:** 2026-05-11

## Zweck

Steuerberater laedt einen Mandanten ein, der Mandant wird als eigener `partner_client`-Tenant angelegt und ueber `partner_client_mapping` an den Partner gebunden. Mandant erhaelt Magic-Link, kann sich einloggen, sieht ein Mandanten-Dashboard mit verfuegbaren Diagnose-Aufgaben unter Partner-Branding (FEAT-044).

## Hintergrund

Die `parent_partner_tenant_id`-FK aus FEAT-041 erlaubt rein Datenstruktur die Eltern/Kind-Beziehung. Aber die Frage „welche Mandanten gehoeren welchem Partner-User" verdient eine eigene `partner_client_mapping`-Tabelle als Sichtbarkeits-Layer (1:N statt 1:1, robust gegen Partner-User-Wechsel innerhalb Partner-Tenant, V7+-tauglich).

FEAT-031 Tenant-Onboarding-Wizard liefert das Magic-Link-Pattern wieder.

## In Scope

- **Neue Tabelle `partner_client_mapping`**:
  - `id UUID PK`
  - `partner_tenant_id UUID FK REFERENCES tenants(id) ON DELETE CASCADE`
  - `client_tenant_id UUID FK REFERENCES tenants(id) ON DELETE CASCADE`
  - UNIQUE constraint `(partner_tenant_id, client_tenant_id)` (kein Doppel-Mapping)
  - `invited_by_user_id UUID FK REFERENCES auth.users(id)` (welcher Partner-Admin eingeladen hat)
  - `invitation_status TEXT NOT NULL CHECK IN ('invited', 'accepted', 'revoked')`
  - `invited_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `accepted_at TIMESTAMPTZ NULL`
  - `revoked_at TIMESTAMPTZ NULL`
- **CHECK-Constraint**: `partner_tenant_id` muss `tenant_kind='partner_organization'` sein, `client_tenant_id` muss `tenant_kind='partner_client'` sein (Trigger oder applikativer Guard, ggf. beides)
- **Server Action `inviteMandant(partner_tenant_id, mandant_email, mandant_company_name, mandant_first_name, mandant_last_name)`** (`partner_admin`-Rolle):
  - Legt neuen Tenant mit `tenant_kind='partner_client'`, `parent_partner_tenant_id=partner_tenant_id` an
  - Legt `partner_client_mapping`-Eintrag mit `invitation_status='invited'` an
  - Versendet Magic-Link-E-Mail an `mandant_email` mit Login-Link
  - Audit-Log-Eintrag in `error_log` mit `category='partner_mandant_invited'`
- **Server Action `acceptMandantInvitation(token)`** (Mandant-User klickt Link):
  - Verifiziert Magic-Link-Token (Reuse FEAT-031-Pattern)
  - Setzt `invitation_status='accepted'`, `accepted_at=now()`
  - Erstellt `auth.users`-Eintrag fuer Mandant mit Rolle `tenant_admin` (innerhalb Mandanten-Tenants)
  - Login → Redirect auf Mandanten-Dashboard `/dashboard` (Partner-Branding aktiv)
- **Server Action `revokeMandantInvitation(mapping_id)`** (`partner_admin`-Rolle):
  - Setzt `invitation_status='revoked'`, `revoked_at=now()`
  - Mandant-Magic-Link wird invalidiert
  - Tenant-Daten bleiben erhalten (kein Cascade-Delete bei revoked — nur invited-State darf geloescht werden), ggf. spaeter Cleanup-Cron
- **Mandanten-Dashboard** `/dashboard` fuer Partner-Client-Mandanten:
  - Begruessungs-Block mit Partner-Branding (Logo + „Empfohlen von Steuerberater X")
  - Hauptkarte „Strategaize-Diagnose-Werkzeug starten" → fuehrt zu FEAT-045 Diagnose-Run
  - Sub-Karte „Mein Bericht" (sichtbar wenn Diagnose abgeschlossen)
  - Sub-Karte „Ich will mehr von Strategaize" (sichtbar nach Bericht-Fertigstellung) → fuehrt zu FEAT-046 Lead-Push-Opt-in
  - Pflicht-Footer „Powered by Strategaize" (FEAT-044)

## Out of Scope

- `partner_branding_config` + CSS-Custom-Properties Setup (FEAT-044)
- Diagnose-Werkzeug selbst (FEAT-045)
- Lead-Push-Mechanik (FEAT-046)
- Multi-User pro Mandant-Tenant (FEAT-043 nur Einzel-Geschaeftsfuehrer als Default — Mandant kann V7+ weitere Teammitglieder einladen ueber bestehendes FEAT-022 Employee-Pattern)
- Bulk-Mandanten-Import (CSV-Upload o.ae.) — V7+
- Pre-Filled-Profile-Daten beim Einladen (z.B. Partner sendet Mandant-Branche-Info im Einladungs-Token) — V7+

## Akzeptanzkriterien

- Partner-Admin kann via Dashboard-UI einen Mandant einladen (Form mit E-Mail + Firmenname + Vor-/Nachname)
- Mandant erhaelt E-Mail mit Magic-Link, Klick fuehrt zu Login mit Partner-Branding sichtbar
- Nach erstem Login: Mandanten-Dashboard erscheint, Diagnose-Werkzeug-Karte sichtbar
- `partner_client_mapping` zeigt korrekt `invitation_status='accepted'` mit `accepted_at`-Timestamp
- Partner-Admin von Partner A kann NICHT Mandanten von Partner B sehen (RLS-Test, Cross-Partner-Isolation, SC-V6-3)
- Mandant von Partner A kann NICHT Mandant von Partner B sehen (Cross-Client-Isolation)
- Mandant kann NICHT auf Partner-Admin-Routen zugreifen (`/partner/*` verboten fuer `tenant_admin`)
- `revokeMandantInvitation` invalidiert Magic-Link (Mandant kann ueber Link nicht mehr einloggen, falls noch nicht angenommen)
- Audit-Log-Eintraege fuer alle drei Aktionen (invite/accept/revoke)
- RLS-Pen-Test SLC-103-spezifisch: 8 Faelle (4 Operationen × 2 Cross-Partner-Faelle) auf `partner_client_mapping`

## Abhaengigkeiten

- FEAT-041 (Foundation + RLS) — Pflicht-Vorgaenger
- FEAT-042 (Partner-Organisation + Dashboard) — Pflicht-Vorgaenger fuer UI-Integration des Einladungs-Buttons
- Reuse: FEAT-031 Tenant-Onboarding-Wizard (Magic-Link, E-Mail-Versand-Pattern)
- Reuse: FEAT-022 Employee Role Pattern (Verifikations-Token-Verarbeitung)

## Verweise

- RPT-209 V6 Requirements (SC-V6-4)
- RPT-208 V6 Discovery
- MULTIPLIER_MODEL.md Achse 4 Modell-Erweiterung — „Steuerberater liefert Vertrauen, Strategaize liefert Substanz"
- STRATEGY_NOTES_2026-05.md Abschnitt 7 Slice-Skizze SLC-082
- Pattern-Reuse: `src/app/api/auth/invitation/route.ts`, `src/app/accept-invitation/page.tsx`
