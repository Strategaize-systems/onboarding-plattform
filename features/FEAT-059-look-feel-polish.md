# FEAT-059 — Look-and-Feel-Polish nach Style Guide V2

**Version:** V7.3 (Smart-Split aus V7.1 2026-05-21)
**Status:** planned
**Created:** 2026-05-20

## Zweck

Diagnose-Start-Screen + 24-Fragen-Pages + Bericht-Page sollen visuell dem Strategaize Style Guide V2 entsprechen — Typografie-Hierarchie, Spacing, mehrfarbige Section-Cards, QuickActionRing fuer Bericht-Aktionen, professionelle Empty-/Error-States. Adressiert BL-114 + User-Feedback aus SLC-700-Live-Test "Look koennte professioneller sein".

## Hintergrund

Aktueller Look ist Internal-Tool-Stil (basis-Tailwind, minimale visuelle Hierarchie). Erster Eindruck beim Self-Signup-Mandanten muss Marketing-Layer entsprechen — sonst niedrige Conversion + niedrige Partner-Bindung.

Style Guide V2 ist verbindlich seit User-Direktive 2026-05-01 (Memory `feedback_style_guide_v2_mandatory.md`). V2-Sidebar-Layout ist Pflicht seit 2026-05-06 (Memory `feedback_v2_sidebar_pflicht.md`). IS-SLC-115 hat Page-Level-Visual-Reference-Checklist etabliert (Memory `feedback_look_alignment_needs_page_level_scope.md`).

## In Scope

- **Pre-Condition: FEAT-056 abgeschlossen** — Look-Polish auf migrierten EditableText-Strings (sonst Doppelarbeit beim Re-Styling).
- **Style-Guide V2-Konformitaet auf 3 Pages**:
  - **Diagnose-Start-Screen** (`src/app/dashboard/diagnose/start/page.tsx`):
    - Hero-Section mit Partner-Logo + Strategaize-Co-Branding.
    - Klar gegliederter "Was kommt jetzt"-Block (3 Schritte: Diagnose → Bericht → Berater-Gespraech).
    - CTA-Button "Diagnose starten" prominent (primary-color), Hover-State.
    - Datenschutz-Hinweis dezent in Footer.
  - **Diagnose-Run-Page** (`src/app/dashboard/diagnose/run/page.tsx`):
    - Progress-Indicator (24 Fragen, aktueller Fortschritt).
    - Frage-Card mit klarem Frage-Label + Info-Icon (FEAT-057) + Antwort-Optionen.
    - Antwort-Optionen als visuell unterscheidbare Buttons/Cards (nicht plain Radio-Buttons).
    - "Zurueck"-Button + "Weiter"-Button konsistent positioniert.
    - Speicher-Indicator (Auto-Save-Hinweis).
  - **Bericht-Page** (`src/app/dashboard/diagnose/bericht/page.tsx`):
    - Page-Header mit Partner-Branding + "Deine Diagnose-Auswertung"-Title.
    - **Mehrfarbige Section-Cards** (Pattern aus IS-SLC-115): pro 6 Bloecke eine eigene Akzent-Farbe.
    - Score-Visual (6 Bars) prominent oben.
    - KI-Verdichtungs-Kommentare in Karten mit Block-Farbe.
    - **QuickActionRing** (Pattern aus IS-SLC-115): 3-4 Hauptaktionen (Email-Versand FEAT-060, Print, "Ich will mehr"-CTA, optional Re-Run).
    - Footer mit Pflicht-Output-Aussage (EditableText).
- **Strategaize Style Guide V2-Tokens** in `tailwind.config.ts`:
  - Pruefen ob Token-Set vollstaendig (primary/secondary/accent-color, spacing-scale, font-scale).
  - Falls Drift: Tokens nachpflegen.
- **Empty-States**:
  - "Noch keine Diagnose gestartet" auf Dashboard-Diagnose-Card mit klarer Anleitung.
  - "Diagnose laeuft, KI verarbeitet noch" als Loading-State auf Bericht-Page-Pending.
  - "Etwas ist schiefgegangen" als Error-State mit Retry + Support-Kontakt.
- **Responsive Design**:
  - Mobile (375px), Tablet (768px), Desktop (1280px+) verifiziert.
  - Touch-Targets ≥44px auf Mobile.
  - Section-Cards stacken vertikal auf Mobile.
- **Page-Level-Visual-Reference-Checklist** (Pflicht pro Page, Pattern aus IS-SLC-115):
  - Pro Page eine Checklist-Liste mit 8-12 visuellen Sub-Checks: Header, Hero, Sections, Cards, Buttons, Spacing, Typography, Empty/Error-States, Responsive, Branding-Konsistenz.
  - Vorhanden in `slices/SLC-140-...-look-polish.md` zur QA-Verifikation.
- **Vitest + Playwright-Coverage** (V7.1 Light):
  - Snapshot-Tests auf Hauptkomponenten.
  - Playwright-Visual-Regression-Tests (Pattern aus existierenden Strategaize-Repos) auf 3 Pages.

## Out of Scope

- **Komplette Sidebar-Ueberarbeitung** — V2-Sidebar ist seit V6 bereits aktiv.
- **Auth-Pages-Polish** (`/login`, `/auth/verify-signup`) — V7.2+ falls noetig.
- **Admin-Bereich-Polish** — V7.2+ falls noetig.
- **Dark-Mode** — V8+.
- **Animation/Transitions** ueber Hover/Click-Standard hinaus — Polish-Reserve fuer V7.2+.
- **Component-Library-Konsolidierung** (z.B. shadcn/ui-Adoption-Audit) — V8+ Topic.
- **Marketing-Pages** (`/`-Root, `/about` etc.) — nicht im Diagnose-Funnel-Scope.

## Akzeptanzkriterien

- AC-1: Diagnose-Start-Screen entspricht Style Guide V2: Hero + Partner-Branding + 3-Schritte-Block + CTA-Button mit primary-color + Footer.
- AC-2: Diagnose-Run-Page hat Progress-Indicator (24 Fragen, aktueller Stand sichtbar).
- AC-3: Frage-Card hat Info-Icon (FEAT-057-Integration) + visuell unterscheidbare Antwort-Optionen.
- AC-4: Bericht-Page hat mehrfarbige Section-Cards (6 verschiedene Akzent-Farben fuer 6 Bloecke).
- AC-5: Bericht-Page hat QuickActionRing mit 3-4 Aktionen (mindestens Email-Versand FEAT-060 + Print + "Ich will mehr").
- AC-6: 3 Empty-States rendern korrekt (Dashboard-no-Session, Bericht-Pending, Error-State).
- AC-7: Responsive auf 375px / 768px / 1280px verifiziert via Playwright.
- AC-8: Page-Level-Visual-Reference-Checklist pro Page (mindestens 8 Sub-Checks pro Page) komplett dokumentiert in SLC-140 + alle PASS.
- AC-9: Playwright-Visual-Regression-Snapshots fuer 3 Pages live + Baseline gespeichert.
- AC-10: EditableText-Migration aus FEAT-056 voll intakt — kein Polish-Re-Hardcode.

## Abhaengigkeiten

- **Hard-Dep**: FEAT-056 EditableText-Migration ABGESCHLOSSEN vor Look-Polish-Start.
- **Hard-Dep**: FEAT-057 Helper-Texts-UI integriert (Info-Icon-Rendering).
- **Hard-Dep**: FEAT-060 QuickActionRing braucht Email-Versand-Action.
- **Pattern-Reuse**: Section-Cards-Pattern aus IS-SLC-115.
- **Pattern-Reuse**: QuickActionRing-Pattern aus IS-SLC-115.
- **Pattern-Reuse**: Strategaize Style Guide V2 als Source of Truth.
- **Pattern-Reuse**: Page-Level-Visual-Reference-Checklist-Pattern (IS-SLC-114-Lehre).
- **Downstream-Dep**: Keine V7.1-Downstream.
