# SLC-055 — UX-Findings-Bundle (Tooltip-Target-Fix + Help-Konsolidierung)

## Goal
Zwei UX-Findings aus V4.2 Gesamt-/qa Browser-Smoke abarbeiten: (a) Tooltip-Target Inactive-Badge zu klein → Card-Header als Wrapper-Trigger (DEC-067 Variante 2), (b) Help-Mechanismen konsolidieren → Learning Center bekommt 3. Tab "Diese Seite" der das page-spezifische SLC-050-Markdown rendert (DEC-064 Variante 3). HelpButton wird zum Single-Trigger pro Page; HelpSheet (shadcn `Sheet`) entfaellt als separate Komponente.

## Feature
V4.3 Maintenance

## Backlog Items
- BL-062 Tooltip 1/5 Inactive-Badge Hover-Target zu klein
- BL-063 Help-Mechanismen-Konsolidierung

## In Scope

### A — Tooltip-Target-Fix Card-Header-Wrapper (BL-062, DEC-067)

Pfad: `src/components/cockpit/InactiveEmployeesCard.tsx` (geaendert)

Verhalten:
- Bestehender `?`-Button (h-4 w-4) bleibt visuell unveraendert sichtbar.
- shadcn `Tooltip.Trigger` umschliesst nicht nur das Icon, sondern den ganzen Card-Header (`<div className="card-header">` oder `<header>`-Element).
- Card-Header bekommt:
  - `tabIndex={0}` damit Keyboard-Focus moeglich.
  - `aria-describedby` verknuepft mit Tooltip-ID.
  - `cursor: help` als CSS-Hint.
- Mobile: Tap auf Header-Bereich oeffnet Tooltip (shadcn-Tooltip mit `delayDuration={0}` auf Touch ODER controlled `open`-State per Tap-Handler).
- Beispiel-Pattern fuer kuenftige Tooltips dokumentieren (kann in Lib-Docs oder als JSDoc am `Tooltip`-Wrapper).

### B — Learning-Center Tab "Diese Seite" (BL-063, DEC-064)

Pfad: `src/components/learning-center/learning-center-panel.tsx` (geaendert)
Pfad: `src/components/learning-center/this-page-tab.tsx` (neu)
Pfad: `src/components/learning-center/learning-center-panel.tsx` Tab-Type erweitern: `type Tab = "videos" | "guide" | "this-page"`.

Verhalten:
- 3. Tab "Diese Seite" mit lucide `BookText` oder `FileText`-Icon.
- Tab-Content: rendert page-spezifisches `src/content/help/<page-key>.md` via existierende `loadHelpMarkdown(pageKey)`-Helper aus SLC-050.
- Tab wird Default-aktiv, wenn HelpButton mit `?initialTab=this-page&pageKey=<page-key>`-Query oder direktem Prop-Pass aufgerufen wird.
- Page-Key wird per `usePathname()`-Hook ausgelesen oder als Prop ueber HelpButton/Wrapper durchgereicht (saubere Variante, weil `usePathname` im LC-Panel bereits verfuegbar sein sollte).
- Wenn keine `<page-key>.md` existiert: Fallback-Inhalt "Fuer diese Seite gibt es noch keinen Hilfe-Artikel."

### C — HelpButton-Wrapper-Pattern (Single-Trigger)

Pfad: `src/components/help-button.tsx` (geaendert) — bestehender HelpButton (floating bottom-right) bleibt der einzige Help-Trigger pro Page.
Pfad: `src/components/help-sheet.tsx` ODER aequivalent (geloescht oder zu Wrapper umgebaut)

Verhalten:
- HelpButton oeffnet Learning-Center-Panel mit `initialTab="this-page"` und `pageKey={usePathname()-derived}`.
- `?`-Icon-Trigger im Header (falls existiert in V4.2 SLC-050-Layout) wird entweder entfernt ODER zu zweitem HelpButton-Wrapper, der ebenfalls Learning-Center-Panel oeffnet (mit `initialTab="this-page"`).
- shadcn `Sheet`-Komponente fuer alten HelpSheet entfaellt — wenn kein anderer Code sie nutzt, wird die Datei geloescht. Falls noch andere Stellen `Sheet` nutzen (z.B. Learning-Center selbst, das ist ja ein Sheet), bleibt die UI-Komponente in shadcn.
- Existing `loadHelpMarkdown(pageKey)`-Helper bleibt (DEC-057 unverletzt) und wird vom neuen `this-page-tab.tsx` wiederverwendet.

### D — Page-Key-Mapping

Pfad: `src/components/learning-center/page-key-from-pathname.ts` (neu)
Pfad: `src/components/learning-center/__tests__/page-key-from-pathname.test.ts` (neu)

Verhalten:
- Helper `pageKeyFromPathname(pathname: string): string` mappt URL-Pfad auf Help-Markdown-Key:
  - `/dashboard` → `dashboard`
  - `/dashboard/capture/...` → `capture`
  - `/admin/bridge/...` → `bridge`
  - `/admin/reviews` oder `/admin/blocks/.../review` → `reviews`
  - `/dashboard/handbook/...` → `handbook`
- 5 Help-Files existieren aus SLC-050: `dashboard.md`, `capture.md`, `bridge.md`, `reviews.md`, `handbook.md`.
- Default fuer unbekannte Pfade: Fallback-Inhalt-Banner (siehe B).

### E — Tests

- `src/components/learning-center/__tests__/page-key-from-pathname.test.ts` (neu): 6 Cases — alle 5 Mappings + Unknown-Fallback.
- `src/components/learning-center/__tests__/learning-center-panel.test.tsx` (geaendert oder neu): 2 Cases — Tab-Switch zu "Diese Seite", Render von `<page-key>.md`.
- `src/components/cockpit/__tests__/InactiveEmployeesCard.test.tsx` (existiert seit SLC-049, geaendert): Tooltip-Hover/Focus auf Card-Header triggert Tooltip.

## Out of Scope

- Help-Content-Aenderung (SLC-050 Help-Files bleiben unveraendert; BL-067 Berater-Review parallel).
- Neuer Help-Content fuer zusaetzliche Pages (V5+).
- AI-gestuetzter Help-Bot (V5+).
- Tooltip-Pattern-Library-Refactor (zu gross fuer V4.3).
- Andere V4.2-Tooltips (Wizard-Spaeter, Help-Trigger etc.) — sind nicht ge-Smoked als Problem, kein Refactor-Bedarf.

## Acceptance Criteria

- AC-1: InactiveEmployeesCard-Header ist Tooltip-Trigger; Hover oder Tap auf Header (nicht nur auf `?`-Icon) oeffnet Tooltip.
- AC-2: Card-Header hat `tabIndex=0` + `aria-describedby` + `cursor: help`.
- AC-3: Mobile-Tap (375×667) auf Header oeffnet Tooltip.
- AC-4: Learning-Center-Panel hat 3. Tab "Diese Seite".
- AC-5: Tab "Diese Seite" rendert das richtige `<page-key>.md` basierend auf aktuellem Pfad.
- AC-6: HelpButton oeffnet Learning-Center-Panel mit Default-Tab "Diese Seite" + korrektem pageKey.
- AC-7: Auf einer Page ohne Help-Markdown wird Fallback-Banner ("noch kein Hilfe-Artikel") sichtbar, kein Crash.
- AC-8: `pageKeyFromPathname()` mappt 5 bekannte Pfade + Unknown-Fallback korrekt.
- AC-9: Bestehende Learning-Center-Tabs ("Videos", "Guide") funktionieren unveraendert.
- AC-10: Browser-Smoke 1280×800 + 375×667: ein einzelner Help-Trigger pro Page (kein "zwei `?`-Icons konkurrieren"-Pattern).
- AC-11: V4.2-Regression: Wizard-Help-Tooltips, V4.1-Reader-Help-Sheet (falls separat war) entweder erhalten bleiben oder dokumentiert deprecated werden im Slice-Report.
- AC-12: `npm run build` + `npm run test` gruen.

## Dependencies

- Vorbedingung: SLC-053 done (Tooling).
- Vorbedingung: SLC-051 done (Reader-UX-Bundle ist live, sodass Help-Konsolidierung im Reader-Layout sauber sichtbar ist).
- Vorbedingung: SLC-052 done (Worker-Hygiene; aber nur lose Abhaengigkeit).
- V4.2 SLC-050 + FEAT-029 Learning-Center sind live (Voraussetzung fuer Konsolidierung).

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine. UI-Layer-only.

## Pflicht-QA-Vorgaben

- Browser-Smoke 1280×800: HelpButton oeffnet Learning-Center, Default-Tab "Diese Seite" zeigt korrektes Help-Markdown.
- Browser-Smoke 1280×800: InactiveEmployeesCard-Header-Hover triggert Tooltip (nicht nur `?`-Icon-Hover).
- Browser-Smoke 375×667: Mobile-Tap auf Card-Header oeffnet Tooltip; HelpButton oeffnet Sheet-Panel scrollbar.
- Per Page-Key-Mapping-Smoke: Klick auf HelpButton auf jeder der 5 Pages laedt jeweils richtigen Tab-Content.
- 4-Rollen-RLS-Matrix bleibt 100% PASS (kein DB-Touch).
- V4.2-Regression-Smoke: Wizard funktioniert, Reminders-Cron unveraendert, Reader funktioniert.
- `npm run test` + `npm run build` gruen.
- Cockpit-Records-Update nach Slice-Ende.

## Risks

- **R1 — Tooltip-False-Positive bei Mobile-Scroll:** Wenn User auf Mobile durch die Cockpit-Cards scrollt und kurz auf den Header tippt (z.B. Scroll-Anfang), oeffnet sich Tooltip ggf. ungewollt. Mitigation = `delayDuration={500}` auf Touch oder shadcn-Default-Verhalten beibehalten. In /qa pruefen.
- **R2 — Page-Key-Mapping unvollstaendig:** Wenn User auf einer nicht-gemappten Page Help klickt, kommt Fallback-Banner. Mitigation = bewusst akzeptiert (alle 5 Help-Files-Pages sind im Mapping). Falls neue Pages dazukommen, muss Mapping erweitert werden — als "Add-Page-Key"-Pattern in Lib-Docs.
- **R3 — Doppelte HelpButton-Trigger im Header verwirrt User noch staerker:** Wenn V4.2 SLC-050 einen `?`-Trigger im Header hatte, der jetzt auch das LC oeffnet, sollte er entweder entfernt werden ODER den gleichen Effekt haben. Mitigation = im Slice MT-3 explizit pruefen: existiert SLC-050-`?`-Trigger? Wenn ja: entfernen oder zum LC-Trigger umbauen.
- **R4 — Bestehender `loadHelpMarkdown` brauchbar?:** Funktion existiert seit SLC-050. Mitigation = Code-Pruefung in MT-2; falls Refactor noetig, als zusaetzliche MT.
- **R5 — Tab-State bei Page-Wechsel:** Wenn User auf einer Page LC oeffnet, dann auf andere Page navigiert, soll LC sich neu laden ODER offen bleiben? Mitigation = LC schliesst bei Page-Wechsel (Default-shadcn-Sheet-Verhalten). Falls offenes LC bleibt, muss `pageKey` re-evaluiert werden — `usePathname` triggert Re-Render.

## Detail-Decisions aus /architecture (V4.3)

- DEC-064 (Help-Konsolidierung Variante 3, Learning-Center bekommt Tab "Diese Seite").
- DEC-067 (Tooltip-Target Variante 2, Card-Header als Wrapper-Trigger).
- Q-V4.3-G geklaert in /slice-planning: Learning-Center ist BEREITS shadcn `Sheet` (nicht Page). Konsolidierung loest sich also OHNE Page-Wechsel — DEC-064-Trade-off "Page-Wechsel" entfaellt automatisch.

### Micro-Tasks

#### MT-1: pageKeyFromPathname-Helper + Tests
- Goal: Helper-Function fuer URL-zu-PageKey-Mapping.
- Files: `src/components/learning-center/page-key-from-pathname.ts` (neu), `src/components/learning-center/__tests__/page-key-from-pathname.test.ts` (neu)
- Expected behavior: 5 bekannte Pfade + Unknown-Fallback korrekt mapped.
- Verification: 6 Vitest-Tests.
- Dependencies: none.

#### MT-2: this-page-tab-Komponente
- Goal: Tab-Content der `loadHelpMarkdown(pageKey)` rendert.
- Files: `src/components/learning-center/this-page-tab.tsx` (neu)
- Expected behavior: Rendert Help-Markdown via existing `loadHelpMarkdown` + `react-markdown`. Fallback bei fehlender Datei.
- Verification: Vitest-Render-Test + Browser-Smoke.
- Dependencies: MT-1, existing `loadHelpMarkdown`.

#### MT-3: LearningCenterPanel-Tab-Erweiterung
- Goal: Tab-Type um `"this-page"` erweitern + Tab-Render einbauen.
- Files: `src/components/learning-center/learning-center-panel.tsx` (geaendert)
- Expected behavior: 3. Tab sichtbar; bei Default-Open mit `initialTab="this-page"` Tab vorausgewaehlt.
- Verification: Vitest-Render-Test + Browser-Smoke.
- Dependencies: MT-2.

#### MT-4: HelpButton-Default-Tab-Routing
- Goal: HelpButton oeffnet LC mit `initialTab="this-page"` und `pageKey` aus `pageKeyFromPathname(usePathname())`.
- Files: `src/components/help-button.tsx` (geaendert), evtl. Wrapper-Komponente die LC-State haelt.
- Expected behavior: Klick auf HelpButton → LC-Sheet oeffnet → Tab "Diese Seite" aktiv → richtiges Help-Markdown sichtbar.
- Verification: Browser-Smoke auf jeder der 5 Help-Pages.
- Dependencies: MT-1 + MT-3.

#### MT-5: SLC-050-`?`-Trigger-Konsolidierung (Pflicht-Pruefung)
- Goal: Wenn V4.2 SLC-050 separaten `?`-Trigger im Header hatte, entweder entfernen oder zu LC-Trigger umbauen.
- Files: `src/app/dashboard/layout.tsx` ODER `src/components/header/*` (Code-Pruefung erst).
- Expected behavior: Genau ein erkennbarer Help-Trigger pro Page.
- Verification: Browser-Smoke auf jeder Page (kein Doppel-`?`-Pattern mehr).
- Dependencies: MT-4.

#### MT-6: Tooltip-Card-Header-Wrapper (BL-062)
- Goal: InactiveEmployeesCard-Header als Tooltip-Trigger statt `?`-Icon.
- Files: `src/components/cockpit/InactiveEmployeesCard.tsx` (geaendert), `src/components/cockpit/__tests__/InactiveEmployeesCard.test.tsx` (geaendert)
- Expected behavior: Tooltip oeffnet bei Hover/Focus/Tap auf den ganzen Header-Bereich.
- Verification: Browser-Smoke 1280×800 + 375×667.
- Dependencies: none.

#### MT-7: Pflicht-Browser-Smoke + Cockpit-Records-Update
- Goal: SC-V4.3-7 (Help-Konsolidierung loest UX-Verwirrung) + SC-V4.3-2 (Tooltip-Target trefffaehig) verifizieren.
- Files: keine Code-Aenderung, nur Slice-Report-Eintraege.
- Expected behavior: Browser-Smoke beide Findings auf Desktop + Mobile dokumentiert.
- Verification: Slice-Report mit Smoke-Output, ggf. Screenshots.
- Dependencies: MT-5 + MT-6.
