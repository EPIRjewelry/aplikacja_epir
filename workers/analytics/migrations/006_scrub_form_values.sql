-- NIE URUCHAMIAĆ w tym PR.
-- Ręczny scrub historycznych wartości pól w pixel_events.raw_data.
-- Dotyczy wyłącznie: form_submitted, input_focused, input_blurred, input_changed.
-- Zostawia element.id i element.action. Usuwa element.value oraz całą tablicę elements
-- (tam leżą value z Web Pixels). Nie kasuje wierszy.
-- D1: json_remove. Po przeglądzie operatora, poza deployem.

UPDATE pixel_events
SET raw_data = json_remove(
  raw_data,
  '$.data.element.value',
  '$.data.data.element.value',
  '$.data.element.elements',
  '$.data.data.element.elements',
  '$.data.input.value',
  '$.data.form'
)
WHERE event_type IN (
  'form_submitted',
  'input_focused',
  'input_blurred',
  'input_changed'
)
AND json_valid(raw_data);
