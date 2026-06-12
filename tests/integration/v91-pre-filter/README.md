# V9.1 Pre-Filter Skeleton-Validation

**Slice:** SLC-V9.1-A (MT-1)
**DEC:** DEC-195 (Synthetic-Corpus, Skeleton-Validation, not Gate)
**Purpose:** Telemetry-Output for Bedrock-Haiku-Pre-Filter quality (Precision/Recall/F1) against the 45-email synthetic corpus.

## Run

```bash
# 1. Bootstrap Bedrock-ENVs from Coolify-App-Container (Onboarding-Plattform, 159.69.207.29)
ssh root@159.69.207.29 "docker exec \$(docker ps --format '{{.Names}}' | grep '^app-') printenv | grep -E '^(AWS_|BEDROCK_)='" > .env.local
chmod 600 .env.local

# 2. Run skeleton-validation
set -a; . ./.env.local; set +a
export RUN_V91_SKELETON_VALIDATION=true
npx vitest run tests/integration/v91-pre-filter/synthetic-corpus-validation.test.ts

# 3. PFLICHT — Delete ENV after run
rm -f .env.local
```

On Windows PowerShell, the ENV-bootstrap pattern from
`.claude/rules/coolify-test-setup.md` Section "Live-Smoke ENV-Bootstrap" still
applies — use `Set-Item Env:VAR_NAME value` after extracting via SSH.

## Cost Estimate

- 45 sequential Bedrock-Haiku-Calls (eu-central-1)
- Per call: ~$0.0002 USD (Haiku 3 input + output tokens, batch-of-1)
- **Total: ~$0.01 USD = ~0.01 EUR** (slice-spec upper-bound: 0.05 EUR)

## Telemetry Output (interpretation)

The test prints two console blocks:

1. **Per-email line** — one per corpus entry:
   ```
   [corpus_001] truth=valuable predicted=valuable (haiku=content conf=0.92) cost=$0.00021
   ```

2. **Aggregate block** at the end:
   ```
   ========== V9.1 Skeleton-Validation Telemetry ==========
     Emails:          45
     Ground-truth:    22 valuable, 23 skip
     TP / FP / FN / TN: 21 / 2 / 1 / 21
     Precision:       0.913
     Recall:          0.955
     F1:              0.933
     Total cost:      $0.0095 USD / 0.0087 EUR
     Per-email cost:  $0.00021 USD / 0.00019 EUR
   ========================================================
   ```

### Binary classification mapping

The V9 worker emits one of 6 labels (`content`, `short_reply`, `notification`,
`newsletter`, `private`, `unclear`). For this validation, those are mapped to
binary ground-truth:

- `content` -> `valuable`
- everything else -> `skip`

This matches the pre-filter's actual gating behavior: only `content` survives
into Pattern-Extraction.

### F1-Threshold

- **F1 >= 0.7**: Pre-Filter is fit-for-V9.1-purpose.
- **F1 < 0.7**: A soft-warn is printed. The test STILL PASSES — this is
  Telemetry-only, not a Gate. If F1 stays below 0.7 across multiple runs,
  carry over to V9.1.x as a prompt-tuning IMP.

## Why this is a Skeleton-Validation, not a Gate

Per DEC-195 the corpus is **synthetic** — purpose-built around expected
patterns rather than a representative real-world distribution. Treating it
as a CI Gate would either:

- Over-fit the prompt to the corpus (false signal of real-world quality), or
- Fail builds for stylistic prompt drift that does not affect production
  behavior.

Skeleton-Validation runs on-demand (founder-triggered) to detect prompt
regressions early, without blocking the CI pipeline.

## Re-Run after Prompt Tuning

When the V9 pre-filter prompt is changed (`src/lib/bulk-email/pre-filter/prompt.ts`),
re-run this validation to confirm Precision/Recall did not regress. Document
F1 deltas in `docs/SKILL_IMPROVEMENTS.md` if action is needed.
