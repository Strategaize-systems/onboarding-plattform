#!/bin/bash
# V9.1 SLC-V9.1-A MT-5 — ZIP-Deploy fuer Lambda `forward-ses-to-op-webhook`.
#
# Spec: slices/SLC-V9.1-A-inbound-foundation-validation.md (MT-5)
# Arch: docs/ARCHITECTURE.md V9.1 Step 5 (Lambda-Deployment).
#
# Installiert Prod-Deps, zippt index.mjs + node_modules + package.json und ruft
# `aws lambda update-function-code`. Voraussetzung: AWS-CLI authentifiziert mit
# einem Profil, das die Function aktualisieren darf, und die Function existiert
# bereits (Founder-Setup ARCHITECTURE.md Step 5).
#
# Usage:  bash scripts/deploy-lambda.sh
# Env:    AWS_PROFILE (optional), FUNCTION_NAME (override), AWS_REGION (override)

set -euo pipefail

FUNCTION_NAME="${FUNCTION_NAME:-forward-ses-to-op-webhook}"
REGION="${AWS_REGION:-eu-west-1}"
LAMBDA_DIR="infra/lambda/forward-ses-to-op-webhook"
ZIP_FILE="forward-ses-to-op-webhook.zip"

if ! command -v aws >/dev/null 2>&1; then
  echo "[deploy-lambda] ERROR: aws CLI not found in PATH" >&2
  exit 1
fi

if [ ! -d "$LAMBDA_DIR" ]; then
  echo "[deploy-lambda] ERROR: $LAMBDA_DIR not found (run from repo root)" >&2
  exit 1
fi

echo "[deploy-lambda] Installing production dependencies..."
( cd "$LAMBDA_DIR" && npm install --omit=dev --no-audit --no-fund )

echo "[deploy-lambda] Building $ZIP_FILE..."
rm -f "$LAMBDA_DIR/$ZIP_FILE"
( cd "$LAMBDA_DIR" && zip -qr "$ZIP_FILE" index.mjs package.json node_modules )

echo "[deploy-lambda] Updating function '$FUNCTION_NAME' in $REGION..."
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$LAMBDA_DIR/$ZIP_FILE" \
  --region "$REGION"

echo "[deploy-lambda] Cleaning up..."
rm -f "$LAMBDA_DIR/$ZIP_FILE"

echo "[deploy-lambda] Done. Verify in AWS Console -> Lambda -> $FUNCTION_NAME."
