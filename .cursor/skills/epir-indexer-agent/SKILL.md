---
name: epir-indexer-agent
description: Indeksowanie dokumentacji repo (tools/index_docs.py) pod grounding ESOG i narzędzi wewnętrznych. Używać gdy prosi o embeddings lokalne, index_docs, indexer_agent, Qdrant z docs.
---

# EPIR Indexer Agent — Skill

## Rola

Przygotowanie **lokalnego indeksu** dokumentacji z tego repozytorium (nie zastępuje kanonu w `docs/README.md`).

## Narzędzia

- `tools/index_docs.py` — domyślnie zapis `data/embeddings.json` (katalog `data/` w `.gitignore`)
- Opcjonalnie Qdrant: `--backend qdrant --qdrant-url <url>` (wymaga `qdrant-client`)

## Uruchomienie (CLI)

Z roota repo:

```bash
python agents/indexer_agent/run_agent.py
# lub bezpośrednio:
python tools/index_docs.py
```

## Granice

- **Nie** traktuj embeddings jako źródła prawdy nad `EPIR_AI_ECOSYSTEM_MASTER.md` / `EPIR_AI_BIBLE.md`.
- **Nie** commituj `data/embeddings.json` ani eksportów sesji.
- Po zmianie kanonu — przeindeksuj.

## Powiązane agenty

- **ESOG** (`epir-esog-agent`) — konsument grounding do recenzji
- Implementacja CLI: `agents/indexer_agent/` (tylko runner, definicja tutaj)
