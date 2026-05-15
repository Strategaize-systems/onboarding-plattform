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

## Architecture Decisions (entschieden in /architecture V6.2, RPT-266)

- **DEC-116** — Impressum-Stammdaten granular ueber 9 ENV-Variablen (`IMPRESSUM_COMPANY`, `_STREET`, `_ZIP`, `_CITY`, `_COUNTRY`, `_KVK`, `_VAT`, `_DIRECTOR`, `_EMAIL`). Server-Component wirft Error bei fehlender Pflicht-ENV. Default-Land = Niederlande.
- **DEC-117** — Markdown-Render-Pattern: Reuse aus HandbookReader (DEC-049). `src/content/legal/datenschutz.de.md` wird per `react-markdown + remark-gfm + rehype-slug + rehype-autolink-headings` gerendert (Subset des HandbookReader-Stacks, ohne `rehype-raw`/Highlight). Prose-Styling via `prose prose-slate max-w-none`.
- **DEC-118** — Footer-Link-Scope nur Datenschutz + Impressum (`[Datenschutz] · [Impressum] · [Powered by Strategaize ↗]`). Keine AVV-Download-/mailto-/Cookie-Link-Erweiterung.
- **DEC-119** — Routes `/datenschutz` und `/impressum` OHNE Locale-Prefix in V6.2 (DE-Only-Scope). V6.3 verschiebt nach `/[locale]/datenschutz` mit 301-Redirect.

## Success Criteria

- `/datenschutz` HTTP 200 mit korrektem DE-Markup
- `/impressum` HTTP 200 mit korrektem DE-Markup
- Footer-Links sichtbar auf allen Routes (auth + non-auth)
- ESLint + tsc + Vitest clean
- Quality-Gates PASS
