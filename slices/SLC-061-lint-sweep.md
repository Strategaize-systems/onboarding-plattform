# SLC-061 — Lint-Sweep V2-V4.2 Pre-existing Errors+Warnings

## Status
- Version: V4.4
- Status: planned
- Priority: Medium
- Created: 2026-05-05
- Worktree: gemeinsam mit SLC-062 in `worktree/v44-maintenance` (SaaS-Pattern, 1 Worktree pro Version)
- Backlog: BL-068
- Decisions: DEC-070 (Lint-Klassifikation Per-Item)

## Goal
Alle 7 Errors + 6 Warnings aus `npm run lint` per DEC-070-Klassifikation abarbeiten. Ergebnis: `npm run lint` liefert 0 Errors + 0 Warnings. Build/Typecheck/Tests bleiben gruen, kein User-sichtbares Verhalten aendert sich.

## In Scope (per DEC-070)

### Errors (7)
- **E1** BridgeProposalEditDialog.tsx:66 — setState-in-effect → setTimeout-Entkopplung
- **E2** EvidenceFileList.tsx:186 — Date.now in render → Inline-Disable mit Begruendung
- **E3** FileUploadZone.tsx:57+64 — use-before-declared → Reorder uploadFile vor onDrop
- **E4** jitsi-meeting.tsx:103 — setState-in-effect-catch → setTimeout-Entkopplung
- **E5+E6** SearchResultsList.tsx:30 — unescaped-quotes → `"` → `&quot;`
- **E7** sidebar.tsx:665 — Math.random in useMemo → Inline-Disable (shadcn-Library, intendiert)

### Warnings (6)
- **W1** email-stub.mjs:5 — anonymous-default-export → Object in Variable + export
- **W2** EvidenceFileList.tsx:196 — alt-text → alt-Prop ergaenzen
- **W3** FileUploadZone.tsx:61 — exhaustive-deps → mit E3 zusammen
- **W4** document-parser.ts:12 — unused-eslint-disable → entfernen
- **W5** document-parser.ts:24 — unused-eslint-disable → entfernen
- **W6** claim-loop.ts:45 — unused-eslint-disable → entfernen

## Out of Scope
- **Lint-Regel-Verschaerfung / neue ESLint-Plugins.** V4.4 bringt nur die existing Regeln zum Greenfield-Stand.
- **EvidenceFileList Date.now Proper-Fix mit useState+setInterval.** Als V5+ Backlog (siehe DEC-070 E2).
- **Behavior-Refactoring ueber Lint-Praeskription hinaus.** Wenn ein Lint-Fix Code-Refactoring nahelegt, das ueber den minimalen Fix hinausgeht — eskalieren, kein Auto-Refactor.
- **Test-Mock-Anpassungen.** Wenn Lint-Fix bestehende Tests bricht, muss der Test angepasst werden, aber kein neuer Test pro Fix-Pflicht.

## Acceptance Criteria
1. **AC-1** `npm run lint` liefert 0 Errors + 0 Warnings.
2. **AC-2** `npm run build` clean (0 Errors).
3. **AC-3** `npm run typecheck` clean.
4. **AC-4** `npm run test` 100% PASS (existing tests unveraendert oder mit minimaler Mock-Anpassung gruen).
5. **AC-5** Inline-Disables nur in 2 Files akzeptiert: `sidebar.tsx` (FALSE-POSITIVE shadcn) und `EvidenceFileList.tsx` (TRUE-POSITIVE-akzeptiert in V4.4-Scope). Begruendungen sind als Kommentar direkt am Disable.
6. **AC-6** V4.3-Funktionalitaet bleibt verifiziert: Reader, Help-Sheet, Bridge-Edit-Dialog, Jitsi-Meeting, Capture-Evidence-Upload — alle funktional unveraendert (Browser-Smoke nach Deploy oder per Vitest-Suite).
7. **AC-7** Lint-Output-Snapshot vor + nach Slice in Slice-Report dokumentiert (Errors-Count, Warnings-Count).

## Micro-Tasks

### MT-1: setState-in-effect-Fixes (BridgeProposalEditDialog + jitsi-meeting)
- **Goal:** E1 + E4 — beide Files haben das gleiche Pattern (setState synchron in useEffect-Body), beide Fixes per setTimeout(0)-Entkopplung oder konditionalem Update.
- **Files:**
  - `src/app/admin/bridge/BridgeProposalEditDialog.tsx`
  - `src/components/dialogue/jitsi-meeting.tsx`
- **Expected behavior:**
  - E1: Pre-Snapshot der beobachteten Verhaltensweise (Bridge-Edit-Dialog oeffnen → State-Initialisierung). Fix-Pattern: setState in setTimeout(0) Wrapper ODER useState mit funktionalem Initializer. Verhalten unveraendert.
  - E4: setState im catch-Block des useEffects (Jitsi-Init-Fehler). Fix per gleichem Pattern. Verhalten unveraendert.
- **Verification:**
  - `npx eslint src/app/admin/bridge/BridgeProposalEditDialog.tsx src/components/dialogue/jitsi-meeting.tsx` → 0 Errors fuer diese Files.
  - `npm run typecheck` clean.
- **Dependencies:** keine.
- **TDD:** nicht-strict — Lint-Fix-Pattern, keine neue Logik.

### MT-2: EvidenceFileList — Date.now-Inline-Disable + alt-text-Fix
- **Goal:** E2 (TRUE-POSITIVE-aber-Inline-Disable per DEC-070) + W2 (alt-text-Warning).
- **Files:**
  - `src/app/capture/[sessionId]/block/[blockKey]/evidence/EvidenceFileList.tsx`
- **Expected behavior:**
  - Zeile 186: `// eslint-disable-next-line react-hooks/purity -- Intended: 3-min freshness window for analysis-pending UX cue, not a regression-relevant render-time non-determinism. Proper fix with useState+setInterval as V5+ Backlog.`
  - Zeile 196: `<img>` ohne alt-Prop — alt-Prop ergaenzen mit beschreibendem Text (z.B. `alt={file.original_filename}` oder `alt=""` wenn rein dekorativ).
- **Verification:**
  - `npx eslint src/app/capture/[sessionId]/block/[blockKey]/evidence/EvidenceFileList.tsx` → 0 Errors + 0 Warnings.
- **Dependencies:** keine.

### MT-3: FileUploadZone — Reorder + useCallback-dep
- **Goal:** E3 (use-before-declared) + W3 (useCallback-dep).
- **Files:**
  - `src/app/capture/[sessionId]/block/[blockKey]/evidence/FileUploadZone.tsx`
- **Expected behavior:**
  - `uploadFile` wird in `onDrop`-useCallback referenziert, ist aber spaeter im Component-Body deklariert — TDZ-Risiko. Fix: `uploadFile`-Definition VOR `onDrop`-useCallback verschieben.
  - `useCallback`-dep-array auf `[uploadFile]` erweitern (W3).
  - Verhalten unveraendert (Drag-Drop funktioniert weiter).
- **Verification:**
  - `npx eslint src/app/capture/[sessionId]/block/[blockKey]/evidence/FileUploadZone.tsx` → 0 Errors + 0 Warnings.
  - Wenn Tests existieren: `npm run test FileUploadZone` 100% PASS.
- **Dependencies:** keine.

### MT-4: SearchResultsList + sidebar — escape-Quotes + Inline-Disable
- **Goal:** E5+E6 (unescaped-quotes, beide Vorkommnisse Zeile 30) + E7 (FALSE-POSITIVE Math.random-Disable).
- **Files:**
  - `src/components/handbook/SearchResultsList.tsx`
  - `src/components/ui/sidebar.tsx`
- **Expected behavior:**
  - SearchResultsList Zeile 30: `"` → `&quot;` (zwei Vorkommnisse). Visuelles Rendering unveraendert.
  - sidebar.tsx Zeile 665: `// eslint-disable-next-line react-hooks/purity -- shadcn library code: intentional skeleton-width randomization for visual variety, not a purity violation in product context.`
- **Verification:**
  - `npx eslint src/components/handbook/SearchResultsList.tsx src/components/ui/sidebar.tsx` → 0 Errors fuer diese Files.
- **Dependencies:** keine.

### MT-5: Warnings-Cleanup (email-stub + unused-disables)
- **Goal:** W1 + W4 + W5 + W6 — alle restlichen Warnings.
- **Files:**
  - `scripts/qa-stubs/email-stub.mjs`
  - `src/lib/document-parser.ts` (Zeilen 12 + 24)
  - `src/workers/condensation/claim-loop.ts` (Zeile 45)
- **Expected behavior:**
  - email-stub.mjs:5 — `export default { ... }` → `const stub = { ... }; export default stub;`.
  - document-parser.ts:12 + 24 — `// eslint-disable-next-line ...`-Kommentare entfernen (sind unused).
  - claim-loop.ts:45 — gleicher Fix.
- **Verification:**
  - `npx eslint scripts/qa-stubs/email-stub.mjs src/lib/document-parser.ts src/workers/condensation/claim-loop.ts` → 0 Warnings fuer diese Files.
- **Dependencies:** keine.

### MT-6: Final-Verifikation + Snapshot-Doku
- **Goal:** AC-1..AC-7 zusammen verifizieren.
- **Files:** keine (Verifikations-Schritt).
- **Expected behavior:**
  - `npm run lint` → 0 Errors + 0 Warnings (AC-1).
  - `npm run build` → clean (AC-2).
  - `npm run typecheck` → clean (AC-3).
  - `npm run test` → 100% PASS (AC-4).
  - Pre-Snapshot dokumentieren: 7 Errors + 6 Warnings vor MT-1.
  - Post-Snapshot dokumentieren: 0 Errors + 0 Warnings nach MT-5.
- **Verification:** alle 4 Commands oben.
- **Dependencies:** MT-1, MT-2, MT-3, MT-4, MT-5.

## Risiken und Mitigationen
- **R-1 setState-Fix bricht Verhalten:** Bridge-Edit-Dialog oder Jitsi-Init reagiert anders nach setTimeout-Entkopplung (z.B. Race mit User-Interaktion). Mitigation: Pre-Fix-Browser-Smoke der beiden Components, Post-Fix-Smoke verifizieren identisches Verhalten.
- **R-2 FileUploadZone-Reorder bricht Hoisting-Erwartung:** Wenn `uploadFile` von Hook-Scope abhing, kann Reorder andere Effekte haben. Mitigation: Vorsichtig nur die Definitions-Reihenfolge tauschen, keine Logik anfassen.
- **R-3 Inline-Disable in EvidenceFileList wird unbemerkt zur falschen Akzeptanz:** Wenn andere Devs das gleiche Pattern uebernehmen, breitet sich das Anti-Pattern aus. Mitigation: Begruendung im Disable-Kommentar muss EXPLIZIT auf "V5+ Proper-Fix als Backlog" verweisen.
- **R-4 Tests brechen durch Reorder:** Wenn Tests auf Hoisting-Verhalten oder spezifische setState-Reihenfolge bauen, koennen sie failed. Mitigation: Tests einzeln pro File-Fix laufen lassen, bei Failure analysieren ob Test-Mock-Anpassung oder Verhaltens-Drift.

## Verifikations-Schritte (vor /qa)
1. `npm run lint` → 0/0.
2. `npm run build` clean.
3. `npm run typecheck` clean.
4. `npm run test` 100% PASS.
5. Wenn Bridge-Edit-Dialog oder Jitsi-Meeting touched (MT-1): Optional Browser-Smoke vor /qa, sicher in /qa.
6. Pre-/Post-Lint-Snapshot dokumentiert in `/reports/RPT-XXX.md` (`/qa SLC-061`).

## Recommended Next Step
Nach SLC-061 done + /qa SLC-061 PASS:
1. **`/backend SLC-062`** — SQL-Backfill MIG-030 (audit-Extract + Migration-Datei + Hetzner-Apply).
2. Parallel: **BL-067** Berater-Inhalts-Review der 5 Help-MD-Files (User-direkt-Edit).

## Referenzen
- BL-068 (Backlog-Item)
- DEC-070 (Lint-Klassifikation Per-Item)
- RPT-152 (/architecture V4.4)
- `npx eslint .` Live-Output-Pre-Snapshot in /reports
