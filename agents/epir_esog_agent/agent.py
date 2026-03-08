"""ESOG agent – lightweight evaluator for EPIR orthodoxy checks.

Runs locally without external AI services. Use for CI and local smoke tests.
"""

import json
import sys
from pathlib import Path
from typing import Dict

PROMPT_FILE = Path(__file__).parent / "prompt.md"


def load_prompt() -> str:
    return PROMPT_FILE.read_text(encoding="utf-8")


def evaluate(target_description: str) -> Dict:
    """Deterministic evaluator for ESOG compliance."""
    prompt = load_prompt()
    lowered = target_description.lower()
    issues = []
    verdict = "Compliant"

    if any(k in lowered for k in ("admin", "secret", "token")):
        verdict = "Non-compliant"
        issues.append({
            "description": "Found potential secret/admin token leaked in code or config",
            "rule_reference": "3.2 Secrets & security",
            "priority": "MUST",
            "suggested_next_step": "Move secret to worker env, rotate keys, remove from client bundle and repo history",
        })

    if "storefrontid" in lowered or "channel" in lowered:
        if "storefrontid" not in target_description or "channel" not in target_description:
            verdict = "Partially"
            issues.append({
                "description": "Missing storefrontId or channel in chat requests",
                "rule_reference": "3.3 MCP context",
                "priority": "MUST",
                "suggested_next_step": "Ensure POST payload to MCP includes storefrontId and channel",
            })

    summary = "No obvious orthodoxy violations detected." if not issues else "Found issues requiring attention."
    return {
        "verdict": verdict,
        "issues": issues,
        "summary": summary,
        "prompt_used": prompt[:800],
    }


def main():
    if len(sys.argv) > 1:
        target = " ".join(sys.argv[1:])
    else:
        target = sys.stdin.read() if not sys.stdin.isatty() else ""
        if not target:
            print("No input provided. Example: python agent.py \"Check file: workers/chat/src/index.ts\"")
            sys.exit(1)

    out = evaluate(target)
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
