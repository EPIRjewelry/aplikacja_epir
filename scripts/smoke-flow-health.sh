#!/usr/bin/env bash
# Smoke GET /internal/flow-health (EDOG) na epir-bigquery-batch.
set -euo pipefail
: "${DATA_GUARDIAN_OPS_KEY:?set DATA_GUARDIAN_OPS_KEY}"
: "${EPIR_BATCH_WORKER_ORIGIN:?set EPIR_BATCH_WORKER_ORIGIN}"
ORIGIN="${EPIR_BATCH_WORKER_ORIGIN%/}"
RES=$(curl -sf -H "Authorization: Bearer ${DATA_GUARDIAN_OPS_KEY}" "${ORIGIN}/internal/flow-health")
echo "$RES"
echo "$RES" | grep -q '"edog_verdict":"PASS"' || { echo "EDOG smoke FAIL" >&2; exit 1; }
echo "EDOG smoke PASS"
