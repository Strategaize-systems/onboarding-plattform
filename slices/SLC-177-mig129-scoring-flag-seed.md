# SLC-177 — MIG-129 Scoring-Flag-Seed (Autoring-Run + Generator + Test)

- Feature: FEAT-096 (Phase 1) · Backlog: BL-521 · Version: V10.1
- Parallel-Group: B · **MIG: 129 (reserviert)** · Repo: OP
- Status: planned · Dependency: **SLC-176** (Skill)
- Quelle: /architecture V10.1 DEC-253/B, MIG-129-Skizze

## Ziel
Den `/module-delivery`-Autoring-Lauf über die 17 Fachmodule ausführen, die vom Founder abgenommenen Flag-Werte via **deterministischem Generator** in eine idempotente Seed-Migration `129_v101_module_delivery_flags_seed.sql` gießen, live-applyen und per DB-Sidecar verifizieren.

## Scope
- IN: Autoring-Run (Sonnet, Founder-Abnahme pro Modul) · Generator-Script · MIG-129 (UPDATE der 17 `stb_modul_*`-Template-Rows, `blocks[].questions[].flags`) · DB-Sidecar-Test · Live-Apply.
- OUT: Runtime-Auswertung der Flags (SLC-178/179). Kein DDL, keine Content-Änderung (M-04-treu, DEC-251).

## Abnahme (AC)
- AC-177-1: Generator `docs/stb-vertikale/gen-mig129-flag-seed.py` liest die approvten Flags + erzeugt MIG-129 deterministisch (uuid5-stabile Frage-Refs, idempotent, Muster gen-mig128).
- AC-177-2: `sql/migrations/129_v101_module_delivery_flags_seed.sql` UPDATEt die 17 Rows; nur `flags`-Felder; `NOTIFY pgrst`; `ON CONFLICT`/UPDATE idempotent.
- AC-177-3: Modul-Content (Fragen/Themenbäume/KI-Hebel, Question-Counts) **unverändert** (nur Flags geändert) — DB-Sidecar belegt.
- AC-177-4: DB-Sidecar-Test `src/lib/db/__tests__/migration-129-flag-seed.test.ts` (node:20-Sidecar, Coolify-DB, App-Zod-Gate wie RPT-542): Flags gesetzt wie approved, Content unverändert, idempotenter Re-Run.
- AC-177-5: Live-Apply auf Coolify-OP-DB via `sql-migration-hetzner.md` (base64+ssh+psql-postgres); 17 Rows verifiziert.

## Micro-Tasks
### MT-1: Autoring-Run + Founder-Abnahme
- Goal: `/module-delivery`-Skill über die 17 Module laufen lassen, Flags pro Modul abnehmen.
- Files: (kein Repo-File; Output = approvte Flag-Map als Generator-Input `docs/stb-vertikale/module-delivery-flags.json` o.ä.)
- Expected: vollständige, founder-approvte Flag-Belegung für alle 17 Module.
- Verification: Founder-Bestätigung pro Modul dokumentiert.
- Dependencies: SLC-176

### MT-2: Deterministischer Generator + MIG-129
- Goal: Generator-Script erzeugt die Seed-Migration.
- Files: `docs/stb-vertikale/gen-mig129-flag-seed.py`, `sql/migrations/129_v101_module_delivery_flags_seed.sql`
- Expected: idempotentes UPDATE der 17 Template-Rows (nur flags), uuid5-stabil, `NOTIFY pgrst`.
- Verification: Generator-Re-Run erzeugt byte-identische SQL.
- Dependencies: MT-1

### MT-3: DB-Sidecar-Test
- Goal: Verifikation gegen Coolify-DB (App-Zod-Gate).
- Files: `src/lib/db/__tests__/migration-129-flag-seed.test.ts`
- Expected: Flags == approved, Content unverändert, idempotenter Re-Run 17/17.
- Verification: node:20-Sidecar im `bwkg80w04...strategaize-net`, GREEN.
- Dependencies: MT-2

## Risiken / Dependencies
- R-177-1: JSONB-`flags`-Pfad-Surgery muss die exakte Frage-UUID treffen (uuid5-stabil aus MIG-128-Muster) — sonst stille No-Op. DB-Sidecar fängt das.
- Dependency: SLC-176 (Skill). Blockt SLC-178/179 (Runtime braucht gesetzte Flags).
- Live-Apply: reiner Seed, Feature-Flag OFF → 0 Prod-Impact.

## Worktree/Isolation
OP-Worktree (SaaS-Pflicht). Pre-Merge-Re-Check: MIG-129-Kollision (129 reserviert), Diff-Scope = Seed+Generator+Test.
