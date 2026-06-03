#!/usr/bin/env python3
"""
Walidacja polityki bezpieczeństwa deployu Wrangler (profil produkcyjny).

Sprawdza workers/*/wrangler.toml:
  - workers_dev nie może być true (root lub override w [env.production]),
  - brak placeholderów i treści wyglądających jak sekrety w scalonych [vars],
  - obecność wymaganych bindingów (chat / rag / analytics / batch).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import tomllib

REPO_ROOT = Path(__file__).resolve().parents[2]

WORKERS: dict[str, dict[str, object]] = {
    "workers/chat/wrangler.toml": {
        "label": "chat (epir-art-jewellery-worker)",
        "required_bindings": frozenset(
            {
                "DB",
                "DB_CHATBOT",
                "SESSION_DO",
                "RATE_LIMITER_DO",
                "TOKEN_VAULT_DO",
                "MEMORY_EXTRACT_QUEUE",
                "MEMORY_INDEX",
                "POLICIES_CACHE",
                "RAG_WORKER",
                "ANALYTICS_WORKER",
                "ANALYTICS_S2S_RPC",
                "BIGQUERY_BATCH_RPC",
                "STORE_STEWARD_RPC",
                "MARKETING_INGEST_RPC",
                "AI",
            }
        ),
        # Service binding `props.scopes` muszą trafić do `ctx.props` callee (RPC); brak → runtime
        # `rpc:forbidden missing scope …` mimo poprawnego kodu.
        "rpc_props_scopes": {
            "BIGQUERY_BATCH_RPC": frozenset({"bigquery.analytics_query"}),
            "ANALYTICS_S2S_RPC": frozenset(
                {
                    "analytics.charts.read",
                    "analytics.pixel_events.read",
                    "analytics.journey.read",
                    "analytics.sessions.read",
                }
            ),
        },
    },
    "workers/rag-worker/wrangler.toml": {
        "label": "rag (epir-rag-worker)",
        "required_bindings": frozenset({"DB", "VECTOR_INDEX", "AI"}),
    },
    "workers/analytics/wrangler.toml": {
        "label": "analytics (epir-analityc-worker)",
        "required_bindings": frozenset({"DB", "SESSION_DO", "CHART_EDGE_CACHE", "WAREHOUSE_CQRS_WF"}),
    },
    "workers/bigquery-batch/wrangler.toml": {
        "label": "bigquery-batch (epir-bigquery-batch)",
        "required_bindings": frozenset({"DB", "DB_CHATBOT"}),
        # `POST /internal/trigger-export` (Bearer DATA_GUARDIAN_OPS_KEY) — smoke eksportu D1→Pipelines bez czekania na cron.
        "allow_workers_dev_at_root": True,
    },
    "workers/marketing-ingest/wrangler.toml": {
        "label": "marketing-ingest (epir-marketing-ingest)",
        "required_bindings": frozenset(),
        # Domyślny deploy (`--env=""`) publikuje na *.workers.dev — celowe dla publicznego
        # `GET /ops/marketing-preview` (Bearer + brak sekretu ⇒ 404). Inne workery EPIR: workers_dev=false.
        "allow_workers_dev_at_root": True,
    },
    "workers/analyst-worker/wrangler.toml": {
        "label": "analyst-worker (epir-analyst-worker)",
        "required_bindings": frozenset({"BIGQUERY_BATCH_RPC", "STORE_STEWARD_RPC"}),
        "allow_workers_dev_at_root": True,
        "rpc_props_scopes": {
            "BIGQUERY_BATCH_RPC": frozenset({"bigquery.analytics_query"}),
        },
    },
    "workers/store-steward/wrangler.toml": {
        "label": "store-steward (epir-store-steward)",
        "required_bindings": frozenset({"DB", "BIGQUERY_BATCH_RPC"}),
        "allow_workers_dev_at_root": True,
        "rpc_props_scopes": {
            "BIGQUERY_BATCH_RPC": frozenset({"bigquery.analytics_query"}),
        },
    },
}

# Wartości var — oczywiste placeholdery / dev-only
PLACEHOLDER_RES: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)\b(changeme|change[-_]?me|replace[-_]?me|your[-_](api[-_]?)?key)\b"),
    re.compile(r"(?i)\b(placeholder|fixme|todo[:_\s]|lorem[-_]?ipsum)\b"),
    re.compile(r"(?i)\b(insert[-_\s](your|api|key|token|here))\b"),
    re.compile(r"(?i)https?://(localhost|127\.0\.0\.1)([:/]|\b)"),
    re.compile(r"(?i)\bxxx{3,}\b"),
    re.compile(r"(?i)<\s*(replace|insert|secret|api[-_]?key)\s*>"),
)

# Sekrety nie mogą trafiać do [vars] — tylko wrangler secret / dashboard
SECRET_RES: tuple[re.Pattern[str], ...] = (
    re.compile(r"BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY"),
    re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),  # JWT
    re.compile(r"sk-(live|test|proj)-[A-Za-z0-9]{20,}"),
    re.compile(r"AIza[0-9A-Za-z_-]{30,}"),
    re.compile(r"xox[baprs]-[0-9A-Za-z-]+"),
)


def fail(msg: str) -> None:
    sys.stderr.write(f"[deploy-policy] {msg}\n")
    raise SystemExit(1)


def load_toml(rel: Path) -> dict:
    raw = rel.read_bytes()
    data = tomllib.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        fail(f"{rel}: niepoprawna struktura TOML (oczekiwano tabeli na root).")
    return data


def check_workers_dev(data: dict, rel_s: str, label: str, *, allow_root_workers_dev: bool = False) -> None:
    """
    `wrangler deploy` bez --env bierze workers_dev z root.
    `wrangler deploy --env production` może nadpisać w [env.production] — oba poziomy muszą być bezpieczne.
    """
    if data.get("workers_dev") is True and not allow_root_workers_dev:
        fail(
            f"{rel_s} ({label}): workers_dev=true na poziomie root — domyślny `wrangler deploy` "
            "publikuje też na *.workers.dev; ustaw false w root (lub nie używaj domyślnego deployu z tą flagą)."
        )
    env_root = data.get("env")
    if isinstance(env_root, dict):
        prod = env_root.get("production")
        if isinstance(prod, dict) and prod.get("workers_dev") is True:
            fail(
                f"{rel_s} ({label}): workers_dev=true w [env.production] — niedozwolone dla profilu produkcyjnego."
            )


def merged_production_vars(data: dict) -> dict[str, object]:
    base = data.get("vars")
    out: dict[str, object] = dict(base) if isinstance(base, dict) else {}
    env_root = data.get("env")
    if not isinstance(env_root, dict):
        return out
    prod = env_root.get("production")
    if not isinstance(prod, dict):
        return out
    extra = prod.get("vars")
    if isinstance(extra, dict):
        out = {**out, **extra}
    return out


def check_rpc_props_scopes(
    rel_s: str,
    label: str,
    data: dict,
    binding_to_required: dict[str, frozenset[str]],
) -> None:
    services = data.get("services")
    if not isinstance(services, list):
        fail(f"{rel_s} ({label}): brak tablicy `services` w TOML — nie można zweryfikować RPC props.")

    by_binding: dict[str, dict] = {}
    for item in services:
        if isinstance(item, dict) and "binding" in item:
            by_binding[str(item["binding"])] = item

    for binding, required in binding_to_required.items():
        entry = by_binding.get(binding)
        if not entry:
            continue  # missing binding caught by required_bindings check
        props = entry.get("props")
        if not isinstance(props, dict):
            fail(
                f"{rel_s} ({label}): binding `{binding}` musi mieć `[services.props]` "
                f"(scopes dla RPC) — brak lub niepoprawna struktura props."
            )
        scopes_raw = props.get("scopes")
        if not isinstance(scopes_raw, list):
            fail(
                f"{rel_s} ({label}): binding `{binding}` — `props.scopes` musi być tablicą stringów "
                f"(Workers przekazuje je do callee jako ctx.props.scopes)."
            )
        got = {str(s) for s in scopes_raw if isinstance(s, str)}
        missing = sorted(required - got)
        if missing:
            fail(
                f"{rel_s} ({label}): binding `{binding}` — brak wymaganych `props.scopes`: "
                f"{', '.join(missing)}. Uzupełnij wrangler.toml i zrób redeploy workera wołającego."
            )


def collect_bindings(data: dict) -> set[str]:
    names: set[str] = set()

    for arr_key in ("d1_databases", "kv_namespaces", "r2_buckets", "vectorize", "services"):
        for item in data.get(arr_key) or []:
            if isinstance(item, dict) and "binding" in item:
                names.add(str(item["binding"]))

    for item in data.get("workflows") or []:
        if isinstance(item, dict) and "binding" in item:
            names.add(str(item["binding"]))

    queues = data.get("queues")
    if isinstance(queues, dict):
        for section in ("producers", "consumers"):
            for item in queues.get(section) or []:
                if isinstance(item, dict) and "binding" in item:
                    names.add(str(item["binding"]))

    do = data.get("durable_objects")
    if isinstance(do, dict):
        for item in do.get("bindings") or []:
            if isinstance(item, dict) and "name" in item:
                names.add(str(item["name"]))

    ai = data.get("ai")
    if isinstance(ai, dict) and "binding" in ai:
        names.add(str(ai["binding"]))

    return names


def check_vars(rel: Path, label: str, vars_map: dict[str, object]) -> None:
    for key, raw in sorted(vars_map.items()):
        if raw is None:
            fail(f"{rel} ({label}): var `{key}` jest null — użyj wartości lub usuń klucz z [vars].")
        val = str(raw).strip()
        if val == "":
            fail(f"{rel} ({label}): pusty string w [vars].{key} — ustaw wartość lub przenieś do secret.")

        for rx in PLACEHOLDER_RES:
            if rx.search(val):
                fail(
                    f"{rel} ({label}): podejrzany placeholder w [vars].{key} — "
                    "usuń szablon i ustaw realną wartość albo sekret."
                )

        for rx in SECRET_RES:
            if rx.search(val):
                fail(
                    f"{rel} ({label}): wartość w [vars].{key} wygląda jak sekret (klucz/JWT/cert) — "
                    "użyj `wrangler secret put`, nie commituj w TOML."
                )


def main() -> None:
    for rel_s, meta in WORKERS.items():
        rel = REPO_ROOT / rel_s
        if not rel.is_file():
            fail(f"Brak pliku {rel_s} — nie można zweryfikować polityki deployu.")

        data = load_toml(rel)
        label = meta["label"]
        required = meta["required_bindings"]
        if not isinstance(required, frozenset):
            fail(f"{rel_s}: wewnętrzny błąd — `required_bindings` musi być frozenset.")

        allow_wd = bool(meta.get("allow_workers_dev_at_root"))
        check_workers_dev(data, rel_s, label, allow_root_workers_dev=allow_wd)

        check_vars(rel, label, merged_production_vars(data))

        have = collect_bindings(data)
        missing = sorted(required - have)
        if missing:
            fail(
                f"{rel_s} ({label}): brak wymaganych bindingów: {', '.join(missing)} — "
                "uzupełnij wrangler.toml (D1, DO, services, Vectorize, KV, kolejki, [ai])."
            )

        rpc_checks = meta.get("rpc_props_scopes")
        if isinstance(rpc_checks, dict) and rpc_checks:
            normalized: dict[str, frozenset[str]] = {}
            for b, scopes in rpc_checks.items():
                if not isinstance(scopes, frozenset):
                    fail(f"{rel_s}: rpc_props_scopes[{b!r}] musi być frozenset.")
                normalized[str(b)] = scopes
            check_rpc_props_scopes(rel_s, label, data, normalized)

    print(
        "[deploy-policy] OK — profil produkcyjny (wrangler): workers_dev, vars, bindingi, RPC props.scopes."
    )


if __name__ == "__main__":
    main()
