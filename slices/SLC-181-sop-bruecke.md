# SLC-181 — SOP-/Handbuch-Brücke (modul_output + Scoring → sop)

- Feature: FEAT-098 (Phase 3) · Backlog: BL-523 · Version: V10.1
- Parallel-Group: E · MIG: keine (ggf. 130 bedingt) · Repo: OP (Backend)
- Status: planned · Dependency: **SLC-177 + SLC-180** (Scoring-Signale)
- Quelle: /architecture V10.1 DEC-253/D

## Ziel
Eine **dünne Brücke**: bewertete `modul_output`-Rows (accepted) + Scoring steuern, welche Outputs zu **SOP-/Handbuch-Sektionen** werden — geschrieben in die **bestehende `sop`-Tabelle**. Legacy `src/workers/sop/*` bleibt **unberührt**.

## Scope
- IN: Mapping `modul_output` (status=accepted) + Scoring → `sop`-Rows (Reuse bestehende sop-Tabelle) · Auswahl-Logik (welche output_kind/Scoring-Kombi wird Sektion) · Test.
- OUT: Legacy-SOP-Worker-Änderung (verboten, DEC-253/D). Cross-Modul-Personalisierung (parked).

## Offene Fragen bei Slice-Start auflösen
- F-D: konkreter Brücken-Kontrakt — welche `output_kind`/Scoring-Kombination wird SOP-Sektion; Mapping-Detail; ob eine kleine Migration (MIG-130, z.B. Herkunfts-Spalte auf sop) nötig ist (Default: keine, reine Reuse).

## Abnahme (AC — Rahmen, final bei Slice-Start)
- AC-181-1: Accepted `modul_output` + Scoring → `sop`-Rows via neues, isoliertes Mapping (kein Touch an `src/workers/sop/*`).
- AC-181-2: Auswahl-Logik dokumentiert (welche Outputs werden SOP-Sektion, welche nicht).
- AC-181-3: RLS/Tenant-Isolation gewahrt (sop-Tabelle bestehende RLS); kein neuer BYPASSRLS-Pfad.
- AC-181-4: Test (hermetisch + ggf. DB-Sidecar falls sop-Write RLS-relevant); tsc0/eslint0, `next build` PASS.

## Micro-Tasks (Outline — final bei Slice-Start)
- MT-1: Mapping-Function `modulOutputToSop(scoredOutputs)`. Files: `src/lib/stb-vertikale/module-delivery/sop-bridge.ts` (+ Test).
- MT-2: Wiring (Trigger-Punkt: nach Modul-Abschluss / accepted-Status) + sop-Write. Files: `src/lib/stb-vertikale/module-delivery/*` + Server-Action.
- MT-3 (bedingt): MIG-130 nur falls sop-Herkunfts-Spalte nötig (Default entfällt).

## Risiken / Dependencies
- R-181-1: Zwei SOP-Erzeugungspfade koexistieren (Legacy + Brücke) — bewusst (DEC-253/D), Konsolidierung spätere Version.
- Dependency: SLC-177 (Flags) + SLC-180 (Scoring-Signale/Trigger-Hits). Letzter Slice V10.1.

## Worktree/Isolation
OP-Worktree (SaaS-Pflicht). Pre-Merge-Re-Check: bestätigen, dass `src/workers/sop/*` unberührt ist.
