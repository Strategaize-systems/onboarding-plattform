#!/bin/bash
# Jibri Finalize Script — called by Jibri after each recording completes.
# Mounted into jibri container at /scripts/finalize.sh
#
# $1 = Recording directory (Jibri convention: /recordings/{room-name})
# Finds the MP4, extracts room name, POSTs webhook to app.
#
# SLC-030 MT-1 (FEAT-020)

RECORDING_DIR="$1"

if [ -z "$RECORDING_DIR" ]; then
  echo "[jibri-finalize] ERROR: No recording directory provided" >&2
  exit 1
fi

# Find the MP4 file (Jibri creates one MP4 per recording)
MP4_FILE=$(find "$RECORDING_DIR" -name "*.mp4" -type f | head -1)

if [ -z "$MP4_FILE" ]; then
  echo "[jibri-finalize] WARNING: No MP4 found in $RECORDING_DIR" >&2
  exit 0
fi

echo "[jibri-finalize] Found recording: $MP4_FILE"

# Extract room name from directory name (Jibri convention)
ROOM_NAME=$(basename "$RECORDING_DIR")

# Webhook URL — app container is reachable as 'app' on the Docker network
WEBHOOK_URL="http://app:3000/api/dialogue/recording-ready"

# POST to webhook with room name and file path
HTTP_STATUS=$(curl -s -o /tmp/jibri-webhook-response.txt -w "%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Authorization: Bearer ${RECORDING_WEBHOOK_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{\"room_name\": \"$ROOM_NAME\", \"file_path\": \"$MP4_FILE\"}")

if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ]; then
  echo "[jibri-finalize] Webhook success (HTTP $HTTP_STATUS): room=$ROOM_NAME"
else
  echo "[jibri-finalize] Webhook failed (HTTP $HTTP_STATUS): room=$ROOM_NAME" >&2
  cat /tmp/jibri-webhook-response.txt >&2
  exit 1
fi
