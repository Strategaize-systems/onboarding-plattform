# SLC-162 — V8.1 Outro-Renderer + V8.0-CtaPage-Replacement (FEAT-067)

**Version:** V8.1
**Feature:** FEAT-067 (Lead-Conversion-Outro-Renderer PDF + Web-Bericht)
**Backlog:** BL-134
**Status:** planned
**Created:** 2026-05-30
**Priority:** High
**Estimate:** ~3-5h Code-Side + Smoke-PDF-Verification + Vitest
**Worktree Branch:** `v8-1-lead-conversion` (Cumulative-Single-Branch, gestartet in SLC-161 MT-0)

## Slice Goal

Liefert den **Lead-Conversion-Outro-Renderer** im PDF und V8-Web-Bericht. Ersetzt V8.0-CtaPage (Pages 16-17) komplett per DEC-170.

1. **PDF-Outro-Pages** in `src/lib/pdf/mandanten-report-v2/pages/outro.tsx` mit 4 Bloecken (Strategaize-Vorstellung + 3 LLM-augmentierte Empfehlungs-Cards + Video-Platzhalter + CTA-Slot)
2. **V8-Web-Bericht-Section** in `V8OutroSection.tsx` mit gleicher 4-Block-Hierarchie (Tailwind + shadcn/ui, Style Guide V2 konform)
3. **V8.0-CtaPage-Removal** aus V8.1-Render-Pipeline (DEC-170) — Code bleibt im Repo, wird nicht mehr aufgerufen
4. **Theme-Erweiterung** mit Outro-Card-Tokens (Verkaufs-Style per DEC-171, groessere Cards, Strategaize-Akzent)
5. **selectThreeHebel-Reuse + LLM-Augmentation** (`augmentEmpfehlungsText` aus SLC-161 wird sync aufgerufen mit Loading-Indication im Web)
6. **Tonality-Audit-Skript-Erweiterung** um V8.1-Outro-Statische-Texte
7. **Smoke-PDF-Test** — exakt 17 Seiten verifizieren, kein Doppel-CTA, alle 4 Bloecke rendern

CTA-Slot bleibt in V8.1-Outro vorbereitet — eigentliche CTA-Click-Mechanik kommt in SLC-163. SLC-162 rendert nur den visuellen Button-Slot mit Placeholder-URL `#cta-placeholder-replaced-in-slc163`.

## In Scope

### Strategaize-Vorstellungs-Texte (statisch, Pre-Slice User-Pflicht)
- **Pre-MT-1 User-Pflicht**: Founder schreibt 2-3 Absaetze in Strategaize-Wir-Voice. Bis Founder-Freigabe: Placeholder-Texte im Code als TODO-Markierung. Final-Text wird in MT-3 eingebaut.

### PDF-Renderer (@react-pdf v4)
- **`src/lib/pdf/mandanten-report-v2/pages/outro.tsx`** (NEU) — 2-Page-Section:
  - Page 16 (Hero + Strategaize-Vorstellung + 3 Empfehlungs-Cards):
    - Eyebrow "UEBER STRATEGAIZE" + Titel "Wir holen Sie ab"
    - 2-3 Absaetze Body
    - Header "Drei Bewegungen, die in Ihrem Unternehmen den Unterschied machen"
    - 3 Verkaufs-Style-Cards mit Modul-Name + Aktuelle-Stufe-Badge + LLM-Text + Strategaize-Akzent-Border
  - Page 17 (Video-Platzhalter + CTA + Strategaize-Footer):
    - Video-Block-Platzhalter mit Strategaize-Brand-Box (Logo + Tagline "Video folgt")
    - CTA-Hero-Card mit Magic-Link-URL-Slot (Placeholder bis SLC-163)
    - Strategaize-Footer (Brand-Block + Datenschutz/Impressum + Datum/Version)
- **`src/lib/pdf/mandanten-report-v2/theme.ts`** (UPDATE) — neue Outro-Card-Tokens: `outroCardBg`, `outroCardBorder`, `outroAccent`, `outroVideoBoxBg`, `outroSectionGap`
- **`src/lib/pdf/mandanten-report-v2/pages/__tests__/outro.test.ts`** (NEU) — Snapshot-Test der Component-Struktur

### PDF-Render-Pipeline-Modifikation
- **`src/lib/pdf/mandanten-report-v2/index.ts` (oder Renderer-Entry-Point)** (UPDATE) — V8.0-CtaPage-Aufruf entfernen, OutroPage-Aufruf einbauen
- **Strategaize-Footer Re-Use**: Page 17 nutzt Footer-Struktur aus V8.0-CtaPage (Brand-Block + Datenschutz/Impressum) — Refactor zu shared Component oder Copy-Adapt

### Web-Bericht-Component (Tailwind + shadcn/ui)
- **`src/app/dashboard/diagnose/[id]/V8OutroSection.tsx`** (NEU) — analoge 4-Block-Hierarchie:
  - Strategaize-Vorstellungs-Section (`<section>` mit Wir-Voice-Text)
  - 3 Empfehlungs-Cards (`<Card>` aus shadcn/ui mit Verkaufs-Style-Variants)
  - Video-Platzhalter (Strategaize-Logo + Tagline-Box)
  - CTA-Button (`<Button>` mit Server-Action-Hook-Placeholder bis SLC-163)
- **Web-Bericht-Page UPDATE**: `src/app/dashboard/diagnose/[id]/page.tsx` oder analog rendert `<V8OutroSection>` nach den Modul-Pages-Renderings
- **Loading-Indication**: Wenn V8.1-LLM-Augmentation laeuft (DEC-174 sync), zeigt Web-Bericht "Bericht wird erzeugt — KI-Augmentation laeuft (~20s)" mit Skeleton-Loader-Cards fuer die 3 Empfehlungs-Slots

### Tonality-Audit-Skript-Erweiterung
- **`scripts/tonalitaet-audit-v8.mjs`** (UPDATE) — Scope erweitert um V8.1-Outro-Texte (Strategaize-Vorstellung + CTA-Hero + Video-Platzhalter)
- Blacklist-Erweiterung um V8.1-spezifische Patterns: `\bich\b|mein Team|der Founder|Founders|Euro|EUR|Kosten|Preis`
- Audit gegen Live-DB statische Texte UND Smoke-PDF-Output

## Out of Scope

- **LLM-Augmentation-Backend** (FEAT-069) — SLC-161 (`augmentEmpfehlungsText` Pure-Function)
- **CTA-Mechanik + Magic-Link-Token + Dual-Email** (FEAT-068) — SLC-163
- **Echtes Video** (V8.1 Platzhalter) — V8.2+
- **Mehrsprachige Outro-Variante** (NL/EN) — V8.2+
- **A/B-Testing der Outro-Variante** — V8.2+
- **Re-Design der V8.0-Modul-Pages oder Hebel-Page** — V8.0 bleibt unveraendert
- **Editier-UI fuer Strategaize-Vorstellungs-Text im Admin** — V8.2+ (V8.1 nutzt statische Texte mit Founder-Freigabe)
- **Storage-Cache fuer Outro-PDF** — V8.1 generiert pro Request
- **Founder-Voice-Variante** — explizit Strategaize-Wir-Voice (DEC-170 + User-Direktive)

## Pre-Conditions

- ✓ SLC-161 done (LLM-Augmentation Pure-Function verfuegbar)
- ✓ V8.0 RELEASED, V8.0-CtaPage existiert
- ✓ V8.0-Theme `theme.ts` mit COLOR + SPACING etabliert
- ✓ selectThreeHebel Pure-Function existiert (V8.0 SLC-148 MT-4)
- ✓ capture_session.metadata.v8_report_snapshot existiert mit drei_hebel-Output
- ✓ DEC-170 V8.1-Outro ersetzt V8.0-CtaPage entschieden
- ✓ DEC-171 Verkaufs-Style-Cards entschieden
- ⏳ **Pre-MT-1 User-Pflicht**: Strategaize-Vorstellungs-Text-Freigabe (Founder)

## Micro-Tasks

### MT-1: Theme-Erweiterung + Outro-Card-Tokens
- **Goal**: `theme.ts` um Outro-spezifische Tokens erweitern (DEC-171 Verkaufs-Style).
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/theme.ts` (UPDATE — additiv)
  - `src/lib/pdf/mandanten-report-v2/__tests__/theme.test.ts` (UPDATE — Vitest fuer neue Tokens)
- **Expected behavior**: Neue Tokens `outroCardBg`, `outroCardBorder`, `outroAccent`, `outroVideoBoxBg`, `outroSectionGap`, `outroBadgeAktuelleStufe`. Bestehende V8.0-Tokens unveraendert.
- **Verification**: TSC EXIT=0. Vitest prueft Token-Existenz + Hex-Format. V8.0-Co-Existenz: Smoke-Snapshot-Test (Pages 1-15) zeigt 0 Visual-Drift.
- **Dependencies**: SLC-161 done

### MT-2: PDF-OutroPage Component — Page 16 (Vorstellung + 3 Cards)
- **Goal**: `outro.tsx` PageHero mit Strategaize-Vorstellung + 3 Empfehlungs-Cards (Verkaufs-Style).
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/outro.tsx` (NEU)
- **Expected behavior**:
  - Page 16: Eyebrow "UEBER STRATEGAIZE" + Titel "Wir holen Sie ab" + 2-3 Absaetze (Placeholder bis MT-3 Final-Text) + Header "Drei Bewegungen..." + 3 Cards
  - Pro Card: Modul-Name + "Aktuelle Stufe: X/5" Badge + LLM-Text (`hebel[i].text` aus selectThreeHebel + augmentEmpfehlungsText)
  - feedback_react_pdf_v4-Regeln beachten (kein rgba-Alpha, kein null-in-Style-Array)
- **Verification**: TSC EXIT=0. Smoke-Render-Test (Vitest) erzeugt PDF-Buffer, dann `pdfinfo`-Tool zaehlt Pages-Anzahl = 1 (Page 16 only).
- **Dependencies**: MT-1

### MT-3: Strategaize-Vorstellungs-Final-Text einbauen
- **Goal**: Founder-freigegebenen 2-3-Absatz-Text in OutroPage einbauen. Placeholder ersetzen.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/outro.tsx` (UPDATE)
- **Expected behavior**: Strategaize-Vorstellungs-Absaetze als statische Konstante (oder Text-Override-Lookup falls Inline-Text-Override-Foundation V7.1 genutzt werden soll). Founder-Freigabe-Datum als Code-Kommentar.
- **Verification**: Tonality-Audit `scripts/tonalitaet-audit-v8.mjs --scope=outro` 0 Treffer.
- **Dependencies**: MT-2 + **Pre-MT-1 User-Pflicht (Strategaize-Vorstellungs-Text-Freigabe)**

### MT-4: PDF-OutroPage Component — Page 17 (Video + CTA + Footer)
- **Goal**: Zweite Page mit Video-Platzhalter + CTA-Hero-Card + Strategaize-Footer.
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/pages/outro.tsx` (UPDATE — Page 17)
- **Expected behavior**:
  - Video-Block: Strategaize-Logo + Tagline "Wie wir arbeiten — Video folgt in Kuerze" in Brand-Box
  - CTA-Hero-Card: `brandPrimaryDark` Background analog V8.0-CtaPage, Eyebrow "NAECHSTER SCHRITT", Titel "Lassen Sie uns reden — unverbindlich, ohne Pricing-Druck", 2-3 Saetze Body, Magic-Link-CTA-Button mit Placeholder-URL `#cta-magic-link-token-replaced-in-slc163`
  - Strategaize-Footer wie V8.0-CtaPage Page 17 (Brand-Block + Datenschutz/Impressum + Datum/Version) — Copy-Adapt aus `cta.tsx`
- **Verification**: PDF-Buffer-Render zeigt jetzt 2 Pages (16+17). Smoke-Snapshot-Test prueft Brand-Box-Rendering + CTA-Card-Visuals.
- **Dependencies**: MT-3

### MT-5: V8.0-Render-Pipeline-Modifikation (CtaPage entfernen, OutroPage einbauen)
- **Goal**: V8.0-Renderer-Entry-Point ruft jetzt OutroPage statt CtaPage. Bestehende cta.tsx bleibt im Repo (Code-Reuse fuer Footer-Section, eventuell V8.2+).
- **Files**:
  - `src/lib/pdf/mandanten-report-v2/index.ts` ODER `src/lib/pdf/mandanten-report-v2/MandantenReportV2.tsx` (UPDATE)
- **Expected behavior**: Bestehender Renderer-Entry-Point hat `<CtaPage>` Aufruf — wird durch `<OutroPage>` ersetzt. Andere Pages (1-15) unveraendert.
- **Verification**: Smoke-PDF-Render via Smoke-Skript: PDF-Output **exakt 17 Seiten total** (Pages 1-15 V8.0 + Pages 16-17 V8.1-Outro). `pdfinfo` zeigt 17. Manual-Visual-Verify dass keine V8.0-CtaPage-Visuals erscheinen (kein Doppel-CTA).
- **Dependencies**: MT-4

### MT-6: Web-Bericht V8OutroSection Component
- **Goal**: React-Component fuer V8-Web-Bericht mit gleicher 4-Block-Hierarchie (Tailwind + shadcn/ui).
- **Files**:
  - `src/app/dashboard/diagnose/[id]/V8OutroSection.tsx` (NEU)
  - `src/app/dashboard/diagnose/[id]/V8OutroSection.client.tsx` (falls Loading-State noetig)
  - `src/app/dashboard/diagnose/[id]/page.tsx` ODER analog (UPDATE — `<V8OutroSection>` rendern nach Modul-Pages)
- **Expected behavior**:
  - 4 Block-Sections in Tailwind: Strategaize-Vorstellung, 3 Empfehlungs-Cards mit shadcn/ui-Card, Video-Box mit Strategaize-Logo, CTA-Button (`<Button asChild>` zur Server-Action aus SLC-163)
  - Style Guide V2 konform (Tailwind-Standard-Spacing, Touch-Target >= 44px fuer CTA-Button)
  - Loading-Indication: Wenn `augmentEmpfehlungsText` synchron laeuft, zeigt Skeleton-Cards mit "KI-Augmentation laeuft (~20s)" Text
- **Verification**: TSC + ESLint EXIT=0. Vitest fuer Component-Rendering. Browser-Smoke-Check post-Coolify-Deploy.
- **Dependencies**: MT-3

### MT-7: Tonality-Audit-Skript-Erweiterung
- **Goal**: `scripts/tonalitaet-audit-v8.mjs` Scope um V8.1-Outro-Statische-Texte erweitern.
- **Files**:
  - `scripts/tonalitaet-audit-v8.mjs` (UPDATE)
- **Expected behavior**:
  - Neuer Scope `--scope=outro` (oder Default-Erweiterung) prueft `outro.tsx` statische Strings + `V8OutroSection.tsx` statische Strings
  - Blacklist-Erweiterung um V8.1-Spezifika: `\bich\b|mein Team|der Founder|Founders|Euro|EUR|Kosten|Preis|Empfehlung Ihres Steuerberaters`
  - Output: 0 Treffer erwartet bei korrekter Wir-Voice
- **Verification**: Run gegen Coolify-DB: 0 Treffer ueber alle V8.0 + V8.1-Statische-Texte.
- **Dependencies**: MT-6

### MT-8: Slice-Records-Update
- **Goal**: SLC-162 records-Update: status `planned → in_progress`. FEAT-067 status `planned → in_progress`. BL-134 bleibt `in_progress`.
- **Files**:
  - `slices/INDEX.md` (UPDATE)
  - `features/INDEX.md` (UPDATE)
- **Expected behavior**: Status-Updates wie spec.
- **Verification**: grep matches.
- **Dependencies**: MT-7

## Acceptance Criteria

- **AC-SLC-162-1**: Smoke-PDF-Output ist **exakt 17 Seiten total** (Pages 1-15 V8.0 unveraendert + Pages 16-17 V8.1-Outro).
- **AC-SLC-162-2**: Pages 16-17 enthalten alle 4 Bloecke (Strategaize-Vorstellung + 3 LLM-augmentierte Empfehlungs-Cards + Video-Platzhalter + CTA-Slot).
- **AC-SLC-162-3**: V8.0-CtaPage-Visuals erscheinen nicht im V8.1-Pfad (kein Doppel-CTA, kein "Folgegespraech vereinbaren"-Wording aus V8.0).
- **AC-SLC-162-4**: 3 Empfehlungs-Cards zeigen die 3 niedrigsten Module aus selectThreeHebel-Output + LLM-augmentierte Texte (oder deterministischer Fallback).
- **AC-SLC-162-5**: V8-Web-Bericht zeigt V8OutroSection mit identischer 4-Block-Struktur und Loading-Indication waehrend LLM-Augmentation laeuft.
- **AC-SLC-162-6**: Tonality-Audit-Skript erweitert um V8.1-Outro-Scope liefert 0 Treffer.
- **AC-SLC-162-7**: Strategaize-Vorstellungs-Text ist Founder-freigegeben und im Code-Kommentar dokumentiert (Founder-Freigabe-Datum).
- **AC-SLC-162-8**: TypeScript-Build EXIT=0, ESLint EXIT=0, alle Vitest-Tests GREEN.
- **AC-SLC-162-9**: V8.0-Pages 1-15 sind visuell unveraendert (Smoke-Snapshot-Test 0 Drift gegenueber V8.0-Baseline).
- **AC-SLC-162-10**: CTA-Slot enthaelt Placeholder-URL `#cta-magic-link-token-replaced-in-slc163` (wird in SLC-163 MT-8 mit echter Token-URL ersetzt).

## Notable Risks / Dependencies

- **R1**: Strategaize-Vorstellungs-Text-Freigabe blockiert MT-3. Falls bei MT-3-Start nicht freigegeben → Placeholder bleibt, MT-3 wird deferred bis Freigabe vorliegt. Risk-Mitigation: Pre-MT-1 User-Pflicht in PRD V8.1 + STATE.md Immediate Next Steps.
- **R2**: V8.0-CtaPage-Footer-Section koennte als shared Component refactored werden. Wenn ja: SLC-162 wird ~30min laenger. Entscheidung in MT-4 (Copy-Adapt vs Refactor). Default: Copy-Adapt (KISS).
- **R3**: Web-Bericht-Loading-Indication-Pattern unklar — wird sync-LLM-Augmentation Loading-State im Server-Component oder Client-Component gerendert? Vermutlich Client-Component mit React-Suspense-Pattern. Entscheidung in MT-6.
- **R4**: V8.0-Smoke-Snapshot-Tests muessen Pages 1-15 weiterhin GREEN halten (Co-Existenz-Verify). Falls Drift: V8.0-Regression. Pflicht-Gate.
- **D1**: Hard-Dependency auf SLC-161 done (LLM-Augmentation Pure-Function).
- **D2**: Pre-MT-1 User-Pflicht (Strategaize-Vorstellungs-Text-Freigabe).

## Worktree

- **Branch**: `v8-1-lead-conversion` (gestartet in SLC-161 MT-0)
- **Path**: `c:/strategaize/strategaize-onboarding-plattform-v8-1`

## Next After SLC-162

**SLC-163 — V8.1 CTA-Mechanik + Dual-Email-Trigger** (FEAT-068). Konsumiert OutroPage CTA-Slot, ersetzt Placeholder mit echter HMAC-Magic-Link-URL.
