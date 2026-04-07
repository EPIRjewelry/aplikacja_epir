"""ESOG agent – lightweight evaluator for EPIR orthodoxy checks.

Runs locally without external AI services. Use for CI and local smoke tests.
This version can optionally consult a local vector store (`data/embeddings.json`) to
provide contextual evidence for decisions (RAG-style). The indexer created such
file using `tools/index_docs.py` and uses a deterministic pseudo-embedding so the
retriever here must use the same function for compatibility.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Dict, List, Any

PROMPT_FILE = Path(__file__).parent / "prompt.md"
DEFAULT_EMBED_PATH = Path(__file__).resolve().parents[2] / "data" / "embeddings.json"


def load_prompt() -> str:
    return PROMPT_FILE.read_text(encoding="utf-8")


def pseudo_embedding(text: str, dim: int = 128) -> List[float]:
    """Deterministic pseudo embedding compatible with tools/index_docs.py"""
    h = hashlib.sha256(text.encode("utf-8")).digest()
    needed = dim * 4
    rep = (h * ((needed // len(h)) + 1))[:needed]
    vec: List[float] = []
    for i in range(0, needed, 4):
        v = int.from_bytes(rep[i : i + 4], "big", signed=False)
        vec.append((v / 0xFFFFFFFF) * 2 - 1)
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return [0.0] * dim
    return [x / norm for x in vec]


def load_vector_store(path: Path = DEFAULT_EMBED_PATH) -> List[dict]:
    if not path.exists():
        return []
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
        return obj.get("items", [])
    except Exception:
        return []


def cosine_similarity(a: List[float], b: List[float]) -> float:
    # vectors are normalized by the indexer; dot product == cosine
    return sum(x * y for x, y in zip(a, b))


def retrieve(query: str, topk: int = 3, dim: int = 128, store_path: Path = DEFAULT_EMBED_PATH) -> List[Dict[str, Any]]:
    items = load_vector_store(store_path)
    if not items:
        return []
    qvec = pseudo_embedding(query, dim=dim)
    scored = []
    for it in items:
        emb = it.get("embedding")
        if not emb:
            continue
        try:
            score = cosine_similarity(qvec, emb)
        except Exception:
            continue
        scored.append({"id": it.get("id"), "path": it.get("path"), "title": it.get("title"), "text": it.get("text"), "score": score})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:topk]


def evaluate(target_description: str, use_retrieval: bool = True, topk: int = 3) -> Dict:
    """Deterministic evaluator for ESOG compliance, optionally augmented with local retrieval."""
    prompt = load_prompt()
    lowered = target_description.lower()
    issues = []
    verdict = "Compliant"

    # Basic rule checks
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

    retrieved = []
    retrieval_used = False
    # Retrieval: only if requested and local store exists
    if use_retrieval:
        retrieved = retrieve(target_description, topk=topk)
        retrieval_used = len(retrieved) > 0
        # If retrieval finds strong evidence of a secret or policy mention, add an issue
        for r in retrieved:
            txt = (r.get("text") or "").lower()
            if any(k in txt for k in ("admin", "secret", "token")):
                verdict = "Non-compliant"
                issues.append({
                    "description": f"Retrieved evidence suggests secret-like content in {r.get('id')}",
                    "rule_reference": "3.2 Secrets & security",
                    "priority": "MUST",
                    "suggested_next_step": "Inspect and remove secrets from source, rotate keys",
                })

    summary = "No obvious orthodoxy violations detected." if not issues else "Found issues requiring attention."
    return {
        "verdict": verdict,
        "issues": issues,
        "summary": summary,
        "prompt_used": prompt[:800],
        "retrieval": {
            "used": retrieval_used,
            "top_k": topk,
            "results": retrieved,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="ESOG agent (local) - optionally uses local vector store for retrieval")
    parser.add_argument("query", nargs="*", help="Text to evaluate; if omitted reads STDIN")
    parser.add_argument("--no-retrieval", action="store_true", help="Disable local retrieval from data/embeddings.json")
    parser.add_argument("--topk", type=int, default=3, help="Number of retrieved chunks to return")
    args = parser.parse_args()

    if args.query:
        target = " ".join(args.query)
    else:
        target = sys.stdin.read() if not sys.stdin.isatty() else ""
        if not target:
            print("No input provided. Example: python agent.py \"Check file: workers/chat/src/index.ts\"")
            sys.exit(1)

    out = evaluate(target, use_retrieval=not args.no_retrieval, topk=args.topk)
    print(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
