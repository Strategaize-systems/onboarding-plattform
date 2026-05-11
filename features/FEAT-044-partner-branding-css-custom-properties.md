# FEAT-044 — Partner-Branding minimal + CSS-Custom-Properties Setup

**Version:** V6
**Status:** planned
**Created:** 2026-05-11

## Zweck

Co-Branding-Mechanik fuer Partner-Tenants: Partner-Admin kann sein Logo + eine primaere Akzentfarbe setzen, das Mandanten-UI und das Partner-Admin-UI uebernehmen die Branding-Werte zur Laufzeit. „Powered by Strategaize"-Pflicht-Footer ist nicht entfernbar. Dies ist die **erste Einfuehrung von CSS-Custom-Properties** in der Plattform.

## Hintergrund

Die Plattform ist heute komplett Strategaize-gebrandet, Tailwind-fest, keine Themable-Werte. Das Multiplikator-Modell (Achse 4 + MULTIPLIER_MODEL.md Modell-Erweiterung) fordert **„Co-Branding mit sichtbarem Strategaize"** — der Steuerberater darf vorne stehen, aber Strategaize muss erkennbar bleiben.

Der V6-Branding-Scope ist **bewusst minimal** (Discovery R-V6-4 Branding-Overengineering-Risk). Volle white-label-Tiefe ist explizit ausgeschlossen (MULTIPLIER_MODEL Achse 2 T5: niemals).

## In Scope

- **Neue Tabelle `partner_branding_config`**:
  - `id UUID PK`
  - `partner_tenant_id UUID FK REFERENCES tenants(id) ON DELETE CASCADE UNIQUE` (1:1)
  - `logo_url TEXT NULL` (Storage-URL, signed)
  - `primary_color TEXT NOT NULL DEFAULT '#2563eb'` (Strategaize-Default-Blau bis Partner aendert) — Hex-Format mit CHECK-Constraint
  - `secondary_color TEXT NULL` (optional, V6 ueberhaupt nutzen falls einfach, sonst V6.1)
  - `display_name TEXT NULL` (alternativ zu `partner_organization.display_name`, falls Partner anders dargestellt werden will, V6 optional)
  - `created_at`, `updated_at` Standard
- **Storage-Bucket `partner-branding-assets`**:
  - Logo-Upload via Server Action (Partner-Admin), Validation: max. 500KB, PNG/SVG/JPG, max. 1024×1024 px
  - Signed-URL-Pattern wiederverwendet aus Walkthrough-Storage (FEAT-034 Sicherheits-Pattern)
- **CSS-Custom-Properties Setup**:
  - Root-Layout-Component setzt `:root { --brand-primary: ...; --brand-accent: ...; }` per Server-Component-Lookup beim Login-Render
  - Tailwind-Config wird erweitert um theme-faehige Werte: `colors: { brand: { primary: 'rgb(var(--brand-primary) / <alpha-value>)', ... } }`
  - Komponenten, die Branding nutzen: Top-Bar-Background, Primary-Button-Color, Link-Color, Sidebar-Akzent
- **Branding-Resolver** Server-Side:
  - Bei Login → Lookup welcher Tenant-Kind: `partner_organization` → eigene Branding, `partner_client` → Branding des `parent_partner_tenant_id`, `direct_client` → Strategaize-Default
  - Werte werden als Server-Side-Inline-Style in `<html>` oder `<body>` Tag emittiert (kein Client-FOUC)
- **Pflicht-Footer „Powered by Strategaize"**:
  - Hardcoded Server-Component in jedem Layout das Branding-Resolver durchlaeuft
  - Strategaize-Logo + Text + Link auf `https://strategaize.com` (oder konfigurierbarer Strategaize-URL via ENV)
  - **Nicht ueber Partner-Config aenderbar** — selbst wenn Partner-Admin DB-Manipulationsversuche macht, Footer bleibt
- **Branding-UI** unter `/partner/dashboard/branding`:
  - Logo-Upload mit Live-Preview
  - Primary-Color-Picker (HTML5-native oder shadcn-Color-Picker)
  - „Vorschau"-Frame: rendert das Mandanten-Dashboard mit aktuellen Branding-Werten
  - „Speichern"-Button updated `partner_branding_config`

## Out of Scope

- Sekundaerfarbe Vollintegration (V6 optional, V6.1 als Pflicht falls Pilot-Feedback fordert)
- Mehrere Theme-Varianten (z.B. Light/Dark pro Partner) — V6.1+
- Email-Template-Branding (Partner-Logo in Magic-Link-Mail) — V7+
- Domain-Mapping (steuerberater-x.partner.strategaize.de) — V7+, falls je
- Custom Schriftart pro Partner — niemals (Lesbarkeits-Risk)
- Footer-Anpassung durch Partner (z.B. eigener Impressums-Link) — V7+
- White-Label (Strategaize-Hinweis vollstaendig entfernen) — **niemals**, ausdruecklich
- Logo-Bibliothek mit vorgefertigten Steuerberater-Logos — niemals
- A/B-Test verschiedener Branding-Varianten — V7+

## Akzeptanzkriterien

- Partner-Admin kann Logo hochladen (PNG/SVG/JPG, max. 500KB) und Primary-Color setzen
- Branding wird sofort in der Vorschau sichtbar
- Nach „Speichern": neuer Mandant-Tenant unter diesem Partner sieht beim Login das Partner-Logo + Partner-Akzentfarbe
- Pflicht-Footer „Powered by Strategaize" ist auf jeder Partner-UI- und Mandanten-UI-Seite sichtbar (SC-V6-9)
- Pflicht-Footer ist via DB-Manipulation der Branding-Config NICHT entfernbar (hardcoded Server-Component)
- Direkt-Kunden (Tenant-Kind `direct_client`) sehen weiter Strategaize-Default-Branding (kein Regression)
- Storage-Upload nur fuer `partner_admin`-Rolle moeglich (RLS auf Storage-Bucket)
- Logo wird signiert ausgeliefert (Server-Proxy-Pattern, kein direkter Bucket-Zugriff)
- Color-Picker validiert Hex-Format (Server-Side) + Color-Contrast-Check Warning falls zu hell/dunkel fuer Lesbarkeit
- TypeScript-Types fuer `BrandingConfig` + Server-Side-Branding-Resolver-Return

## Abhaengigkeiten

- FEAT-041 (Foundation + RLS) — Pflicht-Vorgaenger fuer partner_admin-RLS auf branding-Tabelle
- FEAT-042 (Partner-Dashboard) — Branding-UI lebt im Partner-Dashboard
- Reuse: Walkthrough-Storage-Pattern (FEAT-034) fuer signed URLs auf Logo-Bucket
- Reuse: Server-Component-Pattern aus Layout-Files

## Verweise

- RPT-209 V6 Requirements (SC-V6-4, SC-V6-9)
- RPT-208 V6 Discovery — Sektion 4.3 + R-V6-4 Branding-Overengineering-Risk
- MULTIPLIER_MODEL.md Achse 4 Modell-Erweiterung — „Steuerberater liefert Vertrauen, Strategaize liefert Substanz"
- MULTIPLIER_MODEL.md Achse 2 T5 — Whitelabel niemals
- STRATEGY_NOTES_2026-05.md Abschnitt 7 Slice-Skizze SLC-083
