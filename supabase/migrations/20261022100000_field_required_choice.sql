-- A field's "required" is now a choice the user makes in Step 2: null means
-- they have not chosen yet, and the schema cannot be approved until every
-- field is Required (true) or Optional (false). Existing fields keep their value.
alter table public.extraction_fields
  alter column required drop not null,
  alter column required drop default;
