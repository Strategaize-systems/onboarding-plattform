# SLC-173 — Modul-Fragebogen-Capture (Stufe-1-Kern + Stufe-2-Vertiefung)

- Version: V10
- Feature: FEAT-093
- Backlog: BL-512
- Status: planned
- Priority: High
- Created: 2026-06-21
- Parallel-Group: B (nach SLC-170 Seed) — parallel-faehig zu SLC-172, shared Capture-Wizard → siehe R-173-2
- MIG reserviert: keine
- Worktree (SaaS-Pflicht): eigener Branch `v10-slc173-modul-capture`, Merge nach /qa-PASS

## Ziel
Der StB beantwortet pro Modul (M-04/05/06) den Fragebogen fuer die eigene Kanzlei — Stufe-1-Kern (Pflicht) + optional Stufe-2-Vertiefung — via Reuse des bestehenden `capture/`-Wizards (Block-Submit-Pattern). Antworten landen in `block_checkpoint.content` und werden zur Eingabe fuer die KI-Output-Synthese (SLC-174). Save/Resume + optional Voice (Whisper, EU).

## Architektur-Anker
- ARCHITECTURE §3.4: Reuse `capture/`-Wizard + `capture_session` + `block_checkpoint`; Stufe-1/Stufe-2 ueber Template-`blocks`-`ebene`/`required` (SLC-170).
- Whisper-Voice optional via vorhandenem EU-Pfad (`data-residency.md`).
- DEC-237: `capture_session.metadata.imported_dataset_ref` als offener DATEV-Merker (kein DDL, jsonb vorhanden).

## Akzeptanzkriterien
- **AC-173-1:** StB startet + beantwortet pro Modul Stufe-1-Kern + (optional) Stufe-2-Vertiefung; Save/Resume funktioniert (Block-Submit-Pattern, Reuse).
- **AC-173-2:** Antworten strukturiert in `block_checkpoint.content` — uebergabe-faehig an die KI-Output-Stufe (SLC-174 liest exakt diese Shape).
- **AC-173-3:** Stufe-1 ist Pflicht, Stufe-2 optional (aus Template-`blocks` `required`/`ebene` gesteuert).
- **AC-173-4:** Optional Voice-Input via bestehendem Whisper-Pfad (EU) — wenn im Scope, sonst dokumentiert deferred.
- **AC-173-5:** Tenant-Isolation (RLS) verifiziert; `tsc`/`eslint` 0; hermetische Tests GREEN.

## Micro-Tasks

### MT-1: Modul-Capture-Eintritt + Stufe-1/Stufe-2-Flow (Reuse Wizard)
- Goal: Modul-Fragebogen beantwortbar pro M-04/05/06.
- Files: `src/app/dashboard/stb/modul/[modulKey]/page.tsx` (neu — Reuse Capture-Wizard, Template `stb_modul_mXX`), `src/lib/stb-vertikale/modul-capture.ts` (neu — Session-Start + Stufe-Filter-Helper).
- Expected behavior: StB startet Modul-Session, Stufe-1-Blocks Pflicht + Stufe-2 optional einblendbar; `block_checkpoint` geschrieben (Reuse `rpc_create_block_checkpoint`).
- Verification: hermetischer Test (Session-Start, Stufe-Filter, Checkpoint-Write); Env-Gate (SLC-171) greift.
- Dependencies: SLC-170 (Modul-Templates), SLC-171 (Env-Gate).

### MT-2: Save/Resume + optional Voice + Enqueue-Hook
- Goal: Antworten persistent + an Synthese uebergebbar.
- Files: `src/lib/stb-vertikale/modul-capture.ts` (Resume-Logik), optional Whisper-Wiring (Reuse), Enqueue-Button/Action ruft `rpc_enqueue_module_output` (SLC-169) — hinter Tier-Gate.
- Expected behavior: Resume laedt letzten Stand; „Modul-Output erzeugen" enqueued `module_output_synthesis`-Job fuer den Run (tier-gated).
- Verification: hermetischer Test (Resume + Enqueue-Call shape); Voice-Scope dokumentiert.
- Dependencies: MT-1, SLC-169 (RPC vorhanden).

## Risiken & Dependencies
- **R-173-1 (Capture-Wizard-Reuse):** bestehenden `capture/`-Wizard + `block_checkpoint`-Mechanik code-verifizieren (Block-Submit-Pattern) — Reuse, kein Neubau.
- **R-173-2 (Shared Capture-Wizard mit SLC-172):** disjunkte Routen-Pfade (`dashboard/stb/modul/*` vs. `blueprint/*`); gemeinsame Wizard-Komponenten nicht gleichzeitig divergent aendern (Pre-Merge-Re-Check Pattern-Drift).
- **R-173-3 (Output-Contract-Kopplung):** `block_checkpoint.content`-Shape ist der Vertrag zu SLC-174. Mitigation: Shape in MT-1 fixieren + in SLC-174 exakt referenzieren.
- **Dependency:** SLC-170 (Templates), SLC-171 (Env-Gate), SLC-169 (Enqueue-RPC). Liefert Capture-Antworten → SLC-174.

## Out of Scope
Mandanten-Capture (V11+); >3 Module; Bulk-/Email-Import als Modul-Datenquelle (separate V9-Linie); DATEV-Import-Implementierung (V11+).
