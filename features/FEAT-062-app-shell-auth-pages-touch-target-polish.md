# FEAT-062 — App-Shell Touch-Target + Auth-Pages-Polish

**Version:** V7.4
**Status:** planned
**Created:** 2026-05-23
**Related Slice:** SLC-143 (to be planned in /slice-planning V7.4)

## Purpose

WCAG 2.1 AA Success Criterion 2.5.5 ("Target Size") schreibt vor, dass interaktive Touch-Targets auf Mobile-Viewports mindestens 44×44 CSS-Pixel betragen sollen. Die V7.3 Live-Smoke (RPT-337) hat belegt, dass die Onboarding-Plattform diesen Standard im **Diagnose-Funnel-Scope** erfuellt (QuickActionRing-Buttons 301×66px, AnswerOptionCards >=44px, StartCTA h=44), aber im **App-Shell-Scope** (Footer + shadcn-Default-Button) und auf den **Auth-Pages** systematisch verfehlt.

FEAT-062 schliesst diese Luecke in einer 1-Slice-Polish-Iteration ohne Layout-Redesign. Reines Touch-Target-Polish, dokumentierte Visual-Regression-Schutz via neu generierte Playwright-Baselines.

## Problem

### Heute-Stand (verifiziert via RPT-337 Live-Smoke)

| Element | Page(s) | Heute | Soll | WCAG-Verdict |
|---|---|---|---|---|
| Footer-Link "Datenschutz" | jede Page | h=19px | >=44px | FAIL |
| Footer-Link "Impressum" | jede Page | h=19px | >=44px | FAIL |
| Footer-Link "Aufgesetzt mit Strategaize" | jede Page | h=19px | >=44px | FAIL |
| `Button` "Kontakt zu Strategaize anfragen" (IchWillMehrCard) | /dashboard | h=40px | >=44px | FAIL |
| `Button` Login-Submit | /login | h=40px (vermutet) | >=44px | TBD MT-1 |
| `Button` Set-Password-Submit | /auth/set-password | h=40px (vermutet) | >=44px | TBD MT-1 |
| `Button` Accept-Invitation-Submit | /accept-invitation/[token] | h=40px (vermutet) | >=44px | TBD MT-1 |
| `Button` Verify-Signup-Action(s) | /auth/verify-signup | h=40px (vermutet) | >=44px | TBD MT-1 |

### Warum jetzt

- V7.3 schliesst den Diagnose-Funnel-Polish ab. Die Touch-Target-Violations sind die einzige verbleibende empirisch belegte Mobile-UX-Schwaeche.
- Pre-Pilot-Partner-Phase ist die richtige Zeit fuer Accessibility-Polish — Pilot-Mandanten werden Mobile-Traffic mitbringen.
- Aufwand klein (~3-5h Code-Side, 1 Slice).

## In Scope

1. **Footer-Component Touch-Target-Anhebung** (`StrategaizePoweredFooter` oder gleichwertige Source-of-Truth): 3 Links auf >=44px-tap-Area, ohne Footer-Layout-Bruch auf Desktop/Tablet.
2. **shadcn-Button-Default-Size-Polish**:
   - Q-V7.4-A entscheidet: globaler Default-Switch (`h-10 -> h-11` in `components/ui/button.tsx`) ODER selektive `size="lg"`-Prop-Aufhebung an konkreten Usage-Sites.
   - In jedem Fall betroffen: IchWillMehrCard-Trigger, Login-Submit, Set-Password-Submit, Accept-Invitation-Submit, Verify-Signup-Buttons. Andere Buttons im Repo werden im Pre-Audit (MT-1) erfasst und je nach Q-V7.4-A-Entscheidung mit-betroffen oder unveraendert.
3. **Auth-Pages-Touch-Target-Verifikation**: 4 Pages (Login, Set-Password, Accept-Invitation, Verify-Signup) auf Mobile 375px nach Polish-Touch alle interaktiven Elemente >=44px.
4. **Visual-Regression-Baselines erneuern**: V7.3 9 Diagnose-Funnel-PNGs entweder PASS unveraendert oder mit Threshold-Doku, **plus 4-12 neue Auth-Pages-Baselines** (Q-V7.4-B entscheidet Viewport-Zahl).

## Out of Scope

- **EditableText-Migration Auth-Pages** — `useTranslations` (next-intl) bleibt, kein Admin-Edit
- **Auth-Pages Layout-Redesign** — Card-Layout heute schon Style-Guide-V2-konform
- **Admin-Bereich** — V8+
- **Dark-Mode** — V8+
- **shadcn-Input-Default-Polish** — Q-V7.4-C entscheidet, ggf. spaeter V7.5+
- **F-2 Run-Page Live-E2E mit socat-Tunnel** — separates Tooling-Item, nicht V7.4-Code-Scope

## Acceptance Criteria

- **AC-1 Diagnose-Funnel Regression-Schutz**: Touch-Target-Audit Mobile 375px auf Dashboard + Diagnose-Start + Run + Bericht = 0 Violations (heute: Diagnose-Funnel-Scope schon 0 Violations + Dashboard 1 Violation IchWillMehrCard).
- **AC-2 Auth-Pages Touch-Target**: Touch-Target-Audit Mobile 375px auf /login + /auth/set-password + /accept-invitation/[token] + /auth/verify-signup = 0 Violations <44px in allen Buttons.
- **AC-3 Footer App-Shell**: Footer auf JEDER Page (Dashboard + Bericht + Login + Set-Password) liefert 3 Links mit Touch-Area >=44px (entweder element-h>=44 oder element-h<44 + clickable-padding-Area>=44).
- **AC-4 Visual-Layout-Konsistenz**: V7.3 Diagnose-Funnel-Baselines (9 PNGs) entweder PASS unveraendert oder Threshold-Aenderung dokumentiert in Slice-Spec.
- **AC-5 Auth-Pages-Baselines**: 4 Auth-Pages haben neue Mobile-Baselines (Q-V7.4-B entscheidet ob auch Tablet+Desktop, default Annahme: Mobile-only).
- **AC-6 Funktionalitaet unveraendert**: Login + Set-Password + Accept-Invitation + Verify-Signup-Flows funktionieren end-to-end. Live-Smoke via Playwright-MCP Pflicht.
- **AC-7 Surgical-Changes-Disziplin**: Keine i18n-String-Aenderungen, kein Auth-Card-Re-Skin, kein nicht-Touch-Target-relevanter Refactor in den 4 Auth-Pages.
- **AC-8 ESLint + tsc Clean**: Quality-Gates `npx tsc --noEmit` EXIT=0 und `npx eslint <changed-files>` EXIT=0.

## Open Questions (zu klaeren in /architecture V7.4)

- **Q-V7.4-A**: shadcn-Button-Default-Size global anheben (`h-10 -> h-11` in components/ui/button.tsx) ODER selektiv per Usage-Site (`size="lg"`-Prop)?
- **Q-V7.4-B**: Auth-Pages-Baselines nur Mobile (4 PNGs) ODER alle 3 Viewports (12 PNGs)?
- **Q-V7.4-C**: shadcn-Input-Default-Size (h-10) auch anheben?
- **Q-V7.4-D**: Touch-Target-Audit-Skript als CI-Schutz JA/NEIN?

## Constraints

- **Surgical-Changes** — siehe Rule [.claude/rules/general.md](../.claude/rules/general.md) Rule 3
- **Pattern-Reuse** — kein neues Touch-Target-Pattern erfinden, shadcn-Size-Mechanik nutzen (siehe Memory `feedback_style_guide_v2_mandatory`)
- **Live-Verify Pflicht** — kein Slice-Schluss ohne Playwright-MCP-Live-Smoke gegen Production-Build (siehe Memory `feedback_no_local_docker`)
- **V7.3 als Pre-Condition** — V7.4 setzt V7.3-Stand voraus (RELEASED REL-022, main b88b20d)

## Success Criteria (Outcome-Level)

Siehe PRD.md V7.4 SC-V7.4-1..4. Zusammengefasst: 0 Mobile-Touch-Target-Violations in Diagnose-Funnel + Auth-Pages + App-Shell-Footer + IchWillMehrCard.

## Effort Estimate

**~3-5h Code-Side ueber 1 Slice (SLC-143)**, 5-7 Micro-Tasks, realistisch 1 Mini-Session A (Pre-Audit + Q-Klaerung in /architecture) + 1 Full-Session B (Implementation + /qa + Live-Smoke + Master-Merge).

## Related Decisions

- DEC-128 V6.3 ScoreVisual nutzt score-range-Farben statt Block-Akzent-Farben — relevant fuer Verstaendnis warum Visual-Tests in V7.3 conditional PASS hatten
- DEC-150 V7.1 EditableText-Pattern fuer Admin-Edit-Strings — relevant fuer "Out-of-Scope Auth-Pages EditableText"-Begruendung
- DEC-T-V7.4-A..D — werden in /architecture V7.4 entschieden

## Related Memories (Strategaize Dev System)

- [[feedback-style-guide-v2-mandatory]] — Style Guide V2 Pflicht
- [[feedback-v2-sidebar-pflicht]] — V2-Sidebar-Layout
- [[reference-playwright-live-smoke-pattern]] — Live-Smoke Pattern
- [[strategaize-pattern-reuse]] — Pattern-Reuse-Pflicht (shadcn-Size-Mechanik nutzen)
