-- Migration 016: EDOG join chat sess_* ↔ pixel clientId (analytics_client_id).
ALTER TABLE sessions ADD COLUMN analytics_client_id TEXT;
