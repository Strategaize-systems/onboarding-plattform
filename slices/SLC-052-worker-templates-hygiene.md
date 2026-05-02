# SLC-052 — Worker+Templates-Hygiene (TOC-Anchor-Links + Umlaut-Konsistenz)

## Goal
Die Worker-Output-Hygiene aus V4.1 Browser-Smoke abschliessen: (a) Worker schreibt TOC-Links als In-App-Anchors statt Markdown-Datei-Pfade, sodass der `components.a`-Override im Reader fuer neue Snapshots ueberfluessig wird; (b) Templates + Worker-Prompts + UI-Strings auf konsistente UTF-8-Umlaute umstellen mit dev-only Audit-Helper. Pre-V4.3-Snapshots behalten ihren alten Format dank `components.a`-Override-Fallback.

## Feature
V4.3 Maintenance

## Backlog Items
- BL-056 Worker-Output: TOC-Markdown-Links als In-App-Anchors
- BL-057 Umlaut-Konsistenz Templates + Worker + UI

## In Scope

### A — `slugifyHeading`-Util-Module (Q-V4.3-I)

Pfad: `src/lib/handbook/slugify.ts` (neu, geteiltes Util)
Pfad: `src/lib/handbook/__tests__/slugify.test.ts` (neu)

Verhalten:
- `slugifyHeading(text: string): string` — kebab-case Slug mit Diacritic-Strip identisch zu `rehype-slug`-Default-Strategie.
- Beispiele:
  - "Mitarbeiter-Strategie" → "mitarbeiter-strategie"
  - "Was bedeutet Verantwortung?" → "was-bedeutet-verantwortung"
  - "ÜberArbeit" → "uberarbeit" (Umlaute werden zu Basis-Vokal, dann lowercased)
- Wird im Worker UND im Reader-`components.h2`-Override genutzt, sodass Worker-generierte Anchor-IDs mit `rehype-slug`-IDs uebereinstimmen.

### B — Worker-Template-Aenderung (BL-056)

Pfad: `src/worker/templates/INDEX.md.template` ODER `bin/worker/templates/index-handbuch.ts` (geaendert, Worker-Repo-Struktur erst pruefen)
Pfad: `src/worker/handbook-render.ts` ODER aequivalent (geaendert)

Verhalten:
- TOC-Render-Schritt im Worker schreibt `[Title](#section-anchor)` statt `[Title](01_section.md)`.
- Anchor-ID = `slugifyHeading(sectionTitle)`.
- Bestehende Section-Datei-Generierung unveraendert (die `.md`-Files entstehen weiter, fuer ZIP-Download und externe Tools).
- Section-Header (h1 in jeder Section-Datei) bekommt explizite `id="<slug>"`-Attribute (durch `rehype-slug` automatisch) — kein Worker-Touch noetig, weil `react-markdown` + `rehype-slug` das auf Render-Seite uebernimmt.

### C — Reader-`components.a`-Override Backwards-Compat (DEC-064)

Pfad: `src/components/handbook/reader-content.tsx` (unveraendert lassen)

Verhalten:
- Der bestehende `components.a`-Override fuer alte `[Title](01_section.md)`-Links bleibt fuer Backwards-Compat aktiv. Pre-V4.3-Snapshots rendern weiter wie bisher.
- Neue Snapshots haben ab V4.3 direkt `[Title](#anchor)` Links, der Override wird fuer sie nicht mehr triggern (regex matched nur `.md`-Suffix).
- Kein Auto-Re-Generate alter Snapshots (Out-of-Scope, R-V4.3-2-Mitigation).

### D — Umlaut-Konsistenz-Sweep (BL-057)

Pfad: `scripts/audit-umlauts.ts` (neu, dev-only)
Pfad: `src/templates/*.json` ODER `bin/worker/templates/*` (geaendert je nach Treffer)
Pfad: `src/worker/prompts/*` (geaendert, falls Worker-Prompts ae/oe/ue enthalten)
Pfad: `src/messages/de.json` (geaendert, falls UI-Strings ae/oe/ue enthalten)

Verhalten:
- `scripts/audit-umlauts.ts` durchsucht `src/templates/`, `src/worker/`, `src/messages/de.json`, `bin/worker/templates/` (falls existiert) und gibt eine Liste aller Vorkommnisse von `ae`, `oe`, `ue`, `ss` (jeweils Wort-mittig oder am Ende, um valide englische Worte wie "team" oder "user" auszuschliessen) zurueck.
- Output: `path:line:column — '<context>'` Format.
- Liste wird manuell geprueft + ge-fixt (Auto-Replace-Regel ist zu fragil — z.B. "Kuechentechnik" vs. "Kuche").
- Script kann `npm run audit:umlauts` aufgerufen werden.
- Pre/Post-SLC-052: vor dem Sweep `audit-umlauts.ts > before.txt`, nach dem Sweep `audit-umlauts.ts > after.txt`. `after.txt` muss auf null oder akzeptable Restfaelle reduziert sein.

### E — Tests

- `src/lib/handbook/__tests__/slugify.test.ts` (neu): 6 Cases — Standard, Umlaut-Strip, Punctuation, Multi-Space, Numbers, Empty-String.
- `src/worker/__tests__/handbook-render.test.ts` (neu oder erweitert): 2 Cases — Worker-Output enthaelt In-App-Anchor-Links + Anchor-IDs matchen `slugifyHeading`.
- Audit-Script-Output ist nicht-test, aber Pre/Post-Snapshots (before.txt, after.txt) werden im Slice-Report dokumentiert.

## Out of Scope

- Auto-Re-Generation alter Snapshots (User-Trigger pro Snapshot per Out-of-Scope-Decision).
- Templates-Englisch-Uebersetzung (V5+).
- ZIP-Download-Format-Aenderung (BL-056 ist nur In-App-Reader-Path).

## Acceptance Criteria

- AC-1: `slugifyHeading()`-Util ist in `src/lib/handbook/slugify.ts` definiert + 6 Tests gruen.
- AC-2: `slugifyHeading()` wird sowohl im Worker als auch im Reader genutzt (geteilte Source-of-Truth).
- AC-3: Neuer V4.3-Snapshot enthaelt im INDEX.md TOC-Links als `[Title](#anchor)` (kein `.md`-Suffix mehr).
- AC-4: Klick auf TOC-Link im Reader scrollt zur Section (kein 404, kein Reload).
- AC-5: Pre-V4.3-Snapshots rendern unveraendert (alter `[Title](01_section.md)`-Format wird weiter durch `components.a`-Override aufgeloest).
- AC-6: `scripts/audit-umlauts.ts` ist ausfuehrbar als `npm run audit:umlauts` und liefert Vorkommnisse-Liste.
- AC-7: Templates `+` Worker-Prompts `+` UI-de-Messages auf konsistente UTF-8-Umlaute migriert (audit-Output post-Sweep nur akzeptable Restfaelle).
- AC-8: Demo-Snapshot wird vom User manuell re-generated und im Reader visuell verifiziert (User-Pflicht-Schritt nach SLC-052 deploy).
- AC-9: `npm run build` + `npm run test` gruen.

## Dependencies

- Vorbedingung: SLC-053 done (Tooling-Migration).
- Vorbedingung: SLC-051 done (Reader-UX-Bundle, sodass `components.a`-Override-Fallback in stabilem Reader-Layout getestet werden kann).
- Keine Vorbedingung auf SLC-055 oder SLC-054.

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine. Worker-Output-Format-Aenderung ist Code-Aenderung, kein Schema-Touch.

## Pflicht-QA-Vorgaben

- Worker-Run mit Test-Snapshot generiert INDEX.md mit `#anchor`-Links. Browser-Smoke: Klick auf TOC-Link scrollt korrekt.
- Audit-Umlauts-Output Pre/Post in Slice-Report dokumentiert.
- V4.1-Regression: alte Snapshots (Pre-V4.3-Format) rendern weiter ohne Anchor-404.
- 4-Rollen-RLS-Matrix bleibt 100% PASS.
- V4.2-Regression-Smoke pro Helper-Component.
- `npm run test` + `npm run build` gruen.
- Cockpit-Records-Update nach Slice-Ende.

## Risks

- **R1 — `slugifyHeading`-Implementation weicht von `rehype-slug` ab:** Mitigation = nicht eigene Regex erfinden, stattdessen `github-slugger` (Library die `rehype-slug` intern nutzt) als Dep oder Re-Implementation 1:1 davon.
- **R2 — Audit-Umlauts findet zu viele False-Positives** (z.B. englische Worte "user", "team", "queue"): Mitigation = Audit-Script filtert vor der Output-Liste valide englische Worte aus einer kurzen Whitelist; manuelles Review der Liste vor dem Replace.
- **R3 — User generiert die Demo-Snapshots nicht neu:** SLC-052 testet das mit einem frischen Test-Snapshot; alte Demo-Snapshots bleiben mit altem Format, was per Out-of-Scope-Decision OK ist.
- **R4 — Worker-Repo-Struktur unklar:** Mitigation = vor MT-2 Worker-Folder pruefen (vermutlich `bin/worker/` oder `src/worker/`), Pfade im Slice-File-Update praezisieren.

## Detail-Decisions aus /architecture (V4.3)

- DEC-064 (Reader behaelt `components.a`-Override fuer Pre-V4.3-Snapshots).
- Q-V4.3-I (geteiltes `slugifyHeading`-Util, /slice-planning-Decision: ja, geteilt; Library-Wahl `github-slugger` empfohlen, finale Wahl in /backend SLC-052 MT-1).

### Micro-Tasks

#### MT-1: slugifyHeading-Util + Tests
- Goal: Geteiltes Slugify-Util das mit `rehype-slug` kompatibel ist.
- Files: `src/lib/handbook/slugify.ts` (neu), `src/lib/handbook/__tests__/slugify.test.ts` (neu)
- Expected behavior: `slugifyHeading()` produziert kebab-case-Slugs identisch zu `rehype-slug` (z.B. via `github-slugger`-Library).
- Verification: 6 Vitest-Tests, davon mind. 2 mit Umlauten + Sonderzeichen.
- Dependencies: none.

#### MT-2: Worker-Folder-Pruefung + Worker-Render-Patch
- Goal: Worker-TOC-Render auf In-App-Anchors umstellen.
- Files: Pfad-Pruefung erst (Glob `**/handbook-render*` und `**/INDEX.md.template*`), dann geaendert.
- Expected behavior: Neuer Worker-Output `INDEX.md` enthaelt `[Title](#slugify(title))` Links statt `.md`-Pfade.
- Verification: Worker-Run mit Test-Snapshot + Vitest-Snapshot-Vergleich.
- Dependencies: MT-1.

#### MT-3: Reader components.a-Override Verifikation
- Goal: Sicherstellen, dass Pre-V4.3-Snapshots weiter funktionieren (kein Code-Change, nur Verifikation).
- Files: `src/components/handbook/reader-content.tsx` (review only)
- Expected behavior: components.a-Override matcht weiter `\.md$`-URL-Pattern fuer alte Snapshots.
- Verification: V4.1-Regression-Smoke mit altem Snapshot.
- Dependencies: MT-2.

#### MT-4: Audit-Umlauts-Script
- Goal: Dev-only Script zum Auffinden von ae/oe/ue/ss-Vorkommnissen in Templates + Prompts + UI.
- Files: `scripts/audit-umlauts.ts` (neu), `package.json` (geaendert: `audit:umlauts`-Script-Eintrag)
- Expected behavior: `npm run audit:umlauts` listet Vorkommnisse mit Path:Line:Column-Format.
- Verification: Manueller Run + Pre/Post-Sweep-Diff in Slice-Report.
- Dependencies: none.

#### MT-5: Umlaut-Konsistenz-Sweep
- Goal: Templates + Worker-Prompts + UI-de-Messages auf konsistente UTF-8-Umlaute migrieren.
- Files: `src/templates/*.json` (geaendert), `src/worker/prompts/*` (geaendert), `src/messages/de.json` (geaendert), je nach Audit-Output.
- Expected behavior: Audit-Post-Sweep zeigt nur akzeptable Restfaelle (englische Worte, technische Namen).
- Verification: Audit-Output Pre/Post + Browser-Smoke (UI-Strings sehen korrekt aus, Worker generiert mit Umlauten).
- Dependencies: MT-4.

#### MT-6: Demo-Snapshot Re-Generate (User-Pflicht)
- Goal: Demo-Tenant generiert frischen Snapshot zur Pflicht-Verifikation des neuen Formats.
- Files: keine — User-Action via /admin/snapshots Trigger.
- Expected behavior: Frischer Snapshot rendert mit In-App-Anchor-Links + konsistenten Umlauten.
- Verification: Browser-Smoke des frischen Snapshots.
- Dependencies: MT-2 + MT-5 + Coolify-Deploy.
