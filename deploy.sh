#!/bin/bash
# deploy.sh – sekwencja wdrożenia EPIR
# Uruchom z głównego katalogu projektu: ./deploy.sh

set -e
root="$(cd "$(dirname "$0")" && pwd)"

echo "=== EPIR Deploy ==="

# 1. npm install (workspaces)
echo ""
echo "[1/7] npm install..."
cd "$root"
npm install

# 2. Deploy workers (kolejność: rag-worker, analytics, bigquery-batch, chat)
echo ""
echo "[2/7] Deploy epir-rag-worker..."
cd "$root/workers/rag-worker"
wrangler deploy

echo ""
echo "[3/7] Deploy epir-analityc-worker..."
cd "$root/workers/analytics"
wrangler deploy

echo ""
echo "[4/7] Deploy epir-bigquery-batch..."
cd "$root/workers/bigquery-batch"
wrangler deploy

echo ""
echo "[5/7] Deploy epir-art-jewellery-worker (chat)..."
cd "$root/workers/chat"
wrangler deploy

# 4. Shopify app – build i deploy (extensions, app proxy)
echo ""
echo "[6/7] shopify app build..."
cd "$root"
shopify app build

echo ""
echo "[7/7] shopify app deploy..."
shopify app deploy --allow-updates

echo ""
echo "=== Deploy zakończony ==="
echo "Sprawdź: https://asystent.epirbizuteria.pl/chat"
