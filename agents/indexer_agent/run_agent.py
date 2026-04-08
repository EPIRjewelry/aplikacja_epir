#!/usr/bin/env python3
"""Simple agent wrapper that runs the indexer script for canonical docs.

This file is intended to be a small convenience wrapper to run the
`tools/index_docs.py` script with the canonical file list used for ESOG
grounding.
"""
import subprocess
import sys
import os
from pathlib import Path


def main():
    repo_root = Path(__file__).resolve().parents[2]
    script = repo_root / "tools" / "index_docs.py"
    if not script.exists():
        print("Index script not found:", script)
        sys.exit(1)

    cmd = [sys.executable, str(script),
           "--sources",
            "AGENTS.md",
           "EPIR_AI_ECOSYSTEM_MASTER.md",
           "EPIR_AI_BIBLE.md",
            "docs/README.md",
            "docs/EPIR_INGRESS_AND_RUNTIME.md",
            "docs/EPIR_DATA_SCHEMA_CONTRACT.md",
            "docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md",
            "docs/EPIR_BLUEPRINTS_AND_EXCEPTIONS.md",
           "--out", "data/embeddings.json"]

    print("Running indexer:", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(repo_root))


if __name__ == "__main__":
    main()
