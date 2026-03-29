-- ============================================================================
-- Pixel Events Table (Complete Schema)
-- ============================================================================
-- Purpose: Store all web pixel events from Shopify Web Pixel API + heatmap v3
-- Used by: analytics-worker to track customer behavior and trigger AI analysis
-- Migration: Run with `wrangler d1 execute <DATABASE_NAME> --local --file=./schema-pixel-events-base.sql`
-- Note: Align with D1 schema in workers/analytics/src/index.ts
-- ============================================================================

CREATE TABLE IF NOT EXISTS pixel_events (
    -- Unique identifier for each event (auto-incrementing integer)
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Customer identification
    customer_id TEXT,
    session_id TEXT,

    -- Event metadata
    event_type TEXT NOT NULL,
    event_name TEXT,

    -- Product data (for product-related events)
    product_id TEXT,
    product_handle TEXT,
    product_type TEXT,
    product_vendor TEXT,
    product_title TEXT,
    variant_id TEXT,

    -- Cart data (for cart events)
    cart_id TEXT,

    -- Page context data
    page_url TEXT,
    page_title TEXT,
    page_type TEXT,

    -- Raw event payload (JSON)
    event_data TEXT,

    -- Timestamps (Unix milliseconds for consistency with Cloudflare Workers)
    created_at INTEGER NOT NULL,

    -- Heatmap data (click coordinates, viewport dimensions)
    click_x INTEGER,
    click_y INTEGER,
    viewport_w INTEGER,
    viewport_h INTEGER,

    -- Scroll tracking
    scroll_depth_percent INTEGER,

    -- Time on page tracking
    time_on_page_seconds INTEGER,

    -- DOM element tracking (for click and form events)
    element_tag TEXT,
    element_id TEXT,
    element_class TEXT,
    input_name TEXT,
    form_id TEXT,

    -- Search tracking
    search_query TEXT,

    -- Collection tracking
    collection_id TEXT,
    collection_handle TEXT,

    -- Checkout tracking
    checkout_token TEXT,

    -- Purchase tracking
    order_id TEXT,
    order_value REAL,

    -- Alert tracking
    alert_type TEXT,
    alert_message TEXT,

    -- Error tracking
    error_message TEXT,
    extension_id TEXT,

    -- Mouse hover tracking
    mouse_x INTEGER,
    mouse_y INTEGER
);

-- ============================================================================
-- Base Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pixel_customer
    ON pixel_events(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pixel_session
    ON pixel_events(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pixel_product
    ON pixel_events(product_id, created_at);

CREATE INDEX IF NOT EXISTS idx_pixel_event_type
    ON pixel_events(event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_pixel_created_at
    ON pixel_events(created_at);

-- ============================================================================
-- Heatmap-specific indexes (for v3 schema with inline heatmap fields)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pixel_clicks
    ON pixel_events(page_url, event_type, click_x, click_y)
    WHERE click_x IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pixel_scroll
    ON pixel_events(page_url, scroll_depth_percent)
    WHERE scroll_depth_percent IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pixel_time_on_page
    ON pixel_events(page_url, time_on_page_seconds)
    WHERE time_on_page_seconds IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pixel_search
    ON pixel_events(search_query, created_at)
    WHERE search_query IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pixel_collection
    ON pixel_events(collection_id, created_at)
    WHERE collection_id IS NOT NULL;

-- ============================================================================
-- Migration Notes
-- ============================================================================
-- Unified schema (base + heatmap v3) in one file. schema-pixel-events-v3-heatmap.sql is DEPRECATED.
--
-- wrangler d1 execute <DATABASE_NAME> --local --file=./schema-pixel-events-base.sql
-- wrangler d1 execute <DATABASE_NAME> --remote --file=./schema-pixel-events-base.sql
-- ============================================================================
