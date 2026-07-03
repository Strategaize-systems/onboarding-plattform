# SLC-176 — /module-delivery Skill (Dev-System, Design-Time-Autoring)

- Feature: FEAT-096 (Phase 1) · Backlog: BL-524 · Version: V10.1
- Parallel-Group: A · MIG: keine · Repo: **strategaize-dev-system** (Skill-Artefakt, kein OP-Code)
- Status: planned
- Quelle: /architecture V10.1 DEC-253/E, ARCHITECTURE §V10.1-Addendum

## Ziel
Ein Claude-Code-Skill `/module-delivery`, das die 5 Scoring-Flags (`owner_dependency`/`deal_blocker`/`sop_trigger`/`ko_hart`/`ko_soft`) pro Frage über die 17 Fachmodule **via LLM (Sonnet 4) vorschlägt**, dem Founder pro Modul zur **Abnahme** vorlegt, und nach Abnahme eine **deterministische Seed-Migration MIG-129** (+ Generator-Script) emittiert. Founder setzt in keinem Fall Flags von Hand (DEC-252).

## Scope
- IN: Skill-Definition (`SKILL.md` + Prompt-Guardrails Sonnet-Flag-Klassifikation + Abnahme-Flow + Generator-Emission-Anleitung). Muster wie `/module-author` (Dev-System-Skill).
- OUT: Der tatsächliche Autoring-Lauf + die konkrete MIG-129-Datei (= SLC-177). Runtime-Auswertung (= SLC-178/179).

## Abnahme (AC)
- AC-176-1: `/module-delivery`-Skill existiert unter `.claude/skills/module-delivery/SKILL.md`, im Skill-Katalog sichtbar.
- AC-176-2: Skill-Body definiert den Sonnet-Klassifikations-Prompt mit Guardrails gegen Über-Flagging (R2/F-C): konservativ, „im Zweifel false", Begründung je gesetztem Flag.
- AC-176-3: Skill definiert den **per-Modul-Abnahme-Flow** (Vorschlag zeigen → Founder bestätigt/korrigiert → nächstes Modul).
- AC-176-4: Skill definiert die deterministische Generator-Emission (Muster `gen-mig128-fachmodule-seed.py`): approvte Flags → `129_v101_module_delivery_flags_seed.sql`, uuid5-stabile Frage-Refs, idempotent.
- AC-176-5: Data-Residency-Klausel: Sonnet ausschließlich Bedrock Frankfurt (data-residency.md).

## Micro-Tasks
### MT-1: Skill-Gerüst + Metadaten
- Goal: `SKILL.md` mit name/description + Zweck/Wann-nutzen (progressive disclosure).
- Files: `.claude/skills/module-delivery/SKILL.md` (Dev-System-Repo)
- Expected: Skill im Katalog sichtbar; description = „setzt Scoring-Flags an StB-Fachmodulen via LLM-Klassifikation + Founder-Abnahme + Seed-Emission".
- Verification: Skill-Liste zeigt `/module-delivery`.
- Dependencies: none

### MT-2: Sonnet-Klassifikations-Prompt + Guardrails
- Goal: Prompt-Sektion, die je Frage die 5 Flags klassifiziert (konservativ, Begründung).
- Files: `.claude/skills/module-delivery/SKILL.md`
- Expected: klare Flag-Definitionen + „im Zweifel false" + JSON-Output-Schema pro Frage.
- Verification: Trockenlauf gegen 1 Modul (z.B. M-04) liefert plausible Flag-Vorschläge.
- Dependencies: MT-1

### MT-3: Abnahme-Flow + Generator-Emission-Anleitung
- Goal: per-Modul-Abnahme + deterministische MIG-129-Generierung dokumentiert.
- Files: `.claude/skills/module-delivery/SKILL.md` (+ optional `reference/gen-mig129-template.py`)
- Expected: Anleitung, wie approvte Flags → Generator-Script → Seed-Migration (uuid5-stabil, idempotent) werden.
- Verification: Anleitung reproduziert das gen-mig128-Muster für Flags.
- Dependencies: MT-2

## Risiken / Dependencies
- R-176-1 (F-C): Sonnet setzt Flags zu aggressiv → Guardrails + Founder-Abnahme-Gate (AC-176-2/3).
- Dependency: keine (Skill-Artefakt). Blockt SLC-177 (Autoring-Run braucht den Skill).

## Worktree/Isolation
Dev-System-Skill-Authoring — Worktree optional (Single-Repo-Doku/Skill, kein Runtime-Risiko).
