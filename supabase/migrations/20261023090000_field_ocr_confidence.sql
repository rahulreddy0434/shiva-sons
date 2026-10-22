-- How sure the OCR was about the writing each value was read from (0–1),
-- separate from the AI's own confidence. Null when unknown: the value could
-- not be placed on the page, or the page was read before this was kept.
alter table public.extracted_fields
  add column if not exists ocr_confidence numeric;
