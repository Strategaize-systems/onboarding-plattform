# SLC-056 — ADR State-Maschinen-Pattern + Spike Turbopack-Layout-Inlining

## Goal
Zwei Architektur-Items abschliessen ohne Production-Code-Aenderung: (a) ADR fuer State-Maschinen-UPDATE-Pattern (Service-Role-Default vs RLS-UPDATE-Policy) als verbindliche Doku fuer kuenftige Slices; DEC-065 ist bereits geschrieben — SLC-056 ergaenzt das ARCHITECTURE.md-Pattern + Test-Pflicht-Pattern + ein Code-Beispiel-Snippet. (b) Spike Investigation Turbopack-Layout-Inlining-Anomalie aus V4.2 SLC-047 in eigenem Branch, 4h-Box, Output GitHub-Issue beim Next.js-Repo ODER Workaround-ADR (DEC-066).

## Feature
V4.3 Maintenance

## Backlog Items
- BL-065 ADR fuer State-Maschinen-UPDATE-Pattern
- BL-066 Investigation Next.js 16 Turbopack-Layout-Inlining-Anomalie (Spike)

## In Scope

### A — ADR-Dokumentations-Erweiterung (BL-065)

Pfad: `docs/ARCHITECTURE.md` (geaendert, Anhang-Sektion)
Pfad: `docs/DECISIONS.md` (DEC-065 existiert seit /architecture V4.3)
Pfad: `docs/STATE-MACHINE-PATTERN.md` (neu, optional — kann auch als Anhang in ARCHITECTURE.md leben)

Verhalten:
- DEC-065 hat den Pattern-Default + Ausnahme-Kriterien gesetzt. SLC-056 ergaenzt:
  - **Code-Beispiel-Snippet** des Default-Patterns (Service-Role-UPDATE mit `requireTenantAdmin()`-Pruefung).
  - **Code-Beispiel-Snippet** der Ausnahme-Variante (RLS-UPDATE-Policy bei rein nutzer-getriebenem UPDATE auf eigene Zeile).
  - **Pflicht-Test-Pattern**:
    - Test 1: 4-Rollen-RLS-Test fuer SELECT-Sichtbarkeit (existiert seit V4).
    - Test 2: Server-Action-Test fuer UPDATE-Pruefung (Mock unauthorized → erwarte Throw, Mock authorized → erwarte Erfolg).
  - **Migration-Path-Doku**: bestehende V4-Slices brauchen keinen Refactor; nur neue Slices ab V4.3 muessen sich an dieses Pattern halten.
  - **Verlinkung im V4.3-Architecture-Addendum** zu DEC-065 + neue Pattern-Doku.

### B — Spike Branch-Setup (BL-066, DEC-066)

Pfad: `spike/v43-turbopack-layout-inlining` (Branch ausgehend von `main`)

Verhalten:
- Branch-Name: `spike/v43-turbopack-layout-inlining`.
- Vom main-HEAD ausgecheckt, NICHT in main gemergt (DEC-066).
- Stress-Test-Setup im Branch:
  - Minimal-Reproducer: ein neuer Test-Layout (`src/app/__spike__/layout.tsx`) der absichtlich mehr Markup als das produktive Dashboard-Layout enthaelt, plus eine Page (`src/app/__spike__/page.tsx`).
  - Build mit `next build` und Turbopack-Production-Mode.
  - Build-Output-Inspection: ist Layout-Code in Page-Bundle inlined? Wenn ja: Reproduktion bestaetigt.
- 4h-Timebox: `start_time` in Slice-Report; Output-Pflicht nach 4h.

### C — Spike-Output-Doku

Output-Pflicht (DEC-066), eines der beiden:

**Option (i) — GitHub-Issue beim `vercel/next.js`:**
- Issue-Body mit Minimal-Reproducer-Repo-Link (kann ein Gist oder der Spike-Branch-Public-View sein).
- Reproduktions-Schritte.
- Erwartetes vs. tatsaechliches Verhalten.
- URL der Issue im Slice-Report dokumentiert.

**Option (ii) — Workaround-ADR:**
- Neue DEC-068 in `docs/DECISIONS.md` (oder Anhang in DEC-066) mit:
  - "Turbopack inlined Layout-Code in Production-Builds wenn <Bedingung>. Workaround: <Pattern>."
  - Beispiel-Bedingung: kleines Layout, single-import.
  - Workaround-Pattern: Wizard-Trigger im page.tsx statt layout.tsx (genau das wurde in V4.2 SLC-047 commit 6f774ec gemacht).
- Eintrag in `docs/KNOWN_ISSUES.md` als Akzeptierter-Pre-existing-Issue mit Workaround.
- Eintrag in `docs/SKILL_IMPROVEMENTS.md` falls Pattern-Lessons relevant.

### D — Spike-Branch-Cleanup-Policy

- Branch wird nach Spike NICHT geloescht (history bleibt fuer Nachvollziehbarkeit).
- Branch wird nicht in main gemergt.
- `.gitignore`-Anpassung NICHT noetig — Spike-Code lebt in eigener `__spike__`-Subfolder, der von einem `.gitignore`-Eintrag im main NICHT betroffen ist (im Spike-Branch ist die Folder commited).
- Slice-Report verweist auf den Spike-Branch + den Output (Issue-URL oder ADR).

## Out of Scope

- Refactoring bestehender V4-State-Maschinen auf neues Pattern (per DEC-065 nicht erforderlich).
- Code-Fix in main fuer Turbopack-Bug, falls Bug bestaetigt (DEC-066: kein Fix in V4.3, abwarten upstream).
- ADR-Cross-Linking in alle V4-Slice-Files (bewusste Reduktion — Pattern wird ab V4.3 verbindlich).
- Tests fuer den Spike-Reproducer (Spike-Branch ist disposable).

## Acceptance Criteria

- AC-1: ARCHITECTURE.md hat State-Machine-Pattern-Sektion mit Code-Beispielen Default + Ausnahme.
- AC-2: Pflicht-Test-Pattern (RLS-SELECT-Test + Server-Action-UPDATE-Test) ist in Pattern-Sektion dokumentiert.
- AC-3: V4.3-Addendum verlinkt auf DEC-065 + Pattern-Sektion.
- AC-4: Spike-Branch `spike/v43-turbopack-layout-inlining` existiert, 4h-Timebox hat Start- und Endzeit im Slice-Report.
- AC-5: Spike-Output ist eindeutig: ENTWEDER GitHub-Issue-URL ODER Workaround-ADR (DEC-068 oder Erweiterung von DEC-066) + KNOWN_ISSUES-Eintrag.
- AC-6: Spike-Branch ist NICHT in main gemergt; main bleibt clean.
- AC-7: V4.2-Funktionalitaet im main-Branch unveraendert (kein Spike-Code-Leak).
- AC-8: Slice-Report dokumentiert Spike-Beobachtungen + Pre/Post-Vergleich + Output.
- AC-9: `npm run build` + `npm run test` auf main gruen (kein Spike-Code in main).

## Dependencies

- Vorbedingung: SLC-053, 051, 052, 055 done (alle anderen Code-Slices vor Spike, sodass main stabil ist).
- Reihenfolge: SLC-056 ist 5. V4.3-Slice per DEC-062.
- Spike kann parallel zu SLC-054 laufen (kein Code-Overlap).

## Worktree

Optional. Spike-Branch IST schon eine Form von Isolation; ein zusaetzlicher Worktree ist Overhead.

ADR-Doku-Aenderungen am main koennten in einem Worktree laufen oder direkt — User-Wahl im Slice-Lauf.

## Migrations-Zuordnung

Keine.

## Pflicht-QA-Vorgaben

- ADR-Doku-Lesefluss-Pruefung: ARCHITECTURE.md State-Machine-Sektion ist auffindbar + verlinkt von V4.3-Addendum.
- DEC-065 enthaelt Code-Beispiele (Default + Ausnahme).
- Pflicht-Test-Pattern ist in Pattern-Sektion klar formuliert.
- Spike-Branch existiert und enthaelt Reproducer-Code.
- Spike-Output ist eindeutig: Issue-URL oder Workaround-ADR.
- Slice-Report enthaelt Pre/Post-Spike-Beobachtungen + Timebox-Start/End.
- 4-Rollen-RLS-Matrix bleibt 100% PASS (kein DB-Touch).
- V4.2-Regression-Smoke (kein main-Code-Aenderung erwartet).
- `npm run test` + `npm run build` gruen auf main.
- Cockpit-Records-Update nach Slice-Ende.

## Risks

- **R1 — 4h-Spike-Box reicht nicht fuer Root-Cause:** Mitigation = "Workaround-bestaetigt + Issue-ohne-Antwort"-Output ist akzeptables Outcome (DEC-066, R-V4.3-5).
- **R2 — Spike-Branch wird unbeabsichtigt in main gemergt:** Mitigation = Pflicht-Verifikation `git log main --oneline | grep spike` ist leer am Ende von SLC-056.
- **R3 — ADR-Doku wird zu lang/zu abstrakt:** Mitigation = Code-Beispiele sind Pflicht (kein "Pseudo-Code"); Lesbarkeits-Check durch User vor Slice-Abschluss.
- **R4 — Test-Pattern wird in V4.4+ nicht angewendet:** Mitigation = `feedback_qa_after_every_slice` und `feedback_follow_all_rules` greifen; falls Pattern-Drift entsteht, IMP in SKILL_IMPROVEMENTS dokumentieren.
- **R5 — Bedrock-Costs durch Spike:** Spike beruehrt kein LLM, keine Kosten. Klarstellung im Report.

## Detail-Decisions aus /architecture (V4.3)

- DEC-065 (State-Maschinen-Pattern: Service-Role-Default).
- DEC-066 (Spike in eigenem Branch, 4h-Box, Output-Pflicht).

### Micro-Tasks

#### MT-1: ARCHITECTURE.md State-Machine-Pattern-Sektion
- Goal: Pattern-Sektion mit Code-Beispielen + Pflicht-Test-Pattern dokumentieren.
- Files: `docs/ARCHITECTURE.md` (geaendert)
- Expected behavior: Lesbare Sektion mit Default-Code-Beispiel + Ausnahme-Code-Beispiel + 2-Test-Pattern.
- Verification: User-Lesefluss-Pruefung, Slice-Report-Eintrag mit Sektion-Excerpt.
- Dependencies: none.

#### MT-2: V4.3-Addendum-Verlinkung
- Goal: V4.3-Addendum-Sektion verlinkt explizit auf neue Pattern-Sektion.
- Files: `docs/ARCHITECTURE.md` (geaendert) — V4.3-Addendum-Update.
- Expected behavior: Section-Link sichtbar fuer kuenftige Leser.
- Verification: ARCHITECTURE.md-Render-Pruefung (lokal Markdown-Preview).
- Dependencies: MT-1.

#### MT-3: Spike-Branch Setup
- Goal: Branch ausgecheckt + Reproducer-Code hinzugefuegt.
- Files: `spike/v43-turbopack-layout-inlining`-Branch mit `src/app/__spike__/layout.tsx` + `src/app/__spike__/page.tsx`.
- Expected behavior: Branch ist isoliert, Reproducer-Code ist klein (< 30 Zeilen).
- Verification: `git log spike/...`-Existenz; Reproducer-Code in Slice-Report-Anhang.
- Dependencies: MT-1.

#### MT-4: Spike-Investigation (4h-Box)
- Goal: Build + Build-Output-Inspection + Beobachtung.
- Files: keine Code-Aenderung in main; Slice-Report-Eintrag mit Beobachtungen.
- Expected behavior: Klare Pre/Post-Beobachtung. Reproduktions-Status: bestaetigt / nicht-reproduzierbar / partiell.
- Verification: Slice-Report mit Build-Output-Excerpt + Timebox-Start/End.
- Dependencies: MT-3.

#### MT-5: Spike-Output (GitHub-Issue ODER Workaround-ADR)
- Goal: Eines der zwei Output-Optionen produzieren.
- Files: ENTWEDER ein neuer DEC-068 / ADR-Anhang im DECISIONS.md + KNOWN_ISSUES-Eintrag, ODER eine externe GitHub-Issue-URL im Slice-Report.
- Expected behavior: Eindeutige Antwort auf "Was machen wir mit dem Turbopack-Verhalten?".
- Verification: Slice-Report enthaelt Output-Verweis.
- Dependencies: MT-4.

#### MT-6: Verifikation Branch-Isolation
- Goal: Sicherstellen Spike-Code ist nicht in main.
- Files: keine Aenderung — `git log main --oneline | grep -i spike`-Check.
- Expected behavior: leeres Ergebnis.
- Verification: Slice-Report-Eintrag mit Befehl-Output.
- Dependencies: MT-5.
