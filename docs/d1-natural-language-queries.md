# Natural Language Queries via `query_d1_data`

## What it does

`query_d1_data` lets you ask questions about your analytics data using plain English or Polish. No SQL, no Iceberg, no HTTP roundtrips — it queries your D1 databases directly through Workers bindings.

The tool interprets your natural language question, picks the right table (`pixel_events` or `messages`), generates the appropriate SQL, executes it, and returns formatted results.

## Quick start

Just ask in the chat:

| English | Polish | What it queries |
|---|---|---|
| What products are people viewing? | Jakie produkty oglądają ludzie? | `pixel_events` — view events |
| Show me recent cart activity | Pokaż aktywność koszyka | `pixel_events` — cart events |
| Who is talking to Gemma? | Kto rozmawia z Gammą? | `messages` — user messages |
| Show recent conversations | Pokaż najnowsze rozmowy | `messages` — recent chats |
| What are users purchasing? | Co użytkownicy kupują? | `pixel_events` — purchase events |
| Cross-reference chats with product views | Połącz rozmowy z wyświetleniami produktów | Both tables — cross-reference |

## Tables and data

Two D1 databases are queried:

**`pixel_events`** (D1 binding `DB`):
- `session_id` — visitor session identifier
- `event_type` — `view`, `view_product`, `add_to_cart`, `remove_from_cart`, `view_cart`, `purchase`, `checkout`, `begin_checkout`
- `page_url` — page where the event occurred
- `created_at` — timestamp (ms)
- `product_id` / `product_title` — product details (when applicable)

**`messages`** (D1 binding `DB_CHATBOT`):
- `session_id` — chat session identifier
- `role` — `user`, `assistant`, `tool`
- `content` — message text
- `timestamp` — timestamp (ms)
- `storefront_id` — which storefront (kazka, zareczyny)
- `channel` — communication channel

## How to use from chat

The tool is invoked automatically when your question matches known patterns. You can also be explicit:

```
query_d1_data: show me what products people are viewing, limit 50
```

Or with a specific table:

```
query_d1_data: table=messages, question=recent user questions
```

## Intent detection

The tool recognizes these intent keywords:

| Keywords | Target table | Query type |
|---|---|---|
| `pixel`, `event`, `product`, `view`, `page`, `cart`, `purchase` | `pixel_events` | Product/cart/purchase events |
| `message`, `chat`, `rozmow`, `gemma`, `klient`, `pytanie`, `odpowiedź`, `konwersacja` | `messages` | Chat conversations |
| `who`, `kto`, `talking`, `mówi`, `pisze` | `messages` | User messages only |
| Both sets combined | `both` | Cross-reference |
| `recent`, `ostatni`, `najnowszy` | `both` | Recent activity from both |

## D1 vs Iceberg (Q1–Q10)

| Aspect | `query_d1_data` (D1) | `run_analytics_query` (Iceberg/R2 SQL) |
|---|---|---|
| **Data source** | Raw D1 tables | Iceberg tables in R2 (warehouse) |
| **Latency** | Real-time (ms) | Batch-processed (nightly) |
| **Access** | Workers bindings, no HTTP | RPC to `bigquery-batch` worker |
| **Query format** | Natural language | Whitelisted query IDs (Q1–Q10) |
| **Use case** | Quick exploration, debugging | Structured analytics, cross-session aggregation |
| **Authentication** | None (internal binding) | Bearer token RPC |

Use `query_d1_data` for fast, ad-hoc questions about what's happening right now. Use `run_analytics_query` (Q1–Q10) for structured warehouse analytics on batch-processed data.

## Troubleshooting

**No results returned**
- Check if the D1 database bindings (`DB`, `DB_CHATBOT`) are attached to the worker
- The default limit is 20 rows — increase with `limit` parameter if needed
- The intent detection may have routed to the wrong table — specify `table` explicitly

**"D1 database binding is not available"**
- The worker doesn't have the binding configured. Check `wrangler.toml` for `[[d1_databases]]` entries.
- In local dev with `--local`, D1 bindings work but Vectorize/AI bindings don't.

**Wrong table selected**
- Use the `table` parameter to force a specific table: `pixel_events`, `messages`, or `both`
- The keyword detection is heuristic — ambiguous questions may need explicit routing

**Cross-reference returning empty**
- Cross-reference matches `session_id` between messages and pixel events
- If no user messages exist yet, or session IDs don't overlap, results will be empty

**Limit capped at 100**
- Hard maximum of 100 rows to prevent performance issues
- For larger datasets, use the warehouse queries (Q1–Q10) via `run_analytics_query`
