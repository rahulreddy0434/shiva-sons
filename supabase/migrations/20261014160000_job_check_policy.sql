-- Per-job limits for the review checks (most hours in one day, longest shift,
-- longest break, rounding, tolerance for totals). Null means the defaults in
-- lib/validation/check-policy.ts. The settings only decide what is flagged
-- for review; no value is ever changed by them. Additive.

alter table public.extraction_jobs add column if not exists check_policy jsonb;
