-- form_action: action formularza bez query. link_type: tel | mailto.
-- SQLite/D1: ADD COLUMN bez IF NOT EXISTS (duplikat kolumny = błąd; ensurePixelTable łapie go w try/catch).
ALTER TABLE pixel_events ADD COLUMN form_action TEXT;
ALTER TABLE pixel_events ADD COLUMN link_type TEXT;
