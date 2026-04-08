#!/usr/bin/env python3
"""Index markdown docs into a simple vector store (local JSON or Qdrant).

This minimal indexer uses a deterministic pseudo-embedding when no
embedding provider is available so it works offline for a quick RAG MVP.

Usage (local):
    python tools/index_docs.py --sources AGENTS.md EPIR_AI_ECOSYSTEM_MASTER.md EPIR_AI_BIBLE.md docs/README.md docs/EPIR_INGRESS_AND_RUNTIME.md docs/EPIR_DATA_SCHEMA_CONTRACT.md docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md docs/EPIR_BLUEPRINTS_AND_EXCEPTIONS.md --out data/embeddings.json

Optional Qdrant upsert (requires qdrant-client installed):
  python tools/index_docs.py --backend qdrant --qdrant-url http://localhost:6333 --qdrant-api-key XXX

The script is intentionally dependency-light so you can run an initial
indexing without installing additional packages.
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import math
import os
import re
import sys
from pathlib import Path
from typing import List

DEFAULT_SOURCES = [
    "AGENTS.md",
    "EPIR_AI_ECOSYSTEM_MASTER.md",
    "EPIR_AI_BIBLE.md",
    "docs/README.md",
    "docs/EPIR_INGRESS_AND_RUNTIME.md",
    "docs/EPIR_DATA_SCHEMA_CONTRACT.md",
    "docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md",
    "docs/EPIR_BLUEPRINTS_AND_EXCEPTIONS.md",
]


def find_files(sources: List[str]) -> List[Path]:
    files: List[Path] = []
    for s in sources:
        p = Path(s)
        if p.is_file():
            files.append(p)
            continue
        # support directory or glob
        if p.is_dir():
            files.extend(sorted(p.rglob("*.md")))
            continue
        matches = glob.glob(s, recursive=True)
        for m in matches:
            mp = Path(m)
            if mp.is_file():
                files.append(mp)
    # unique and sorted
    seen = set()
    out = []
    for f in files:
        rp = str(f.resolve())
        if rp in seen:
            continue
        seen.add(rp)
        out.append(f)
    return out


def read_text(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except Exception:
        return p.read_text(encoding="latin-1")


def split_into_chunks(text: str, max_chars: int = 1200, overlap: int = 200) -> List[str]:
    # naive paragraph-aware chunking
    paragraphs = re.split(r"\n\s*\n", text)
    chunks: List[str] = []
    cur = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if not cur:
            cur = para
            continue
        if len(cur) + len(para) + 2 <= max_chars:
            cur = cur + "\n\n" + para
            continue
        # emit current
        chunks.append(cur)
        # if para itself is too long, split it
        if len(para) > max_chars:
            for i in range(0, len(para), max_chars - overlap):
                chunks.append(para[i : i + max_chars])
            cur = ""
        else:
            cur = para
    if cur:
        chunks.append(cur)
    return chunks


def pseudo_embedding(text: str, dim: int = 128) -> List[float]:
    """Deterministic pseudo embedding using sha256 -> floats.

    This allows offline indexing for the MVP. Vectors are normalized.
    """
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


def write_local_json(out_path: Path, items: List[dict]):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    obj = {"meta": {"count": len(items)}, "items": items}
    out_path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def upsert_qdrant(qdrant_url: str, api_key: str | None, collection: str, items: List[dict], dim: int):
    try:
        from qdrant_client import QdrantClient
        from qdrant_client.http import models as rest
    except Exception as e:
        print("qdrant-client not installed. Install it or use backend=local.")
        return
    client = QdrantClient(url=qdrant_url, api_key=api_key) if api_key else QdrantClient(url=qdrant_url)
    # create or recreate collection with given dim (safe for small demos)
    try:
        existing = client.get_collections().collections
        names = [c.name for c in existing]
    except Exception:
        names = []
    if collection not in names:
        print(f"Creating collection {collection} (dim={dim})")
        from qdrant_client.http import models as rest

        client.recreate_collection(collection_name=collection, vectors_config=rest.VectorParams(size=dim, distance=rest.Distance.COSINE))

    batch = []
    for it in items:
        batch.append(rest.PointStruct(id=it["id"], vector=it["embedding"], payload={"path": it["path"], "title": it.get("title")}))
        if len(batch) >= 64:
            client.upsert(collection_name=collection, points=batch)
            batch = []
    if batch:
        client.upsert(collection_name=collection, points=batch)
    print("Qdrant upsert done.")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="index_docs.py")
    parser.add_argument("--sources", nargs="+", default=DEFAULT_SOURCES, help="Files, globs or directories to index")
    parser.add_argument("--out", default="data/embeddings.json", help="Output JSON path for local backend")
    parser.add_argument("--max-chars", type=int, default=1200)
    parser.add_argument("--overlap", type=int, default=200)
    parser.add_argument("--dim", type=int, default=128)
    parser.add_argument("--backend", choices=["local", "qdrant"], default="local")
    parser.add_argument("--qdrant-url", default=None)
    parser.add_argument("--qdrant-api-key", default=None)
    args = parser.parse_args(argv)

    files = find_files(args.sources)
    if not files:
        print("No files found for sources:", args.sources)
        sys.exit(1)
    print(f"Indexing {len(files)} files (max_chars={args.max_chars}, overlap={args.overlap})")

    items = []
    for f in files:
        full = f.resolve()
        try:
            rel = str(full.relative_to(Path.cwd()))
        except Exception:
            rel = str(full)
        text = read_text(f)
        title_m = re.search(r"^\s*#\s+(.+)", text, flags=re.MULTILINE)
        title = title_m.group(1).strip() if title_m else f.name
        chunks = split_into_chunks(text, max_chars=args.max_chars, overlap=args.overlap)
        for idx, ch in enumerate(chunks, start=1):
            _id = f"{rel}#chunk{idx}"
            emb = pseudo_embedding(ch, dim=args.dim)
            items.append({"id": _id, "path": rel, "title": title, "chunk_index": idx, "text": ch, "embedding": emb})

    outp = Path(args.out)
    if args.backend == "local":
        write_local_json(outp, items)
        print(f"Wrote {len(items)} vectors to {outp}")
    else:
        if not args.qdrant_url:
            print("--qdrant-url is required for qdrant backend")
            sys.exit(1)
        upsert_qdrant(args.qdrant_url, args.qdrant_api_key, collection="epir_docs", items=items, dim=args.dim)


if __name__ == "__main__":
    main()
