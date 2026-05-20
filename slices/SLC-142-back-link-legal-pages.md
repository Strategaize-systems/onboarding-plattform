# SLC-142 — FEAT-061 Back-Link auf /datenschutz + /impressum

**Feature:** FEAT-061
**Version:** V7.1
**Status:** planned
**Created:** 2026-05-20
**Estimated effort:** ~15-30min Code-Side
**Pre-Conditions:** Keine (parallel zu anderen Slices moeglich, aber empfohlen am Ende der V7.1-Iteration als Quick-Win)
**Worktree:** `slc-142-back-link-legal-pages` (Pflicht)

## Zweck

Shared LegalPageHeader-Komponente + Integration auf /datenschutz + /impressum. Quick-Win-Polish — User klickt aus Footer auf Legal-Page, sieht expliziten "Zurueck"-Link statt nur Browser-Back.

## In Scope

Siehe FEAT-061. Konkret:
- LegalPageHeader Shared Component mit Back-Link + Page-Title.
- Integration auf /datenschutz + /impressum.

## Out of Scope

- Breadcrumb-Trail (V8+).
- Sticky-Header beim Scrollen.
- Andere Statik-Pages (z.B. /agb, /cookies).
- EditableText-Integration des Page-Titles (zu trivial, lohnt nicht).

## Micro-Tasks

### MT-1: LegalPageHeader-Komponente + Integration + Tests
- Goal: Shared Component mit `pageTitle` (Pflicht-Prop) + `defaultBackHref` (Default `/dashboard`). Client-Component mit `useRouter().back()` als primaerer Action, Fallback auf `<Link href={defaultBackHref}>` wenn document.referrer leer/extern. Integration auf beiden Pages.
- Files: `src/components/legal/LegalPageHeader.tsx`, `src/components/legal/__tests__/LegalPageHeader.test.tsx`, `src/app/datenschutz/page.tsx` (Erweiterung), `src/app/impressum/page.tsx` (Erweiterung).
- Expected behavior: Header rendert "← Zurueck" oben links + Page-Title prominent rechts. Klick auf Back-Link triggert router.back() wenn document.referrer auf gleicher Domain, sonst navigiert zu defaultBackHref. Visuell konsistent mit Style Guide V2 (Pre-Polish-Tokens aus SLC-140 verfuegbar).
- Verification: Vitest 3 Cases (Render pageTitle + Back-Link, Klick mit Referrer triggert router.back, Klick ohne/external Referrer triggert navigation zu defaultBackHref). Manueller Smoke: klick auf /datenschutz aus /dashboard-Footer -> klick Back-Link -> zurueck zu /dashboard.
- Dependencies: Keine.

### MT-2: Records-Update
- Goal: Records auf done.
- Files: `slices/INDEX.md`, `planning/backlog.json` (BL-113 -> done), `features/INDEX.md` (FEAT-061 -> done), `docs/STATE.md`.
- Expected behavior: Cockpit zeigt SLC-142 done.
- Verification: Cockpit-Refresh.
- Dependencies: MT-1.

## Acceptance Criteria

Siehe FEAT-061 AC-1..6.

## Risiken

- document.referrer kann bei https-Same-Site sometimes leer sein (Browser-Policy) -> Fallback wichtig.
- Klick-Erlebnis bei Iframe-Embed nicht testbar.
- Falls Style Guide V2 noch nicht voll-aktiv (SLC-140-Pre-Slice-Status), kann das Header-Visual minimal vom Final-Look abweichen. Akzeptabel als Quick-Win.
