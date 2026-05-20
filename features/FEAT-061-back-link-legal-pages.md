# FEAT-061 — Back-Link auf /datenschutz + /impressum

**Version:** V7.1
**Status:** planned
**Created:** 2026-05-20

## Zweck

Header-Back-Link "Zurueck" oben links auf `/datenschutz` + `/impressum`-Pages. Quick-Win-Polish — User klickt aus Footer auf Datenschutz-Link, sieht heute keinen sichtbaren Weg zurueck zur Source-Page. Browser-Back funktioniert, aber UX-Defizit. Adressiert BL-113.

## Hintergrund

SLC-700-Live-Test 2026-05-20: Mandant klickt im Diagnose-Dashboard-Footer auf "Datenschutz" oder "Impressum", landet auf Statik-Page, fragt sich "wie komme ich jetzt zurueck". Browser-Back-Pfeil funktioniert, aber kein explizites UI-Element fuer den Rueckweg.

## In Scope

- **Shared Component `<LegalPageHeader>`** in `src/components/legal/LegalPageHeader.tsx`:
  - Props: `pageTitle: string` (Pflicht), `defaultBackHref?: string` (Default `'/dashboard'`).
  - Rendert:
    - Back-Link oben links: "← Zurueck" mit Hover-Effekt.
    - Page-Title prominent rechts daneben.
    - Subtile Hintergrund-Stripe oder Border-Bottom.
  - Back-Link-Logik:
    - Client-Component mit `useRouter().back()` als primaerer Action.
    - Fallback bei `document.referrer === ''` oder externen Referrer: `<Link href={defaultBackHref}>`.
- **Integration auf `/datenschutz`** (`src/app/datenschutz/page.tsx`):
  - `<LegalPageHeader pageTitle="Datenschutz" />` als erstes Page-Element.
  - Bestehender Markdown-Content bleibt unveraendert.
- **Integration auf `/impressum`** (`src/app/impressum/page.tsx`):
  - `<LegalPageHeader pageTitle="Impressum" />` analog.
- **Edge-Cases**:
  - Direkt-Link auf `/datenschutz` ohne Referrer → Back-Link fuehrt zu `/dashboard` (Default-Fallback).
  - Im embedded Iframe oder externe Referrer → Default-Fallback.
- **Vitest-Coverage**:
  - `<LegalPageHeader>` rendert pageTitle + Back-Link.
  - Klick auf Back-Link triggert `router.back()` wenn Referrer vorhanden.
  - Fallback auf `defaultBackHref` wenn Referrer leer.

## Out of Scope

- **Breadcrumb-Trail** (mehrere Hierarchie-Ebenen) — V7.1 nur einzelner Back-Link.
- **Sticky-Header** beim Scrollen — V7.1 nur top-of-page.
- **Animation** beim Back-Klick — V7.1 nur Standard-Browser-Verhalten.
- **Andere Statik-Pages** (z.B. `/agb`, `/cookies` falls existent) — V7.1 nur die zwei genannten Pages.
- **EditableText-Integration des Page-Titles** — pageTitle bleibt Hardcoded-Default (so trivial dass FEAT-056-Migration nicht lohnt).

## Akzeptanzkriterien

- AC-1: `<LegalPageHeader>` Component existiert mit Props `pageTitle` + optionalem `defaultBackHref`.
- AC-2: `/datenschutz` Page rendert Header mit "Datenschutz"-Title + Back-Link.
- AC-3: `/impressum` Page rendert Header mit "Impressum"-Title + Back-Link.
- AC-4: Back-Link-Klick mit vorhandenem Referrer triggert `router.back()`.
- AC-5: Back-Link-Klick ohne Referrer navigiert zu `/dashboard`.
- AC-6: Visuelles Design konsistent mit Style Guide V2.

## Abhaengigkeiten

- **Pattern-Reuse**: Next.js `useRouter` + `Link`-Komponente.
- **Pattern-Reuse**: lucide-react `ArrowLeft`-Icon.
- **Style-Guide-Dep**: Style Guide V2 fuer Header-Styling (Foundation-konform).
- **Hard-Dep**: Keine. FEAT-061 ist self-contained Quick-Win.
- **Downstream-Dep**: Keine.
