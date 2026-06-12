# SLC-V9.5-C — Bounded Critic / Quality-Gate

- Feature: FEAT-081
- Version: V9.5
- Status: planned
- Priority: High
- Backlog: BL-160
- Parallel-Group: **Sequential-Chain S1** (nach SLC-V9.5-B)
- MIG: keine (nutzt `email_synthesized_unit` aus MIG-111; `ai_cost_ledger.role` ist freitext, kein CHECK-Add noetig — im /backend verifizieren)
- Created: 2026-06-12

## Goal
Ein **bounded** Critic-Pass (genau 1 Durchlauf, DEC-216) als **zweite LLM-Phase im selben `email_bulk_synthesis`-Worker**, nach der Synthese und VOR dem Persist. Ein Sonnet-Call ueber alle Draft-Units → Verdict `KEEP`/`REJECT` + Begruendung je Unit. Worker-Filter: Unit ueberlebt nur bei `verdict=KEEP` UND `evidence_count >= 2`. Kein Konvergenz-Loop. Additiv — fuellt den in SLC-V9.5-B vorbereiteten Filter-Hook (`selectSurvivingUnits(draftUnits, criticVerdicts)`).

## In Scope
- Critic-Pure-Function `bedrock-sonnet/email-critic.ts` + `-prompt.ts` + zod-Verdict-Schema.
- Worker-Integration: Critic-Call zwischen Synthese-Draft-Assembly und Persist; Filter-Erweiterung auf `KEEP && evidence_count>=2`; Reject-Logging (Reduktions-Statistik).
- Cost: Critic-Call zaehlt in `synthesis_cost_eur` + Live-Cap; `ai_cost_ledger` role `email_bulk_critic`.

## Out of Scope
- Mehrfach-Pass / Konvergenz-Loop (PARKED, PRD §V9.5 Out of Scope).
- Auto-Curation / High-Confidence-Auto-Import (GF-Curation bleibt Pflicht).
- Aenderung der Synthese-Phase oder des Schemas (nur additive Critic-Phase).

## Acceptance
- **AC-C-1 (SC-V9.5-3):** Bounded Critic flaggt/verwirft Low-Quality-Units (trivial / nicht belegt / redundant / evidence_count<2) bei harter Pass-Obergrenze (1 Critic-Call/Run). Vorher/Nachher-Fixture mit erwarteter Reduktions-Quote (R-C-1).
- **AC-C-2 (Filter-Korrektheit):** Eine Unit ueberlebt gdw. `verdict=KEEP` UND `evidence_count >= 2`. REJECT-Units + evidence<2-Units werden verworfen + geloggt.
- **AC-C-3 (SC-V9.5-4 / Cost):** Critic-Call Bedrock eu-central-1; zaehlt in `synthesis_cost_eur`; faellt unter denselben Live-Total-Cap (DEC-217); `ai_cost_ledger` role `email_bulk_critic`, job_id = Synthese-Job-ID.
- **AC-C-4 (Bounded):** Genau 1 Critic-Call pro Run — kein Loop, keine Iteration. Bei Cap-Hit waehrend/vor Critic: `status='failed'` (kein Persist halb-kritisierter Units).
- **AC-C-5 (Quality-Gates):** tsc=0, ESLint=0, Vitest-Vollsuite ohne Regression.

## Decisions referenced
- DEC-216 (1 Synthese + 1 Critic, bounded, kein Konvergenz-Loop; accept `KEEP && evidence_count>=2`).

## Micro-Tasks

#### MT-1: Critic-Pure-Function + Prompt + Schema
- Goal: `email-critic.ts` analog `email-synthesis.ts`-Struktur.
- Files: `src/lib/ai/bedrock-sonnet/email-critic.ts`, `src/lib/ai/bedrock-sonnet/email-critic-prompt.ts`, `src/lib/ai/bedrock-sonnet/types.ts` (`CriticVerdictsSchema`), `src/lib/ai/bedrock-sonnet/__tests__/email-critic.test.ts`.
- Expected behavior: `critiqueUnits(draftUnits[], options?)` → `{ verdicts: [{ unit_ref: <index>, verdict: "KEEP"|"REJECT", reason }] }`. Prompt = ARCH §7 (REJECT bei trivial / Halluzination / redundant / evidence_count<2). Region eu-central-1; Modell eu-Sonnet-4 (ENV-Override unveraendert). SonnetSchemaError-Reuse.
- Verification: TDD — injizierter Caller liefert Verdict-Fixture; Schema-Parse RED→GREEN; Verdict-Index-Mapping-Test (unit_ref → draftUnit korrekt).
- Dependencies: SLC-V9.5-B done.

#### MT-2: Worker-Integration (Critic-Phase + Filter)
- Goal: Critic in `handle-synthesis-job.ts` zwischen Draft-Assembly und Persist einhaengen; `selectSurvivingUnits` um Verdicts erweitern.
- Files: `src/workers/bulk-email/handle-synthesis-job.ts`, `src/workers/bulk-email/__tests__/handle-synthesis-job.test.ts`.
- Expected behavior:
  1. Nach der Synthese-Draft-Assembly (alle Sections): EIN `critiqueUnits(allDraftUnits)`-Call.
  2. Cost: `synthesis_cost_eur += criticCost` (UPDATE) + `ai_cost_ledger` (role `email_bulk_critic`) + Live-Cap-Check → bei Hit `status='failed'` + return (kein Persist).
  3. `selectSurvivingUnits(draftUnits, verdicts)` = `draftUnits.filter(u => verdictFor(u)==='KEEP' && u.evidence_count >= 2)`. Reject-Reasons loggen (Reduktions-Statistik via captureInfo).
  4. Persist nur ueberlebende Units (unveraendert von SLC-V9.5-B, nur die Filter-Quelle aendert sich).
- Verification: TDD — Fixture: 4 Draft-Units, Critic REJECTs 1, 1 hat evidence_count=1 → 2 ueberleben; Cap-Hit-vor-Persist → status=failed, 0 Units; Critic-Call-Count = 1 (bounded).
- Dependencies: MT-1.

#### MT-3: Slice-/qa
- Goal: AC-C-1..5 verifizieren.
- Files: keine neue (QA; Reuse der Synthese-Fixtures + Critic-Vorher/Nachher).
- Verification: tsc=0, ESLint=0, Vollsuite kein Regress; Vorher/Nachher-Reduktions-Quote dokumentiert (AC-C-1); Filter-Korrektheit (AC-C-2); 1-Call-Bounded-Assertion (AC-C-4); ai_cost_ledger role `email_bulk_critic` verifiziert.
- Dependencies: MT-1, MT-2.

## Risks
- **R-C-1 (Over-Reject vs Over-Keep):** Critic kann zu aggressiv (verliert valide Units) oder zu lasch sein. Mitigation: konservativer Prompt (REJECT nur bei klarem Trivial/Halluzination/Redundanz), `evidence_count>=2` als harte zusaetzliche Schwelle, /qa Vorher/Nachher-Fixture mit erwarteter Quote.
- **R-C-2 (Persist-Atomicity bei Cap-Hit):** Cap-Hit zwischen Critic und Persist darf keine halb-kritisierten Units persistieren. MT-2: Cap-Check VOR Persist → `status='failed'`, kein Persist (AC-C-4).
- **R-C-3 (role-CHECK):** Falls `ai_cost_ledger.role` einen CHECK-Constraint hat, braucht `email_bulk_critic` (und `email_bulk_synthesis` aus B) ggf. eine CHECK-Erweiterung. Im /backend gegen Live-Schema pruefen — die Extraktor-role `email_bulk_pattern_extraction` legt nahe, dass role freitext ist, aber verifizieren (sonst MIG-Add in B nachziehen).

## Notes
- Diese Slice re-touched `handle-synthesis-job.ts` (additiv, am vorbereiteten Filter-Hook) — kein Rewrite. Eigenes /qa, weil Critic eine distinkte Quality-Stage mit eigener Vorher/Nachher-Fixture ist (OQ-2-Entscheidung: B+C NICHT gemergt).

## Refs
- ARCHITECTURE.md §"V9.5 Architecture Addendum" §7 (Critic-Prompt), DEC-216. FEAT-081. BL-160. Abhaengig von SLC-V9.5-B (Synthese-Output + Filter-Hook).
