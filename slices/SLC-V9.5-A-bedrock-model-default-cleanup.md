# SLC-V9.5-A — Bedrock-Modell-Default-Cleanup (eu-Sonnet-4 / eu-Haiku)

- Feature: FEAT-082 (ISSUE-100)
- Version: V9.5
- Status: planned
- Priority: Medium
- Backlog: BL-161
- Parallel-Group: **Sequential-Chain S1** (Cumulative-Single-Branch `v9-5-bulk-deep-extraction`, erste Slice)
- MIG: keine
- Created: 2026-06-12

## Goal
Vier Files defaulten auf stale Bedrock-Modelle (Sonnet 3.5 / Haiku 3), waehrend der condensation-Core auf `eu.anthropic.claude-sonnet-4-20250514-v1:0` laeuft. Diese Slice stellt die hardcoded Defaults auf die aktuellen eu-inference-profile-IDs um (DEC-218). ENV-Override-Mechanik bleibt unveraendert. **Zuerst**, damit die Synthese-/Critic-Stage (SLC-V9.5-B/C) von vornherein gegen das korrekte Modell entworfen wird.

## In Scope
- 4 Default-Modell-Konstanten (Tabelle unten).
- `bedrock-haiku` Cost-Konstanten (Tier-Wechsel aendert Pricing — R-A-1).
- Regression-Verifikation: bestehende Pattern-Extraktion + V8.1-Augmentation bleiben schema-konform.

## Out of Scope
- Aenderung der ENV-Override-Variablen-Namen (`BEDROCK_V9_SONNET_MODEL_ID`, `BEDROCK_V8_1_MODEL_ID`, etc.).
- Modell-Wechsel ausserhalb dieser 4 Files.

## Acceptance
- **AC-A-1** Alle 4 Files defaulten auf eu-inference-profile-IDs, wenn die jeweilige ENV ungesetzt ist.
- **AC-A-2** ENV-Override greift weiterhin (gesetzte ENV gewinnt ueber Default).
- **AC-A-3** Kein Schema-Regression: `extractPatternFromThread` + V8.1-Augmentation produzieren weiter schema-konforme Outputs (Pure-Function-Tests gruen).
- **AC-A-4** `bedrock-haiku` Cost-Konstanten entsprechen dem neuen Haiku-Tier-Pricing (gegen `claude-api`-Skill verifiziert).
- **AC-A-5** Quality-Gates: tsc=0, ESLint=0, Vitest-Vollsuite ohne Regression (Baseline = aktueller main-Stand).

## Decisions referenced
- DEC-218 (4-File-Modell-Cleanup, ENV-Override unveraendert).

## Micro-Tasks

#### MT-0: Worktree-Setup (Pre-Slice, einmalig fuer V9.5)
- Goal: Cumulative-Single-Branch-Worktree `v9-5-bulk-deep-extraction` anlegen mit echtem `npm install`.
- Files: keine Code-Files (Worktree-Operation).
- Expected: Worktree `v9-5-bulk-deep-extraction` von aktuellem `main` (HEAD inkl. der lokal-pending V9.5-Doku-Commits 448f7ff/b3e7425/4128918), echtes `npm install` (KEIN node_modules-Symlink — feedback-worktree-npm-install-not-symlink BLOCKING).
- Verification: `git worktree list` zeigt den neuen Worktree; `npm run -s tsc --noEmit` laeuft; `node_modules/` real vorhanden.
- Dependencies: none.

#### MT-1: bedrock-sonnet email-pattern Default → eu-Sonnet-4
- Goal: `DEFAULT_SONNET_MODEL_ID` auf `eu.anthropic.claude-sonnet-4-20250514-v1:0` setzen.
- Files: `src/lib/ai/bedrock-sonnet/email-pattern.ts` (Z.51), `src/lib/ai/bedrock-sonnet/__tests__/*` (neuer/erweiterter Default-Resolve-Test).
- Expected: `resolveModelId()` liefert bei ungesetztem `BEDROCK_V9_SONNET_MODEL_ID` die eu-Sonnet-4-ID. Pricing-Kommentar (Z.42-45) bleibt korrekt — Sonnet-4 = Sonnet-3.5 Bedrock-Pricing ($3/$15), Cost-Konstanten **unveraendert**.
- Verification: TDD — Test `default model id is eu-Sonnet-4 when ENV unset` RED→GREEN; ENV-Override-Test bleibt gruen.
- Dependencies: MT-0.

#### MT-2: ai-assisted-setup Default → eu-Sonnet-4
- Goal: stale Sonnet-3.5-Default auf eu-Sonnet-4 umstellen.
- Files: `src/lib/bulk-email/ai-assisted-setup.ts` (Z.24).
- Expected: Default-Konstante = eu-Sonnet-4; ENV-Override unveraendert.
- Verification: bestehende ai-assisted-setup-Tests gruen; grep bestaetigt kein `claude-3-5-sonnet` mehr im File.
- Dependencies: MT-0.

#### MT-3: v8-1-augmentation Default → eu-Sonnet-4 (priorisiert, latent-broken)
- Goal: latent-broken Default (greift wenn `BEDROCK_V8_1_MODEL_ID` ungesetzt) auf eu-Sonnet-4 korrigieren.
- Files: `src/lib/llm/v8-1-augmentation/augment.ts` (Z.44-46).
- Expected: Default = eu-Sonnet-4; V8.1-Augmentation produziert weiter schema-konforme Outputs.
- Verification: V8.1-Augmentation-Tests gruen (Schema-Regression-Check, AC-A-3).
- Dependencies: MT-0.

#### MT-4: bedrock-haiku Default + Cost-Konstanten → eu-Haiku
- Goal: Haiku-3-Default auf aktuelles eu-Haiku-Inference-Profile umstellen + Cost-Konstanten anpassen.
- Files: `src/lib/ai/bedrock-haiku/index.ts` (Z.42 + Pricing-Konstanten).
- Expected: Default = aktuelle eu-Haiku-Profile-ID; `COST_PER_*_TOKEN`-Konstanten = neues Haiku-Tier-Pricing. **Exakte Modell-ID + Pricing gegen `claude-api`-Skill + Bedrock-eu-central-1-Verfuegbarkeit verifizieren** (R-A-1).
- Verification: bedrock-haiku-Tests gruen; Cost-Berechnung gegen bekannte Token-Counts plausibel; grep bestaetigt kein `claude-3-haiku` mehr.
- Dependencies: MT-0.

#### MT-5: Slice-/qa
- Goal: AC-A-1..5 verifizieren.
- Files: keine (QA).
- Verification: tsc=0, ESLint=0, Vitest-Vollsuite kein Regress; grep `claude-3-5-sonnet|claude-3-haiku` in den 4 Files = 0 Treffer.
- Dependencies: MT-1..MT-4.

## Risks
- **R-A-1 (Haiku-Tier-Pricing):** Haiku-Tier-Wechsel (Haiku 3 → aktuelles eu-Haiku) aendert das Pricing. Cost-Konstanten muessen mit-aktualisiert werden, sonst werden Pre-Filter-Kosten falsch abgerechnet (Cost-Cap-Drift). Exakte ID + Pricing im /backend gegen `claude-api`-Skill verifizieren — NICHT aus dem Gedaechtnis.
- **R-A-2 (Schema-Regression):** Modell-Wechsel kann Output-Form leicht aendern. AC-A-3 deckt das via Pure-Function-Schema-Tests ab. Bei Drift: ENV-Override ist das Sicherheitsnetz.

## Notes
- Sonnet-4 = Sonnet-3.5 Bedrock-Pricing → die Sonnet-Cost-Konstanten (email-pattern.ts Z.44-45) bleiben unveraendert. Nur Haiku-Tier-Wechsel beruehrt Pricing.
- Keine Migration, kein DB-Touch, keine RLS-Aenderung — reiner Code-Default-Cleanup.

## Refs
- ARCHITECTURE.md §"V9.5 Architecture Addendum" §8 (Modell-Cleanup-Tabelle). FEAT-082. ISSUE-100 (KNOWN_ISSUES). DEC-218.
