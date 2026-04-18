# EPIR KB + MCP Policy Contract

## Purpose

This document is the **normative contract** for how EPIR AI agents obtain **binding** store policies and FAQs. It complements [`EPIR_INGRESS_AND_RUNTIME.md`](EPIR_INGRESS_AND_RUNTIME.md) (transport) and [`EPIR_DATA_SCHEMA_CONTRACT.md`](EPIR_DATA_SCHEMA_CONTRACT.md) (data stores). If anything conflicts with [`EPIR_AI_BIBLE.md`](../EPIR_AI_BIBLE.md) or [`EPIR_AI_ECOSYSTEM_MASTER.md`](../EPIR_AI_ECOSYSTEM_MASTER.md), those base documents win.

**Language:** English for shared engineering review; implementation lives in `workers/chat` and related workers.

---

## 0. SSoT — „Policy Oracle” (normatywnie, PL)

Ta sekcja jest **ścisłym** uzupełnieniem kontraktu dla zespołu pracującego po polsku. W razie sprzeczności między tłumaczeniem a sekcjami angielskimi poniżej, **najpierw** należy rozstrzygnąć zgodnie z [`EPIR_AI_BIBLE.md`](../EPIR_AI_BIBLE.md) / ESOG; **struktura fizyczna D1** dla audytu jest opisana w [`EPIR_DATA_SCHEMA_CONTRACT.md`](EPIR_DATA_SCHEMA_CONTRACT.md) (tabela `memory_events`).

### 0.1 Jedno źródło prawdy dla regulaminów, zwrotów i wysyłki

**Shopify Knowledge Base**, odpytywane **wyłącznie** przez **Shopify Storefront MCP** (`POST https://{shop_domain}/api/mcp`, narzędzie `search_shop_policies_and_faqs` lub aktualny odpowiednik Shopify), jest **absolutnie jedynym** źródłem prawdy dla treści wiążących: regulaminów, zwrotów, reklamacji, polityki wysyłki, płatności, prywatności i powiązanych FAQ sklepu w kontekście agenta.

- D1, Vectorize, pliki w repozytorium i inne magazyny **nie są** kanonicznym źródłem **tekstu** polityk.
- **Dark Launch** infrastruktury pamięci (`memory_*`) **nie zmienia** tej zasady: pamięć przechowuje co najwyżej **referencje audytowe**, nie pełny tekst normatywny.

### 0.2 HARD STOP — zakaz RAG dla odpowiedzi o polityki

**Ścisły zakaz** używania warstwy wektorowej (RAG / Vectorize / indeksów „podobieństwa”) do **odpowiadania** na pytania o polityki sklepu, zwroty, regulamin czy wysyłkę w sensie **wiążącym**.

- RAG może wspierać treści **nienormatywne** (np. opisy produktów, inspiracje), **nigdy** jako zamiennik MCP dla roszczeń prawnych / sklepowych zobowiązań.

### 0.3 Awaria MCP — brak zgadywania

Jeśli MCP zwróci błąd, timeout lub brak użytecznego wyniku, agent **nie zgaduje** treści polityki ani „typowych” zasad e‑commerce.

- Dozwolona odpowiedź użytkownikowi: wariant **„nie wiem”** / **„nie mam dostępu do aktualnych zasad sklepu”** / **„system polityk jest chwilowo niedostępny”** oraz skierowanie do oficjalnego kanału (strona sklepu, kontakt, regulamin w storefrontcie) — **bez** uzupełniania z RAG ani z „wiedzy ogólnej” modelu.

### 0.4 Pamięć bota (D1) — tylko referencje audytowe

Pamięć w D1 **nie zapisuje** pełnego tekstu polityk jako nowego źródła prawdy. Dozwolone jest wyłącznie przechowywanie **referencji audytowych** związanych z użyciem (np. wywołanie narzędzia polityk): identyfikatory, wersja, znacznik czasu, hash pomocniczy — zgodnie ze schematem tabeli **`memory_events`** w [`EPIR_DATA_SCHEMA_CONTRACT.md`](EPIR_DATA_SCHEMA_CONTRACT.md).

| Pole w `memory_events` | Rola w kontrakcie audytu |
|------------------------|---------------------------|
| `shopify_customer_id` | Powiązanie z klientem |
| `kind` | `policy_touch` / `faq_touch` (oraz inne dozwolone wartości CHECK) |
| `ref_id` | Id polityki / referencja Shopify |
| `ref_version` | Wersja polityki, gdy znana |
| `content_hash` | Skrót treści z MCP — **nie** kanon; następna tura nadal przez MCP |
| `called_at` | Czas zapisu (Unix ms) |
| `locale`, `market` | Kontekst lokalizacji |
| `session_id`, `tool_call_id` | Powiązanie z sesją i deduplikacja wywołań |

Pełny opis kolumn i indeksów: **§ `memory_events`** w [`EPIR_DATA_SCHEMA_CONTRACT.md`](EPIR_DATA_SCHEMA_CONTRACT.md).

---

## 1. Canonical source of truth

1. **Authoritative content** for policies and FAQs used in production agents is maintained in **Shopify Knowledge Base** (Apps > Knowledge Base), together with native Shopify policy surfaces, and is exposed to agents **only** through **Shopify Storefront MCP**.
2. **No other datastore** (D1, Vectorize, JSON in the repo, Notion, ad-hoc CMS) is **normative** for policy *text*. Those systems may cache, embed for internal analytics, or power non-binding UX; they must **never** be edited as the “real” policy.
3. **Memory** (session, cross-session, embeddings) is **not** a policy repository. It may store **references and audit metadata** only (see section 5).

---

## 2. Single channel for agents

1. The **only** supported agent-facing channel for policy/FAQ retrieval is:

   - `POST https://{shop_domain}/api/mcp`
   - JSON-RPC 2.0 `tools/call` with tool **`search_shop_policies_and_faqs`** (or Shopify’s current equivalent).

2. **Query parameters** must include at least `query`; **`locale`** and **`market`** must be forwarded whenever the runtime knows them (HTTP headers and/or tool `arguments`, as supported by Shopify).

3. Internal wrappers (BFF, workers) may exist, but they must be **thin clients** of `/api/mcp`, not alternate sources of policy text.

4. **Plan** does not change this rule: if the shop has KB and MCP enabled, that is the channel for policy-aware agents.

---

## 3. No RAG for binding policy answers

1. **Retrieval (RAG / Vectorize) must not** answer questions about **binding store obligations**: returns, complaints, warranty, shipping policy, privacy/terms, payments, or other **legal/regulatory** claims.
2. RAG remains allowed for **non-regulatory** content: product descriptions, editorial content, sizing guides, inspiration — **never** as a substitute for MCP when the user asks for **policy facts**.
3. **Emergency behavior:** if MCP is down, times out, or returns no usable result, the agent must **refuse a binding answer** and state that the policy service is unavailable. **No fallback to RAG** and **no “general e-commerce” model knowledge** for those claims.

---

## 4. Localization

1. **Locale** (e.g. `pl-PL`, `en-US`) and **market** (Shopify market / region) are **inputs** to the policy tool on every relevant call.
2. **Which** regional policy variant applies is resolved by **Shopify KB / MCP**, not by heuristics in the RAG layer or by the LLM alone.

---

## 5. Versioning and audit memory

1. The bot **does not** store full policy text as a new source of truth.
2. **Preferred audit record** when MCP returns structured metadata:

   - `policy_id` (or stable slug)
   - `effective_from` / `updated_at` / version label
   - `called_at` (ISO 8601)

3. **Degraded mode** if Shopify does not yet expose IDs/versions: store **`content_hash`**, **`called_at`**, **`query`**, **`locale`**, **`market`** — never treat the hash as a second normative copy; the next user question must still go through MCP.

---

## 6. Orchestration rule (hard)

If intent classification is **policy / shipping / returns / terms / legal / privacy**, the pipeline **must** invoke the policy tool **only**. On failure: return a **controlled outage message** — do not silently substitute another content source.

---

## 7. Policy oracle — tool request (MCP)

Normative invocation shape (JSON-RPC 2.0):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_shop_policies_and_faqs",
    "arguments": {
      "query": "Jakie są zasady zwrotów?",
      "locale": "pl-PL",
      "market": "EU"
    }
  }
}
```

- **`query`** (required): natural-language question.
- **`locale`** / **`market`**: required whenever the runtime knows them; resolution of which policy variant applies stays in **KB / MCP**, not in RAG.

---

## 8. Target result envelope (normalized tool result)

The **policy oracle** result returned inside the MCP `tools/call` success payload (after any worker-side normalization) should expose three top-level domains:

| Field | Role |
| ----- | ---- |
| `policies` | Binding policy documents from KB |
| `faqs` | FAQ entries (interpretive; linked to policies) |
| `metadata` | Search context, counts, KB provenance — for logs, debug, audit — **not** all of it needs to enter chat history |

### 8.1 Success — empty match

When there are no applicable documents:

```json
{
  "policies": [],
  "faqs": [],
  "metadata": {
    "query": "…",
    "locale": "pl-PL",
    "market": "EU",
    "matched_entries_count": { "policies": 0, "faqs": 0 },
    "reason": "no_matching_documents",
    "retrieved_at": "2025-01-10T12:00:00.000Z"
  }
}
```

The agent **must not** invent policy text; see section 12.

### 8.2 Channel / tool failure (no RAG substitution)

```json
{
  "ok": false,
  "error": {
    "code": "MCP_UNAVAILABLE",
    "message": "Policy service temporarily unavailable.",
    "retryable": true
  }
}
```

Workers may wrap this; the orchestration rule in section 3 still applies.

---

## 9. Policy object schema

Each policy must be:

- Uniquely identifiable (`id`, `type`, `locale`, `market`)
- Versioned (`effective_from`, `updated_at`, `version`)
- LLM-friendly (`summary` for concise answers, `body` for verification / “show more”)
- Audit-friendly (`source`, optional admin URL)

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | string | Stable logical id (e.g. `returns-policy`) across versions |
| `kb_entry_id` | string? | Shopify KB entry id when exposed |
| `type` | string | e.g. `returns`, `shipping`, `privacy`, `terms`, `faq_policy` |
| `title` | string | Display / citation title |
| `summary` | string | Short binding summary for the model |
| `body` | string | Full official text for this locale/market |
| `locale` | string | BCP 47 (e.g. `pl-PL`) |
| `market` | string | Market / region id (Shopify market code or agreed label) |
| `effective_from` | string (ISO date) | When this version applies |
| `effective_to` | string \| null | Optional end of validity |
| `version` | string | Human or semver-like label |
| `updated_at` | string (ISO 8601) | Last change in KB |
| `source` | object | `system`, optional `url`, `kb_collection` |
| `scope` | object | `applies_to_markets`, `applies_to_channels`, `applies_to_customer_types` |
| `legal_notes` | object | `is_binding`, `jurisdiction`, `requires_legal_review` |

Example (single policy):

```json
{
  "id": "returns-policy",
  "kb_entry_id": "kb_12345",
  "type": "returns",
  "title": "Polityka zwrotów",
  "summary": "Kluczowe zasady zwrotów w skrócie…",
  "body": "Pełny, oficjalny tekst polityki w danym języku…",
  "locale": "pl-PL",
  "market": "EU",
  "effective_from": "2025-01-01",
  "effective_to": null,
  "version": "2025-01-01-v1",
  "updated_at": "2025-01-02T10:00:00Z",
  "source": {
    "system": "shopify_knowledge_base",
    "url": "https://admin.shopify.com/…",
    "kb_collection": "policies"
  },
  "scope": {
    "applies_to_markets": ["EU", "PL"],
    "applies_to_channels": ["online_store", "ai_agents"],
    "applies_to_customer_types": ["all"]
  },
  "legal_notes": {
    "is_binding": true,
    "jurisdiction": "PL",
    "requires_legal_review": false
  }
}
```

---

## 10. FAQ object schema

FAQ is a first-class knowledge unit, not a full statute; it **interprets** policies.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `id` | string | Stable FAQ id |
| `kb_entry_id` | string? | KB entry id when exposed |
| `question` | string | Matched or canonical question |
| `answer` | string | Official answer text |
| `locale` | string | BCP 47 |
| `market` | string | Same convention as policies |
| `related_policy_ids` | string[] | Policies this FAQ must not contradict |
| `tags` | string[] | Optional taxonomy |
| `updated_at` | string (ISO 8601) | |
| `source` | object | Same shape as policy `source` |
| `scope` | object | Same shape as policy `scope` |
| `legal_notes` | object | Typically `is_binding: false` for FAQ |

Example:

```json
{
  "id": "faq-returns-30-days",
  "kb_entry_id": "kb_67890",
  "question": "Czy mogę zwrócić produkt po 30 dniach?",
  "answer": "Standardowo zwroty przyjmujemy w ciągu 30 dni od daty zakupu…",
  "locale": "pl-PL",
  "market": "EU",
  "related_policy_ids": ["returns-policy"],
  "tags": ["returns", "timeline", "post-purchase"],
  "updated_at": "2025-01-02T10:05:00Z",
  "source": {
    "system": "shopify_knowledge_base",
    "url": "https://admin.shopify.com/…",
    "kb_collection": "faqs"
  },
  "scope": {
    "applies_to_markets": ["EU"],
    "applies_to_channels": ["online_store", "ai_agents"],
    "applies_to_customer_types": ["all"]
  },
  "legal_notes": {
    "is_binding": false,
    "jurisdiction": "PL"
  }
}
```

---

## 11. Full composite example (tool result)

```json
{
  "policies": [
    {
      "id": "returns-policy",
      "kb_entry_id": "kb_12345",
      "type": "returns",
      "title": "Polityka zwrotów",
      "summary": "Zwroty przyjmujemy w ciągu 30 dni od daty zakupu dla wszystkich zamówień z rynku EU.",
      "body": "Pełny, oficjalny tekst polityki zwrotów w wersji obowiązującej dla rynku EU…",
      "locale": "pl-PL",
      "market": "EU",
      "effective_from": "2025-01-01",
      "effective_to": null,
      "version": "2025-01-01-v1",
      "updated_at": "2025-01-02T10:00:00Z",
      "source": {
        "system": "shopify_knowledge_base",
        "url": "https://admin.shopify.com/store/epir/apps/knowledge-base/entries/kb_12345",
        "kb_collection": "policies"
      },
      "scope": {
        "applies_to_markets": ["EU"],
        "applies_to_channels": ["online_store", "ai_agents"],
        "applies_to_customer_types": ["all"]
      },
      "legal_notes": {
        "is_binding": true,
        "jurisdiction": "PL",
        "requires_legal_review": false
      }
    }
  ],
  "faqs": [
    {
      "id": "faq-returns-30-days",
      "kb_entry_id": "kb_67890",
      "question": "Czy mogę zwrócić produkt po 30 dniach?",
      "answer": "Nasza standardowa polityka zwrotów pozwala na zwrot produktów w ciągu 30 dni od daty zakupu. Po tym czasie zwroty nie są przyjmowane, z wyjątkiem przypadków opisanych w sekcji „Reklamacje z tytułu rękojmi”.",
      "locale": "pl-PL",
      "market": "EU",
      "related_policy_ids": ["returns-policy"],
      "tags": ["returns", "timeline", "post-purchase"],
      "updated_at": "2025-01-02T10:05:00Z",
      "source": {
        "system": "shopify_knowledge_base",
        "url": "https://admin.shopify.com/store/epir/apps/knowledge-base/entries/kb_67890",
        "kb_collection": "faqs"
      },
      "scope": {
        "applies_to_markets": ["EU"],
        "applies_to_channels": ["online_store", "ai_agents"],
        "applies_to_customer_types": ["all"]
      },
      "legal_notes": {
        "is_binding": false,
        "jurisdiction": "PL"
      }
    }
  ],
  "metadata": {
    "query": "Czy mogę zwrócić produkt po 30 dniach?",
    "locale": "pl-PL",
    "market": "EU",
    "matched_entries_count": { "policies": 1, "faqs": 1 },
    "search_strategy": "full_text + semantic",
    "kb_source": {
      "system": "shopify_knowledge_base",
      "endpoint": "https://{shop_domain}/api/mcp",
      "tenant": "epir-art-silver-jewellery"
    },
    "retrieved_at": "2025-01-10T12:00:00.000Z"
  }
}
```

**Degraded mapping:** until Shopify returns this shape natively, workers may map from the current MCP text blob into a **minimal** subset (`summary`/`body` from text, omit unknown fields) and still comply with sections 3 and 12.

---

## 12. LLM consumption rules (orchestration + prompts)

These rules are **normative** for any system prompt or tool-router that consumes this tool.

1. **If `policies.length > 0`:** answer only from those policies’ `summary` and `body`; cite `title` and optionally `effective_from`; do **not** rely on generic e-commerce knowledge for binding claims.
2. **If `faqs.length > 0` and the FAQ matches the question:** use `answer` as the primary user-facing text, but **never** state anything that **contradicts** any policy listed in `related_policy_ids` (policies win).
3. **If `policies.length === 0` && `faqs.length === 0`:** do not guess; respond that no matching policy/FAQ is available for this case and direct the buyer to official support / contact (wording per brand voice), without inventing terms.

### 12.1 Audit memory (not a second source of truth)

Persist only:

- `policy.id` / FAQ `id`, `version` / `effective_from`, `called_at`, `locale`, `market`

Do **not** persist full `body` as normative truth in long-term memory; the next turn must still go through MCP.

Example audit payload:

```json
{
  "tool": "search_shop_policies_and_faqs",
  "called_at": "2025-01-10T10:00:00.000Z",
  "query": "returns after 60 days",
  "locale": "pl-PL",
  "market": "EU",
  "policy_refs": [
    { "policy_id": "returns-policy", "version_label": "2025-01-01-v1", "effective_from": "2025-01-01" }
  ],
  "content_hash": "sha256:…"
}
```

---

## 13. TypeScript reference types

Optional shared types for workers and tests (names may differ in code; fields are the contract):

```typescript
export type KbSource = {
  system: 'shopify_knowledge_base';
  url?: string;
  kb_collection?: string;
};

export type PolicyScope = {
  applies_to_markets: string[];
  applies_to_channels: string[];
  applies_to_customer_types: string[];
};

export type LegalNotes = {
  is_binding: boolean;
  jurisdiction?: string;
  requires_legal_review?: boolean;
};

export type PolicyOraclePolicy = {
  id: string;
  kb_entry_id?: string;
  type: string;
  title: string;
  summary: string;
  body: string;
  locale: string;
  market: string;
  effective_from: string;
  effective_to: string | null;
  version: string;
  updated_at: string;
  source: KbSource;
  scope: PolicyScope;
  legal_notes: LegalNotes;
};

export type PolicyOracleFaq = {
  id: string;
  kb_entry_id?: string;
  question: string;
  answer: string;
  locale: string;
  market: string;
  related_policy_ids: string[];
  tags: string[];
  updated_at: string;
  source: KbSource;
  scope: PolicyScope;
  legal_notes: LegalNotes;
};

export type PolicyOracleMetadata = {
  query: string;
  locale: string;
  market: string;
  matched_entries_count: { policies: number; faqs: number };
  search_strategy?: string;
  reason?: string;
  kb_source?: {
    system: string;
    endpoint: string;
    tenant?: string;
  };
  retrieved_at: string;
};

export type PolicyOracleResult = {
  policies: PolicyOraclePolicy[];
  faqs: PolicyOracleFaq[];
  metadata: PolicyOracleMetadata;
};

export type PolicyOracleToolFailure = {
  ok: false;
  error: { code: string; message: string; retryable?: boolean };
};
```

---

## 14. Implementation references (non-normative)

- Chat worker MCP proxy and tool names: `workers/chat/src/mcp_server.ts`, `workers/chat/src/mcp_tools.ts`
- Buyer-facing system prompt guardrails: `workers/chat/src/prompts/luxury-system-prompt.ts`
- RAG worker must remain aligned with section 3: `workers/rag-worker/src/domain/orchestrator.ts` (no Vectorize fallback for binding policy intents when this contract is enforced)

---

## Revision

Changes to this contract require review against **ESOG** / [`EPIR_AI_BIBLE.md`](../EPIR_AI_BIBLE.md) and an explicit update to this file (no shadow copies in side documents).
