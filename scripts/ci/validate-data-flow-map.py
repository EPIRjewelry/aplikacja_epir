#!/usr/bin/env python3
"""
Walidacja artefaktów EDOG (krok 7) — statyczna, bez live D1.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def fail(msg: str) -> None:
    sys.stderr.write(f"[data-flow-map] {msg}\n")
    sys.exit(1)


def main() -> None:
    required = [
        ROOT / "docs" / "EPIR_DATA_FLOW_MAP.md",
        ROOT / "docs" / "merge-gates" / "EDOG_IMPLEMENTATION_STEPS.md",
        ROOT / ".cursor" / "skills" / "epir-edog-agent" / "SKILL.md",
        ROOT / "workers" / "bigquery-batch" / "src" / "edog-flow-health.ts",
        ROOT / "workers" / "bigquery-batch" / "src" / "edog-flow-health-runner.ts",
        ROOT / "mcp-servers" / "epir-data-ops" / "package.json",
        ROOT / ".cursor" / "mcp-data-ops.example.json",
    ]
    for path in required:
        if not path.is_file():
            fail(f"Missing required file: {path.relative_to(ROOT)}")

    index_ts = (ROOT / "workers" / "bigquery-batch" / "src" / "index.ts").read_text(encoding="utf-8")
    if "/internal/flow-health" not in index_ts:
        fail("bigquery-batch index.ts must expose GET /internal/flow-health")
    if "buildFlowHealthReport" not in index_ts:
        fail("bigquery-batch index.ts must call buildFlowHealthReport")
    if "computeEdogVerdict" not in (
        ROOT / "workers" / "bigquery-batch" / "src" / "edog-flow-health.ts"
    ).read_text(encoding="utf-8"):
        fail("edog-flow-health.ts must export computeEdogVerdict")

    flow_map = (ROOT / "docs" / "EPIR_DATA_FLOW_MAP.md").read_text(encoding="utf-8")
    for needle in ("jewelry-analytics-db", "epir-bigquery-batch", "/internal/flow-health"):
        if needle not in flow_map:
            fail(f"EPIR_DATA_FLOW_MAP.md missing: {needle}")

    chat_index = (ROOT / "workers" / "chat" / "src" / "index.ts").read_text(encoding="utf-8")
    if "resolveOperatorPromptAddons" not in chat_index:
        fail("chat index must wire operator prompt addons")
    if not (ROOT / "workers" / "chat" / "src" / "edog-gate.ts").is_file():
        fail("missing workers/chat/src/edog-gate.ts")
    if "operator-profile" not in chat_index:
        fail("chat index must expose operator-profile API")

    if not (ROOT / "workers" / "chat" / "migrations" / "013_operator_copilot.sql").is_file():
        fail("missing 013_operator_copilot.sql migration")

    if not (ROOT / ".cursor" / "mcp-epir.example.json").is_file():
        fail("missing .cursor/mcp-epir.example.json")

    print("[data-flow-map] OK — EDOG artefacts present (static).")


if __name__ == "__main__":
    main()
