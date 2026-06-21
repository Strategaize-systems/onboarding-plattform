# SLC-175 — Modul-Workspace-Reader + KI-Hebel-Liste

- Version: V10
- Feature: FEAT-095
- Backlog: BL-514
- Status: planned
- Priority: High
- Created: 2026-06-21
- Parallel-Group: D (sequenziell nach C) — abhaengig von SLC-174 (modul_output-Rows)
- MIG reserviert: keine
- Worktree (SaaS-Pflicht): eigener Branch `v10-slc175-workspace-reader`, Merge nach /qa-PASS

## Ziel
Der Konsum-Endpunkt der Lieferdomaene: der StB liest pro Modul alle drei Output-Typen (Entscheidung / Standard / Implementierungsschritt) **und** die KI-Hebel-Liste (Reifegrad 1-4) fuer die eigene Kanzlei. Lesbares + (wo sinnvoll) druckbares Rendering. RLS-isoliert, DATEV-Abgrenzung im Naming. Konsum-only (Edit/Status-Vertiefung als optionaler Sub-Scope).

## Architektur-Anker
- ARCHITECTURE §3.6 + §5.4: `dashboard/stb/*` liest `modul_output` (RLS) gruppiert nach Modul + Output-Kind + KI-Hebel-Liste nach Reifegrad.
- Reuse-Vorbilder: Handbuch-Reader (FEAT-028 — Sidebar/Markdown-Render/Anchors) + Stufe-1-Report-Renderer (FEAT-086 React-PDF) fuer Print.
- DATEV-Abgrenzung (SC-6): „operative Wirk-Schicht", NICHT DATEV-„Organisationshandbuch".

## Akzeptanzkriterien
- **AC-175-1:** StB sieht pro Modul (M-04/05/06) alle drei Output-Typen + die KI-Hebel-Liste (Reifegrad 1-4, gestaffelt/sortiert).
- **AC-175-2:** Rendering lesbar; wo sinnvoll druckbar (Print-View, Reuse React-PDF-Pattern FEAT-086).
- **AC-175-3:** Tenant-Isolation (RLS) verifiziert — StB sieht nur eigene `modul_output`-Rows; DATEV-Begriffs-Abgrenzung im Naming.
- **AC-175-4:** Empty-/Loading-/Error-States (noch kein Output generiert, Synthese laeuft, Job failed).
- **AC-175-5:** Hinter Env-Gate `NEXT_PUBLIC_ENABLE_STB_VERTIKALE` (SLC-171); `tsc`/`eslint` 0; hermetische + Browser-Smoke-Verifikation.
- **AC-175-6 (optional Sub-Scope):** Status-Edit auf `modul_output` (`proposed`→`accepted`/`edited`) fuer die ~20 %-StB-Vertiefung — wenn im Scope, sonst dokumentiert nach V10.x verschoben.

## Micro-Tasks

### MT-1: Workspace-Reader-Route + Modul-Gruppierung
- Goal: `modul_output` lesbar gruppiert.
- Files: `src/app/dashboard/stb/workspace/page.tsx` (neu — Modul-Uebersicht), `src/app/dashboard/stb/workspace/[modulKey]/page.tsx` (neu — Detail), `src/lib/stb-vertikale/workspace-read.ts` (neu — RLS-Query gruppiert Modul/Output-Kind/Reifegrad), Tests.
- Expected behavior: liest `modul_output` (RLS), gruppiert nach `modul_key` + `output_kind`; KI-Hebel nach `reifegrad` 1-4 sortiert.
- Verification: hermetischer Query-Test (Gruppierung/Sort); DB-Sidecar RLS (nur eigener Tenant).
- Dependencies: SLC-174 (Rows vorhanden), SLC-169 (Schema), SLC-171 (Env-Gate).

### MT-2: Triple-Render + KI-Hebel-Liste + States + Print
- Goal: lesbares + druckbares Rendering inkl. Non-Happy-States.
- Files: `src/components/stb/ModuleOutputCard.tsx` + `KiHebelList.tsx` (neu — Reuse Handbuch-Reader-Render-Pattern), Print-View (Reuse React-PDF FEAT-086), Empty/Loading/Error-States, i18n `stb.*` (de Pflicht, en/nl).
- Expected behavior: Entscheidung/Standard/Implementierungsschritt je Card; KI-Hebel als Reifegrad-gestaffelte Liste; Print erzeugt sauberes Dokument; States korrekt.
- Verification: hermetischer Render-Test; Browser-Smoke (Reader rendert, Print-View, 0 CSP-/Console-Errors wenn Security-Header betroffen).
- Dependencies: MT-1.

## Risiken & Dependencies
- **R-175-1 (Reader-Pattern-Reuse):** Handbuch-Reader (FEAT-028) + Report-Renderer (FEAT-086) code-lesen — Render/Anchor/Print 1:1 reusen (`strategaize-pattern-reuse.md`), nicht neu bauen.
- **R-175-2 (Daten-Abhaengigkeit):** ohne SLC-174-Output ist der Reader leer — Browser-Smoke braucht mind. einen echten Synthese-Run (Founder-eigene Kanzlei, R1). Empty-State (AC-175-4) deckt den Vor-Zustand.
- **R-175-3 (Edit-Sub-Scope):** AC-175-6 (Status-Edit) ist optional — im /frontend entscheiden, ob in V10 oder Folgeslice. Default: Render-only in V10, Edit als V10.x.
- **Dependency:** SLC-174 (modul_output-Rows), SLC-169 (Schema), SLC-171 (Env-Gate). Letzter V10-Slice.

## Out of Scope
Workspace-Monatsmechanik (Sparring/Champion-Sessions, Team-Stunden-Tracking); Sales-/Pricing-/Angebots-Komponenten fuer Resale (V11+ Stufe-2); Mandanten-View (V11+).
