#!/usr/bin/env python3
"""
Walidacja kontraktu danych analitycznych (EDCG / D-02, D-03).

- analytics-queries.ts: zakaz SELECT DISTINCT, COUNT(DISTINCT), kolumn url/payload jako Iceberg read
- wymóg approx_distinct w presetach używających unikalnych sesji (Q1, Q2, Q7)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
QUERIES_PATH = REPO_ROOT / "workers/bigquery-batch/src/analytics-queries.ts"

FORBIDDEN_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"SELECT\s+DISTINCT", re.I), "D-03: SELECT DISTINCT not supported in R2 SQL"),
    (re.compile(r"COUNT\s*\(\s*DISTINCT", re.I), "D-03: COUNT(DISTINCT) not supported; use approx_distinct"),
    (re.compile(r"json_get_str\s*\(\s*payload", re.I), "D-02: payload column not in Iceberg read model"),
    (re.compile(r"\bFROM\s+\$\{P\}[^;]*\burl\b", re.I), "D-02: use page_url not url on pixel table"),
)

# Presets that count distinct sessions must mention approx_distinct
MUST_APPROX_DISTINCT_IDS = ("Q1_CONVERSION_CHAT", "Q2_CONVERSION_PATHS", "Q7_PRODUCT_TO_PURCHASE")


def fail(msg: str) -> None:
    sys.stderr.write(f"[data-contract] {msg}\n")
    raise SystemExit(1)


def main() -> None:
    if not QUERIES_PATH.is_file():
        fail(f"Missing {QUERIES_PATH.relative_to(REPO_ROOT)}")

    text = QUERIES_PATH.read_text(encoding="utf-8")
    # SQL lives in template literals only — ignore header comments mentioning forbidden syntax.
    sql_only = "\n".join(re.findall(r"=> `([\s\S]*?)`", text))
    if not sql_only.strip():
        fail("No SQL template literals found in analytics-queries.ts")

    for rx, rule in FORBIDDEN_PATTERNS:
        if rx.search(sql_only):
            fail(f"{rule} — match in SQL preset in {QUERIES_PATH.relative_to(REPO_ROOT)}")

    for qid in MUST_APPROX_DISTINCT_IDS:
        block_match = re.search(
            rf"{re.escape(qid)}:\s*\([^)]*\)\s*=>\s*`([\s\S]*?)`",
            text,
        )
        if not block_match:
            fail(f"Could not find SQL block for {qid}")
        block = block_match.group(1)
        if "approx_distinct" not in block:
            fail(f"D-03: {qid} must use approx_distinct() for session counts")

    if "page_url" not in text:
        fail("D-02: analytics-queries should reference page_url for pixel Iceberg reads")

    print("[data-contract] OK — analytics-queries.ts matches EPIR analytics data contract (D-02, D-03).")


if __name__ == "__main__":
    main()
