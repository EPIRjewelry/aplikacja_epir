-- Migration 015: chat↔pixel match denominator (analytics consent + session id source).
ALTER TABLE sessions ADD COLUMN analytics_consent INTEGER;
ALTER TABLE sessions ADD COLUMN session_id_source TEXT;
