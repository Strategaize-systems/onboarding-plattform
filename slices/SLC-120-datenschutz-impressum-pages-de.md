# SLC-120 — Datenschutz + Impressum Pages DE (FEAT-048)

## Goal

**Oeffentliche DSGVO-konforme Datenschutzerklaerung + gesetzliches Impressum** auf der Onboarding-Plattform-Domain `onboarding.strategaizetransition.com`. Dritter V6.2-Slice (kann parallel zu SLC-122 + SLC-121 starten, weil keine harte Cross-Dependency auf deren Inhalt — der Datenschutz-Text zitiert COMPLIANCE.md inhaltlich, kann aber initial mit Platzhaltern befuellt werden und nach SLC-122-Abschluss verfeinert).

Frontend-only, kein Backend-Touch, keine DB-Migration. Footer-Erweiterung um 2 neue Next-Link-Komponenten.

## Feature

FEAT-048 (Datenschutz + Impressum Pages DE).

**Pattern-Reuse:**
- HandbookReader-Stack (DEC-049) fuer Markdown-Render: `react-markdown ^10.1.0 + remark-gfm ^4.0.1 + rehype-slug + rehype-autolink-headings` (bereits installiert in `package.json`).
- `StrategaizePoweredFooter.tsx` als Footer-Erweiterungsbasis (DEC-108 Pflicht-Footer).
- next-intl-Pattern fuer `getTranslations` in Server-Components.

## In Scope

### A — Markdown-Source-File `src/content/legal/datenschutz.de.md`

Vollstaendiger DSGVO-konformer Datenschutz-Text als Markdown:

- **Verantwortlicher**: Strategaize Transition BV (NL-Operativ) — Stammdaten via ENV-Variablen (DEC-116) in Impressum, hier nur Bezug.
- **Erhobene Daten**: Bezug auf `docs/COMPLIANCE.md` Sektion 1 (Tenant-Klassen + Cross-Cutting-Daten).
- **Rechtsgrundlagen** (Art. 6 DSGVO): Vertrag (Art. 6(1)(b)), berechtigtes Interesse (Art. 6(1)(f)), Einwilligung wo erforderlich (Art. 6(1)(a)).
- **Empfaenger / Drittanbieter**: Hetzner Cloud Frankfurt, AWS Bedrock eu-central-1, Azure Whisper EU, IONOS SMTP DE — analog `data-residency.md`.
- **Speicherdauer**: Bezug auf `docs/COMPLIANCE.md` Sektion 4 (Retention-Policies).
- **Betroffenenrechte**: Auskunft, Berichtigung, Loeschung, Datenuebertragbarkeit, Widerspruch, Beschwerderecht bei Aufsichtsbehoerde.
- **Cookies**: einziger Cookie `sidebar:state` (functional, legitimate-interest, kein Tracking) — daher kein Cookie-Banner.
- **Kein automatisiertes Profiling** im Sinne automatisierter Einzelfallentscheidungen.
- **Stand**: "Stand: 2026-05-15 (V6.2-Release, Anwalts-Review pending)".
- **Disclaimer**: "pragmatische Standardvorlage, Anwalts-Pruefung pending vor erstem echten Live-Partner".

### B — Server-Component `src/app/datenschutz/page.tsx`

- Liest `src/content/legal/datenschutz.de.md` zur Render-Zeit (`fs.readFileSync` via `path.join(process.cwd(), "src/content/legal/datenschutz.de.md")`).
- Rendert ueber `react-markdown` mit Plugins-Stack: `remark-gfm`, `rehype-slug`, `rehype-autolink-headings`. NICHT `rehype-raw` (nicht benoetigt, da kein Inline-HTML im Quell-Markdown), NICHT Highlight-Plugin (kein Code im Datenschutz-Text).
- Prose-Styling via `prose prose-slate max-w-none mx-auto py-12 px-4 max-w-3xl`.
- Page-Header (h1) "Datenschutzerklaerung" + Stand-Datum-Subline.
- Layout: public, pre-auth, keine Supabase-Auth-Wrappers. Direkt unter `src/app/` (NICHT in `src/app/[locale]/`) per DEC-119.

### C — Server-Component `src/app/impressum/page.tsx`

- Liest 9 ENV-Variablen aus DEC-116:
  - `IMPRESSUM_COMPANY` (Default: "Strategaize Transition BV")
  - `IMPRESSUM_STREET`
  - `IMPRESSUM_ZIP`
  - `IMPRESSUM_CITY`
  - `IMPRESSUM_COUNTRY` (Default: "Niederlande")
  - `IMPRESSUM_KVK` (NL-Handelsregisternummer)
  - `IMPRESSUM_VAT` (USt-IdNr / NL-BTW)
  - `IMPRESSUM_DIRECTOR` (Vertretungsberechtigter)
  - `IMPRESSUM_EMAIL` (Kontakt-E-Mail)
- Wirft `throw new Error('IMPRESSUM_COMPANY ENV missing — required by /impressum route')` (analog fuer alle Pflicht-ENVs) bei fehlender Pflicht-ENV. KEIN silent Default-Wert ausser bei COUNTRY und COMPANY.
- Setzt die Werte in eine i18n-DE-Template-Struktur (TMG/DDG §5 + DSGVO Art. 13):
  - Firmenname + Anschrift + Land
  - Kontakt-E-Mail (mailto-Link)
  - Vertretungsberechtigter
  - KvK-Nummer + USt-IdNr (VAT)
  - Disclaimer + Stand-Datum
- Prose-Styling identisch zu /datenschutz.
- Direkt unter `src/app/impressum/page.tsx` (kein Locale-Prefix per DEC-119).

### D — Footer-Erweiterung `src/components/branding/StrategaizePoweredFooter.tsx`

- Erweitert um 2 neue Next-Link-Komponenten zu `/datenschutz` und `/impressum`, gerendert **links** neben dem bestehenden "Powered by Strategaize"-Link.
- Layout: `[Datenschutz] · [Impressum] · [Powered by Strategaize ↗]` (separiert via `·`-Trenner).
- Beide neuen Links nutzen `getTranslations("footer")` mit Keys `footer.privacyPolicy` + `footer.imprint`.
- Footer bleibt Server-Component (`getTranslations` statt `useTranslations`).
- Visuelle Konsistenz: gleiche `text-sm text-gray-500 hover:underline`-Klassen.

### E — i18n-Keys

- `src/messages/de.json` Sektion `footer` erweitern um:
  - `privacyPolicy: "Datenschutz"`
  - `imprint: "Impressum"`
- Andere Locales (`en.json`, `nl.json`) optional mit gleichen Keys ergaenzen (DE-Default reicht in V6.2, V6.3 nimmt NL-Variante).

### F — ENV-Setup

- `.env.example` um 9 Impressum-Variablen erweitern mit Platzhalter-Werten und Kommentaren:
  ```
  # V6.2 Compliance — Impressum-Stammdaten (DEC-116)
  # Pflicht vor /deploy V6.2. Server-Component wirft Error bei fehlender Pflicht-ENV.
  IMPRESSUM_COMPANY="Strategaize Transition BV"
  IMPRESSUM_STREET="[Strasse + Hausnummer]"
  IMPRESSUM_ZIP="[PLZ]"
  IMPRESSUM_CITY="[Stadt]"
  IMPRESSUM_COUNTRY="Niederlande"
  IMPRESSUM_KVK="[NL-KvK-Nummer]"
  IMPRESSUM_VAT="[NL-BTW-Nummer]"
  IMPRESSUM_DIRECTOR="[Vertretungsberechtigter]"
  IMPRESSUM_EMAIL="[Kontakt-Mail]"
  ```
- Coolify-Secrets-Doku in MT-7 oder am Slice-Ende: User-Pflicht-Hinweis fuer /deploy.

## Out of Scope

- **NL/EN-Variante** der Pages — NL → V6.3 vor NL-Pilot (DEC-119 `/[locale]/`-Refactor). EN bei Bedarf spaeter.
- **Cookie-Consent-Banner** — kein non-essentielles Tracking aktiv, kein Banner noetig.
- **Cookie-Manager / Granular-Opt-Out** — N/A.
- **Sprach-Switch-UI** auf den Pages selbst — keine UI fuer Locale-Wahl in V6.2.
- **Anwalts-Review-Ausfuehrung** — User-Pflicht (BL-104), separater Schritt nach Code-Side-Release.
- **AVV-Download-Link im Footer** — Footer-Scope minimal per DEC-118.
- **mailto-Kontakt-Link im Footer** — separate Footer-Erweiterung nicht in V6.2-Scope.
- **OpenGraph/SEO-Meta-Tags** fuer die Pages — kein V6.2-Pflicht-Item (Standard-Next.js-Defaults reichen).

## Acceptance Criteria

| AC | Beschreibung |
|---|---|
| AC-1 | `src/content/legal/datenschutz.de.md` existiert mit allen Pflicht-DSGVO-Sektionen (Verantwortlicher, Daten, Rechtsgrundlagen, Empfaenger, Speicherdauer, Betroffenenrechte, Cookies, Profiling-Klausel). |
| AC-2 | `src/app/datenschutz/page.tsx` Server-Component liefert HTTP 200 mit korrektem DE-Markup nach `npm run build` + Local-Dev-Server. Markdown gerendert via react-markdown mit Plugins (remark-gfm + rehype-slug + rehype-autolink-headings). Heading-Anchors automatisch. |
| AC-3 | `src/app/impressum/page.tsx` Server-Component liest alle 9 ENV-Variablen und rendert sie in i18n-DE-Template-Struktur. Bei fehlender Pflicht-ENV wird Server-Error mit klarer Meldung geworfen (kein silent Default). |
| AC-4 | `StrategaizePoweredFooter.tsx` zeigt 3 Links in Reihenfolge `[Datenschutz] · [Impressum] · [Powered by Strategaize ↗]`. |
| AC-5 | Footer-Links sind auf **allen Routes** sichtbar (auth + non-auth) — verifiziert mit Smoke auf `/`, `/login`, `/dashboard` (mit Test-User), `/datenschutz`, `/impressum`. |
| AC-6 | `src/messages/de.json` enthaelt `footer.privacyPolicy` und `footer.imprint` Keys. |
| AC-7 | `.env.example` enthaelt alle 9 `IMPRESSUM_*`-Variablen mit Platzhalter-Werten und V6.2-Kommentar. |
| AC-8 | `npm run lint` 0/0 auf allen neuen + geaenderten Files. |
| AC-9 | `npm run build` PASS mit Dummy-Impressum-ENVs (Build muss durchlaufen ohne fehlende ENV-Fehler — die Errors werden zur Render-Zeit geworfen, nicht zur Build-Zeit). |
| AC-10 | `tsc` EXIT=0 volltree. |
| AC-11 | `npm run test` Vitest-Suite gruen — keine Regression auf bestehenden Footer/Branding/dashboard-Tests. |
| AC-12 | Cross-Link aus `datenschutz.de.md` zu `docs/COMPLIANCE.md` Sektionen funktioniert (Werte in der Page selbst zitiert oder als Externer-Link-Hinweis). |
| AC-13 | Pages haben kein Locale-Prefix in der URL (`/datenschutz` direkt, NICHT `/de/datenschutz`) per DEC-119. |
| AC-14 | Optional: Mobile-Browser-Smoke (Responsive-Check), kein eigener AC, aber im /qa-Bericht erwaehnen. |

## Micro-Tasks

### MT-1: Markdown-Quelldatei `src/content/legal/datenschutz.de.md` erstellen

- Goal: Vollstaendigen DSGVO-konformen Datenschutz-Text als Markdown mit allen Pflicht-Sektionen schreiben.
- Files: `src/content/legal/datenschutz.de.md` (NEU), `src/content/legal/` (Verzeichnis NEU falls noch nicht existent).
- Expected behavior: Markdown-Datei mit Verantwortlicher-Sektion (Verweis auf Impressum), Daten-Sektion (Verweis auf COMPLIANCE.md), Rechtsgrundlagen, Empfaenger-Liste (4 Sub-Provider), Speicherdauer-Hinweis (Verweis auf COMPLIANCE.md), Betroffenenrechte-Liste (Art. 15-22 + Beschwerderecht), Cookies-Klausel (nur sidebar:state functional, kein Banner-Pflicht), Profiling-Klausel (kein automatisiertes Profiling), Disclaimer + Stand-Datum.
- Verification: VS Code Markdown-Preview rendert sauber. Inhalt deckt alle DSGVO-Art-13-Pflichtangaben ab. Disclaimer prominent oben.
- Dependencies: keine (SLC-122 nicht hart erforderlich — Datenschutz-Text kann initial Platzhalter-Verweise auf COMPLIANCE.md enthalten, die nach SLC-122-Abschluss verfeinert werden).

### MT-2: `src/app/datenschutz/page.tsx` Server-Component mit react-markdown-Render

- Goal: Server-Component, die das Markdown-File liest und via react-markdown rendert.
- Files: `src/app/datenschutz/page.tsx` (NEU), `src/app/datenschutz/` (Verzeichnis NEU).
- Expected behavior: Server-Component imported `fs` und `path` aus node-Standard. Liest `path.join(process.cwd(), "src/content/legal/datenschutz.de.md")`. Rendert via `<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug, rehypeAutolinkHeadings]}>{content}</ReactMarkdown>`. Prose-Styling `prose prose-slate max-w-3xl mx-auto py-12 px-4`. Page-Header h1 "Datenschutzerklaerung". Layout pre-auth, kein Auth-Wrapper. Stand-Datum-Subline.
- Verification: `npm run dev` → Browser auf `/datenschutz` → HTTP 200 + Page rendert mit DE-Markup. tsc + ESLint 0 Errors. `curl -s http://localhost:3000/datenschutz | head -50` zeigt HTML-Output mit Datenschutz-Heading.
- Dependencies: MT-1.

### MT-3: `src/app/impressum/page.tsx` Server-Component mit ENV-Read + Error-Wurf

- Goal: Server-Component, die alle 9 IMPRESSUM_*-ENVs liest und im DE-Template rendert.
- Files: `src/app/impressum/page.tsx` (NEU), `src/app/impressum/` (Verzeichnis NEU).
- Expected behavior: Server-Component liest `process.env.IMPRESSUM_COMPANY` etc. Default-Werte nur fuer COMPANY ("Strategaize Transition BV") und COUNTRY ("Niederlande"). Wirft `throw new Error('IMPRESSUM_STREET ENV missing — required by /impressum route. Set in .env.local or Coolify secrets.')` bei fehlender Pflicht-ENV. Wirft analog fuer ZIP/CITY/KVK/VAT/DIRECTOR/EMAIL. Rendert i18n-DE-Template mit allen Werten in der Reihenfolge: Firmenname, Anschrift, Land, E-Mail (mailto), Vertretungsberechtigter, KvK-Nummer, USt-IdNr/VAT, Disclaimer + Stand-Datum. Page-Header h1 "Impressum". Prose-Styling identisch zu /datenschutz.
- Verification: `npm run dev` mit `.env.local`-Platzhalter-Werten → Browser auf `/impressum` → HTTP 200 + Page rendert. ENV-Wert wird in der gerenderten Page sichtbar. Bei manueller Ent-Setzung einer Pflicht-ENV: Server-Error mit klarer Meldung. tsc + ESLint 0 Errors.
- Dependencies: keine (parallel zu MT-2 moeglich).

### MT-4: `StrategaizePoweredFooter.tsx` Erweiterung um 2 Next-Link-Komponenten

- Goal: Footer-Komponente um 2 neue Links erweitern.
- Files: `src/components/branding/StrategaizePoweredFooter.tsx` (modifiziert).
- Expected behavior: 2 neue `<Link>` aus `next/link` zu `/datenschutz` und `/impressum`. Layout: `[Datenschutz] · [Impressum] · [Powered by Strategaize ↗]` (separiert via `·`-Trenner als statisches Text-Element). Beide Links nutzen `t("privacyPolicy")` und `t("imprint")` aus `getTranslations("footer")`. Visuelle Konsistenz: gleiche `hover:underline`-Klassen wie bestehender Powered-by-Link. Footer-Layout bleibt zentriert.
- Verification: Browser-Smoke auf 3 Routes (`/`, `/login`, `/dashboard` mit Test-User) → Footer zeigt 3 Links mit Trennzeichen. Klick auf `/datenschutz` und `/impressum` navigiert korrekt. tsc + ESLint 0 Errors.
- Dependencies: MT-5 (i18n-Keys muessen existieren, sonst Translation-Error).

### MT-5: i18n-Keys `footer.privacyPolicy` + `footer.imprint` in `de.json`

- Goal: i18n-Keys ergaenzen, damit MT-4 sie via `getTranslations` lesen kann.
- Files: `src/messages/de.json` (modifiziert), optional `src/messages/en.json` + `src/messages/nl.json` (NL-Variante kommt erst V6.3, hier nur Stub mit DE-Werten erlaubt).
- Expected behavior: `de.json` enthaelt unter `footer`-Sektion: `"privacyPolicy": "Datenschutz"` und `"imprint": "Impressum"`. Bestehende Footer-Keys (`poweredByStrategaize`) bleiben unangetastet.
- Verification: tsc 0 Errors. Browser-Smoke nach MT-4 zeigt deutsche Texte in den Links.
- Dependencies: keine.

### MT-6: `.env.example` erweitern + Coolify-Secrets-Doku ergaenzen

- Goal: Beispielwerte fuer die 9 Impressum-ENVs in `.env.example` einfuegen mit V6.2-Kommentar-Header.
- Files: `.env.example` (modifiziert), `docs/RUNBOOK.md` (modifiziert, falls existent, sonst nicht zwingend).
- Expected behavior: `.env.example` enthaelt am Ende einen neuen Abschnitt mit Kommentar-Header "V6.2 Compliance — Impressum-Stammdaten (DEC-116)", gefolgt von den 9 Variablen mit Platzhalter-Werten in eckigen Klammern. RUNBOOK.md (falls existent): Hinweis im V6.2-Deploy-Abschnitt, dass die 9 ENVs in Coolify-Secrets gesetzt werden muessen vor /deploy.
- Verification: `cat .env.example | grep IMPRESSUM` zeigt alle 9 Variablen. Kein Wert-Leak in den Platzhaltern (eckige Klammern).
- Dependencies: keine (parallel zu allen anderen MTs moeglich).

### MT-7: Quality-Gates + Browser-Smoke Full

- Goal: Volle Quality-Gates-Pruefung + Browser-Smoke auf allen 3 neuen Routes + Footer-Sichtbarkeit auf bestehenden Routes.
- Files: kein neuer File, nur Verify-Schritte.
- Expected behavior: `npm run lint` 0 Warnings/Errors auf 7 geaenderten/neuen Files. `tsc` EXIT=0 volltree. `npm run build` PASS mit Dummy-Impressum-ENVs in `.env.local` (Werte koennen Platzhalter sein, Build muss durchlaufen weil Error erst zur Render-Zeit geworfen wird). `npm run test` Vitest gruen. Browser-Smoke: `/datenschutz` HTTP 200 + Markdown-Render OK + Heading-Anchors gerendert. `/impressum` HTTP 200 + alle 9 ENVs sichtbar. `/login` Footer zeigt 3 Links. Klick-Test auf alle 3 Footer-Links navigiert korrekt. Responsive-Check auf 375px breite Viewport (Mobile-Smoke).
- Verification: Alle Pruefungen dokumentiert im /qa-Bericht. Falls Browser-Smoke nicht durchfuehrbar wegen Local-Dev-Issues: explizit als "code-side verified, Live-Smoke deferred to /deploy" markieren.
- Dependencies: MT-1 bis MT-6.

## Rollback-Pfad

- **MT-1 datenschutz.de.md**: pure Doku-Aenderung. Revert via `git revert <commit>` falls Inhalt grob falsch ist.
- **MT-2/MT-3 Pages**: pure Code-Aenderung. Revert via Git. Routes werden 404 nach Revert — Footer-Links sollten parallel revertiert werden (siehe MT-4).
- **MT-4 Footer**: pure Code-Aenderung. Revert via Git. Footer zeigt nur noch "Powered by Strategaize"-Link (V6.1-Stand).
- **MT-5 i18n-Keys**: pure JSON-Aenderung. Revert via Git.
- **MT-6 .env.example**: pure Doku-Aenderung. Revert via Git. Aktive ENVs in Coolify bleiben, koennen manuell entfernt werden wenn /impressum-Route revertiert ist.

Reihenfolge bei Revert (gesamter Slice): MT-4 + MT-5 zuerst (Footer-Links + i18n-Keys), dann MT-2 + MT-3 (Pages), dann MT-1 + MT-6 (Doku). Sonst zeigt Footer Links auf 404-Pages.

## DEC-Cross-References

- **DEC-116** — Impressum-Stammdaten granular ueber 9 ENVs.
- **DEC-117** — react-markdown-Reuse aus HandbookReader (DEC-049) fuer datenschutz.de.md.
- **DEC-118** — Footer-Scope nur Datenschutz + Impressum.
- **DEC-119** — Routes ohne Locale-Prefix in V6.2.
- **DEC-049** — react-markdown + remark-gfm + rehype-slug + rehype-autolink-headings als Standard-Stack.
- **DEC-108** — Pflicht-Footer hardcoded Server-Component (Footer-Erweiterungsbasis).

## Pattern-Reuse-Quellen

- `src/components/handbook/HandbookReader.tsx` — react-markdown-Plugin-Stack als Pattern.
- `src/components/branding/StrategaizePoweredFooter.tsx` — Footer-Erweiterungsbasis.
- `src/messages/de.json` (bestehender Footer-Block) — i18n-Pattern.

## Estimated Effort

~3-4h Code-Side + ~30-45min User-Pflicht (Coolify-Secrets-Setup vor /deploy). Verteilung:

- MT-1 (datenschutz.md): ~60-90min Schreiben
- MT-2 (datenschutz/page.tsx): ~20min
- MT-3 (impressum/page.tsx): ~30min
- MT-4 (Footer-Erweiterung): ~15min
- MT-5 (i18n-Keys): ~5min
- MT-6 (.env.example): ~10min
- MT-7 (Quality-Gates + Browser-Smoke): ~30-45min

User-Pflicht-Hinweis fuer /deploy V6.2: 9 Coolify-Secrets setzen.
