"""EFA (EPIR Fix Agent) – heuristic patch generator.

Generates suggested patches based on simple heuristics. Runs locally without
external AI services.
"""

import json
import sys
from pathlib import Path
from typing import Dict

PROMPT_FILE = Path(__file__).parent / "prompt.md"


def load_prompt() -> str:
    return PROMPT_FILE.read_text(encoding="utf-8")


def generate_patch(issue_description: str) -> Dict:
    """Heuristic-based patch generator."""
    if "default_start_closed = false" in issue_description or '"start_closed": false' in issue_description:
        path = Path(__file__).resolve().parents[2] / "extensions/asystent-klienta/blocks/assistant-embed.liquid"
        if path.exists():
            old = path.read_text(encoding="utf-8")
            new = old.replace("default_start_closed = false", "default_start_closed = true")
            new = new.replace('"start_closed": false', '"start_closed": true')
            return {
                "files_changed": [str(path)],
                "patch": "(inline replacement) set default_start_closed = true",
                "explanation": "Set widget default to launcher mode",
                "verify": ["Open storefront and verify launcher visible, panel closed"],
            }

    return {
        "files_changed": [],
        "patch": "",
        "explanation": "No automatic patch generated for this issue. Provide a more specific instruction.",
        "verify": [],
    }


def main():
    text = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else sys.stdin.read()
    if not text:
        print("No input provided. Example: python agent.py \"Fix launcher mode\"")
        sys.exit(1)

    out = generate_patch(text)
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
