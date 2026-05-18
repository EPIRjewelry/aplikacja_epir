#!/usr/bin/env python3
"""
Statyczna zgodność: [webhooks] api_version w shopify.app.toml
vs SHOPIFY_ADMIN_API_VERSION w workers/chat/src/config/shopify-api-version.ts.

Uruchom z root repo: python3 scripts/ci/validate-shopify-admin-api-version.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def fail(msg: str) -> None:
    sys.stderr.write(f"[shopify-admin-api-version] {msg}\n")
    raise SystemExit(1)


def read_webhooks_api_version(toml_text: str) -> str:
    # Sekcja [webhooks] może być przed innymi — bierzemy pierwsze api_version po [webhooks]
    idx = toml_text.find("[webhooks]")
    if idx < 0:
        fail("shopify.app.toml: brak sekcji [webhooks]")
    chunk = toml_text[idx : idx + 800]
    m = re.search(r'api_version\s*=\s*"([^"]+)"', chunk)
    if not m:
        fail("shopify.app.toml: brak api_version w sekcji [webhooks] (oczekiwano api_version = \"...\")")
    return m.group(1).strip()


def read_ts_admin_version(ts_text: str) -> str:
    m = re.search(r"SHOPIFY_ADMIN_API_VERSION\s*=\s*['\"]([^'\"]+)['\"]", ts_text)
    if not m:
        fail("shopify-api-version.ts: brak SHOPIFY_ADMIN_API_VERSION = '...'")
    return m.group(1).strip()


def main() -> None:
    toml_path = REPO_ROOT / "shopify.app.toml"
    ts_path = REPO_ROOT / "workers" / "chat" / "src" / "config" / "shopify-api-version.ts"
    if not toml_path.is_file():
        fail(f"Brak pliku: {toml_path}")
    if not ts_path.is_file():
        fail(f"Brak pliku: {ts_path}")

    toml_v = read_webhooks_api_version(toml_path.read_text(encoding="utf-8"))
    ts_v = read_ts_admin_version(ts_path.read_text(encoding="utf-8"))

    if toml_v != ts_v:
        fail(
            f"Niezgodność wersji Admin API: shopify.app.toml [webhooks] api_version={toml_v!r} "
            f"≠ SHOPIFY_ADMIN_API_VERSION={ts_v!r} w {ts_path.relative_to(REPO_ROOT)}. "
            "Podnieś oba miejsca razem (patrz docs/EPIR_DEPLOYMENT_AND_OPERATIONS.md — workers/chat)."
        )

    print(f"[shopify-admin-api-version] OK: Admin API {toml_v!r} (TOML + TS)")


if __name__ == "__main__":
    main()
