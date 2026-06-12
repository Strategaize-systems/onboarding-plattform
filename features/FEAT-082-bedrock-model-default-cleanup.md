# FEAT-082 — Bedrock-Modell-Default-Cleanup (ISSUE-100)

- Status: planned
- Version: V9.5
- Created: 2026-06-12

## Purpose
Vier Files defaulten auf stale Bedrock-Modelle (Sonnet 3.5 / Haiku 3), waehrend der condensation-Core auf eu-Sonnet-4 laeuft. FEAT-082 stellt die hardcoded Defaults auf die aktuellen eu-inference-profile-IDs um (DEC-218). ENV-Override-Mechanik bleibt unveraendert.

## Why it matters
Modell-Drift bedeutet inkonsistente Output-Qualitaet im Bulk-Pfad und — bei `v8-1-augmentation` — ein latent broken Default, falls `BEDROCK_V8_1_MODEL_ID` ungesetzt ist (ISSUE-100). Die Deep-Extraction (FEAT-080/081) soll von vornherein gegen das korrekte Modell entworfen werden, deshalb Cleanup zuerst (SLC-V9.5-A).

## How it works
| File:Line | Default heute | Ziel |
|---|---|---|
| `src/lib/ai/bedrock-sonnet/email-pattern.ts:51` | `anthropic.claude-3-5-sonnet-20241022-v2:0` | `eu.anthropic.claude-sonnet-4-20250514-v1:0` |
| `src/lib/bulk-email/ai-assisted-setup.ts:24` | `anthropic.claude-3-5-sonnet-20241022-v2:0` | `eu.anthropic.claude-sonnet-4-20250514-v1:0` |
| `src/lib/llm/v8-1-augmentation/augment.ts:44-46` | `anthropic.claude-3-5-sonnet-20241022-v2:0` (latent-broken) | `eu.anthropic.claude-sonnet-4-20250514-v1:0` — priorisiert |
| `src/lib/ai/bedrock-haiku/index.ts:42` | `anthropic.claude-3-haiku-20240307-v1:0` | aktuelle eu-Haiku-Profile — exakte ID /backend |

- Sonnet-4 hat identisches Bedrock-Pricing wie Sonnet-3.5 ($3/$15) → Sonnet-Cost-Konstanten bleiben.
- Haiku-Tier-Wechsel aendert das Pricing → `bedrock-haiku` Cost-Konstanten im /backend mit-aktualisieren (R4).
- Exakte Haiku-eu-Modell-ID + Pricing verifiziert /backend gegen `claude-api`-Skill + Bedrock-eu-central-1-Verfuegbarkeit.

## In Scope
- 4 Default-Konstanten + (bei Haiku) Cost-Konstanten.
- /qa-Regression: bestehende Pattern-Extraktion + V8.1-Augmentation bleiben schema-konform.

## Out of Scope
- Aenderung der ENV-Override-Variablen-Namen.
- Modell-Wechsel ausserhalb dieser 4 Files.

## Acceptance
- SC-V9.5-6 (4 Files defaulten eu-Sonnet-4 / eu-Haiku; ENV-Overrides funktionieren weiter; kein Schema-Regression). Siehe PRD §"Success Criteria (V9.5 Gesamt)".

## Refs
- ARCHITECTURE.md §"V9.5 Architecture Addendum" §8 — DEC-218. ISSUE-100 (KNOWN_ISSUES). SLC-V9.5-A (erste Slice).
