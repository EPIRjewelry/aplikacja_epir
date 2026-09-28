-- Watermark eksportu: kursor (czas ms, id tekstowy) dla pixel i order_attributions

ALTER TABLE batch_exports ADD COLUMN last_pixel_export_id TEXT DEFAULT '';
ALTER TABLE batch_exports ADD COLUMN last_orders_export_at INTEGER DEFAULT 0;
ALTER TABLE batch_exports ADD COLUMN last_orders_export_id TEXT DEFAULT '';
