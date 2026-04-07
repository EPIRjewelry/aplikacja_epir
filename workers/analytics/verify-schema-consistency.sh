#!/bin/bash
# ============================================================================
# Schema Consistency Verification Script
# ============================================================================
# Purpose: Verify that SQL schema files match the D1 schema in src/index.ts
# Usage: from workers/analytics: ./verify-schema-consistency.sh
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔍 Verifying schema consistency between SQL files and src/index.ts..."
echo "📂 Working directory: $SCRIPT_DIR"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [[ ! -f "src/index.ts" ]] || [[ ! -f "schema-pixel-events-base.sql" ]]; then
    echo -e "${RED}❌ Error: Required files not found${NC}"
    echo -e "${YELLOW}💡 Hint: This script expects src/index.ts and schema-pixel-events-base.sql${NC}"
    echo -e "${YELLOW}💡 Hint: Run from workers/analytics (current directory: $(pwd))${NC}"
    exit 1
fi

errors=0

echo "📋 Checking schema-pixel-events-base.sql..."

# Check 1: ID field should be INTEGER PRIMARY KEY AUTOINCREMENT
if grep -q "id INTEGER PRIMARY KEY AUTOINCREMENT" schema-pixel-events-base.sql; then
    echo -e "${GREEN}✅ ID field: INTEGER PRIMARY KEY AUTOINCREMENT${NC}"
else
    echo -e "${RED}❌ ID field: Should be INTEGER PRIMARY KEY AUTOINCREMENT${NC}"
    errors=$((errors + 1))
fi

# Check 2: created_at should be INTEGER NOT NULL
if grep -q "created_at INTEGER NOT NULL" schema-pixel-events-base.sql; then
    echo -e "${GREEN}✅ created_at field: INTEGER NOT NULL${NC}"
else
    echo -e "${RED}❌ created_at field: Should be INTEGER NOT NULL (Unix milliseconds)${NC}"
    errors=$((errors + 1))
fi

# Check 3: Heatmap v3 columns should be in base schema
heatmap_columns=("click_x" "click_y" "viewport_w" "viewport_h" "scroll_depth_percent"
                 "time_on_page_seconds" "element_tag" "search_query" "collection_id"
                 "checkout_token" "order_id" "mouse_x" "mouse_y")

echo ""
echo "📋 Checking heatmap v3 columns in base schema..."
for col in "${heatmap_columns[@]}"; do
    if grep -q "$col" schema-pixel-events-base.sql; then
        echo -e "${GREEN}✅ Heatmap column present: $col${NC}"
    else
        echo -e "${RED}❌ Missing heatmap column: $col${NC}"
        errors=$((errors + 1))
    fi
done

# Check 4: Index names should match index.ts conventions
echo ""
echo "📋 Checking index naming conventions..."
index_names=("idx_pixel_customer" "idx_pixel_session" "idx_pixel_event_type"
             "idx_pixel_product" "idx_pixel_created_at" "idx_pixel_clicks"
             "idx_pixel_scroll" "idx_pixel_time_on_page" "idx_pixel_search"
             "idx_pixel_collection")

for idx in "${index_names[@]}"; do
    if grep -q "$idx" schema-pixel-events-base.sql; then
        echo -e "${GREEN}✅ Index present: $idx${NC}"
    else
        echo -e "${RED}❌ Missing index: $idx${NC}"
        errors=$((errors + 1))
    fi
done

# Check 5: Verify v3-heatmap file is marked as deprecated
echo ""
echo "📋 Checking schema-pixel-events-v3-heatmap.sql status..."
if [[ -f "schema-pixel-events-v3-heatmap.sql" ]]; then
    if grep -q "DEPRECATED" schema-pixel-events-v3-heatmap.sql; then
        echo -e "${GREEN}✅ v3-heatmap file is marked as DEPRECATED${NC}"
    else
        echo -e "${YELLOW}⚠️  Warning: v3-heatmap file should be marked as DEPRECATED${NC}"
    fi
else
    echo -e "${GREEN}✅ v3-heatmap file has been removed (expected for clean deployments)${NC}"
fi

# Check 6: TypeScript ensurePixelTable() mirrors the same definitions
echo ""
echo "📋 Checking src/index.ts (ensurePixelTable)..."
if grep -q "id INTEGER PRIMARY KEY AUTOINCREMENT" src/index.ts; then
    echo -e "${GREEN}✅ TS: id is INTEGER PRIMARY KEY AUTOINCREMENT${NC}"
else
    echo -e "${RED}❌ TS: id is not INTEGER PRIMARY KEY AUTOINCREMENT${NC}"
    errors=$((errors + 1))
fi

if grep -q "created_at INTEGER NOT NULL" src/index.ts; then
    echo -e "${GREEN}✅ TS: created_at is INTEGER NOT NULL${NC}"
else
    echo -e "${RED}❌ TS: created_at is not INTEGER NOT NULL${NC}"
    errors=$((errors + 1))
fi

for col in "${heatmap_columns[@]}"; do
    if grep -q "$col" src/index.ts; then
        echo -e "${GREEN}✅ TS: Column $col found in ensurePixelTable()${NC}"
    else
        echo -e "${RED}❌ TS: Column $col not found in ensurePixelTable()${NC}"
        errors=$((errors + 1))
    fi
done

# Final summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✅ All schema consistency checks passed!${NC}"
    echo ""
    echo "The SQL schema files match the D1 schema defined in src/index.ts"
    exit 0
else
    echo -e "${RED}❌ Schema consistency check failed with $errors error(s)${NC}"
    echo ""
    echo "Please update the SQL schema files and/or src/index.ts to match"
    exit 1
fi
