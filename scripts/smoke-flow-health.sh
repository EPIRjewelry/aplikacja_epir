#!/usr/bin/env bash
# Smoke EDOG flow-health przez proxy workera czatu.
set -euo pipefail
: "${EPIR_CHAT_WORKER_ORIGIN:=https://asystent.epirbizuteria.pl}"
ORIGIN="${EPIR_CHAT_WORKER_ORIGIN%/}"
HDR=(-H "Accept: application/json")
if [[ -n "${EPIR_OPERATOR_PANEL_SECRET:-}" ]]; then
  HDR+=(-H "X-Admin-Key: ${EPIR_OPERATOR_PANEL_SECRET}")
fi
RES=$(curl -sf "${HDR[@]}" "${ORIGIN}/internal/operator-studio/api/flow-health")
echo "$RES"
VERDICT=$(echo "$RES" | sed -n 's/.*"edog_verdict"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [[ "$VERDICT" != "PASS" ]]; then
  echo "EDOG smoke FAIL: $VERDICT" >&2
  exit 1
fi
echo "EDOG smoke PASS"
