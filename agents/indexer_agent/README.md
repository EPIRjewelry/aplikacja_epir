# Indexer Agent

This small agent runs the repository indexer to produce a local embeddings file
that ESOG and other internal tools can consult for grounding.

Usage:

```powershell
# from repo root
python agents/indexer_agent/run_agent.py
```

The agent calls `tools/index_docs.py` and writes `data/embeddings.json` by default.

If you want to push vectors to a vector DB (Qdrant) install `qdrant-client`
and run `tools/index_docs.py --backend qdrant --qdrant-url <url>`.
