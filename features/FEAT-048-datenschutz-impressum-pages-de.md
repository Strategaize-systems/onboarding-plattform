# FEAT-048 — Datenschutz + Impressum Pages DE

**Version:** V6.2 Compliance-Sprint
**Status:** planned
**Created:** 2026-05-15
**Backlog-Item:** BL-102

## Purpose

Oeffentliche, DSGVO-konforme Datenschutzerklaerung + gesetzliches Impressum auf der Onboarding-Plattform-Domain `onboarding.strategaizetransition.com`. Pre-Production-Compliance-Gate-Pflicht vor erstem echten Live-Partner.

## In Scope

- **Route `/datenschutz`** — oeffentliche Page, kein Auth-Layer, im bestehenden Public-Layout (analog `/login`).
- **Route `/impressum`** — oeffentliche Page, kein Auth-Layer.
- **Footer-Erweiterung** — Links zu `/datenschutz` + `/impressum` im globalen `StrategaizePoweredFooter` (zusaetzlich zum bestehenden "Powered by Strategaize"-Link).
- **DE-Text-Drafts** als pragmatische Standardvorlage:
  - Datenschutz deckt: erhobene Daten, Rechtsgrundlagen (Art. 6 DSGVO), Empfaenger/Drittanbieter (Hetzner FRA, AWS Bedrock eu-central-1, Azure Whisper EU, IONOS SMTP), Speicherdauer, Betroffenenrechte, Beschwerderecht, functional-Cookie (`sidebar:state`).
  - Impressum nach TMG §5 (Verantwortlicher, Anschrift, Kontakt, Vertretungsberechtigter, ggf. KvK/USt-IdNr).
- **Verantwortlicher** = Strategaize Transition BV (NL-Operativ). KvK + Adresse + Vertretungsberechtigter via ENV-Var-Layout (in /architecture geklaert).
- **Branding** Strategaize-Default (pre-auth/public, kein Partner-Branding).

## Out of Scope V6.2

- NL/EN-Variante (NL kommt als V6.3-Folge-Slice vor NL-Pilot, EN bei Bedarf spaeter).
- Cookie-Consent-Banner (kein non-essentielles Tracking aktiv; einziger Cookie ist functional/legitimate-interest).
- Cookie-Manager / Granular-Opt-Out (nicht relevant, kein Tracking).
- Sprach-Switch-UI auf den Pages selbst.
- Anwalts-Review-Ausfuehrung (User-Pflicht, separater Schritt nach Code-Side-Release).

## Constraints

- Pre-auth — kein Supabase-Auth-Wrapper, einfache Server-Component oder statischer Render.
- next-intl ist aktiv (DE+EN+NL Locales), aber V6.2 nutzt nur DE — kein Locale-Prefix in der V6.2-Route. Routes `/datenschutz` und `/impressum` ohne `/de`-Prefix. Sprach-Switch-Vorbereitung fuer V6.3 in /architecture klaeren.
- Texte mit Disclaimer "keine Rechtsberatung — Anwalts-Review pending".

## Open Questions (zur Klaerung in /architecture)

1. **Markdown-Render-Pattern**: Reuse aus Handbuch-Reader (V4.1) oder neuer Approach (`react-markdown`, `@next/mdx`, statisches Markup)?
2. **ENV-Var-Layout fuer Impressum**: monolithischer HTML-Block oder granular (Company, Street, ZIP, City, Country, KvK, VAT, Director)?
3. **Footer-Link-Scope**: nur Datenschutz+Impressum oder zusaetzlich AVV-Download/mailto-Kontakt?
4. **Sprach-Switch-Vorbereitung**: /datenschutz V6.2 ohne Locale-Prefix, dann /[locale]/datenschutz fuer V6.3? Oder direkt mit next-intl-konformer Locale-Konfiguration?

## Success Criteria

- `/datenschutz` HTTP 200 mit korrektem DE-Markup
- `/impressum` HTTP 200 mit korrektem DE-Markup
- Footer-Links sichtbar auf allen Routes (auth + non-auth)
- ESLint + tsc + Vitest clean
- Quality-Gates PASS
