-- Adds what the review → approve → export half of the product needs on top of
-- the baseline. Everything here is additive: no table, column, or row is removed.
--
-- The baseline already has field→column mapping (extraction_fields.target_column_id),
-- validation_issues, user_corrections and export_files, so this fills the gaps
-- rather than creating parallel tables.

-- ---------------------------------------------------------------------------
-- Jobs: the lifecycle states from the product spec, and the chosen worksheet
-- ---------------------------------------------------------------------------
alter table public.extraction_jobs drop constraint if exists extraction_jobs_status_check;
alter table public.extraction_jobs add constraint extraction_jobs_status_check
  check (status in (
    'draft', 'uploaded', 'processing', 'needs_review', 'approved', 'exported', 'failed',
    'completed' -- legacy value from the baseline, no longer written
  ));

-- Which worksheet of the template the export writes into
alter table public.extraction_jobs
  add column if not exists target_sheet_id uuid references public.workbook_sheets(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Mapping: replacing a template must not be blocked by fields mapped to its
-- old columns — the mapping is simply cleared
-- ---------------------------------------------------------------------------
alter table public.extraction_fields drop constraint if exists extraction_fields_target_column_id_fkey;
alter table public.extraction_fields add constraint extraction_fields_target_column_id_fkey
  foreign key (target_column_id) references public.workbook_columns(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Documents: size, the reason for a failure, and one row per page so that
-- re-running OCR cannot duplicate pages
-- ---------------------------------------------------------------------------
alter table public.uploaded_documents
  add column if not exists file_size bigint,
  add column if not exists error_message text;

alter table public.document_pages drop constraint if exists document_pages_document_page_key;
alter table public.document_pages add constraint document_pages_document_page_key
  unique (document_id, page_number);

-- ---------------------------------------------------------------------------
-- Records: where a record came from and whether a person has reviewed it
-- ---------------------------------------------------------------------------
alter table public.extraction_records
  add column if not exists source text not null default 'extracted'
    constraint extraction_records_source_check check (source in ('extracted', 'user_added')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Validation: blocking vs warning, and the wider set of checks in the spec
-- ---------------------------------------------------------------------------
alter table public.validation_issues
  add column if not exists severity text not null default 'warning'
    constraint validation_issues_severity_check check (severity in ('blocking', 'warning'));

alter table public.validation_issues drop constraint if exists validation_issues_issue_type_check;
alter table public.validation_issues add constraint validation_issues_issue_type_check
  check (issue_type in (
    'missing', 'invalid_date', 'invalid_time', 'math_mismatch', 'duplicate',
    'invalid_number', 'invalid_duration', 'time_order', 'out_of_range', 'ambiguous'
  ));

create index if not exists idx_validation_issues_unresolved
  on public.validation_issues (record_id) where not resolved;

-- ---------------------------------------------------------------------------
-- Approval: an explicit, timestamped sign-off that an export is tied to.
-- Editing records after approval sets superseded_at, so the job needs
-- re-approval before it can be exported again.
-- ---------------------------------------------------------------------------
create table if not exists public.job_approvals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.extraction_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  approved_at timestamptz not null default now(),
  workbook_file_id uuid references public.workbook_files(id) on delete set null,
  sheet_id uuid references public.workbook_sheets(id) on delete set null,
  document_count integer not null,
  page_count integer not null,
  record_count integer not null,
  corrected_record_count integer not null default 0,
  open_warning_count integer not null default 0,
  superseded_at timestamptz
);
create index if not exists idx_job_approvals_job on public.job_approvals (job_id);

alter table public.job_approvals enable row level security;
drop policy if exists "own rows" on public.job_approvals;
create policy "own rows" on public.job_approvals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Which approval an export was generated from, and how many records it holds
alter table public.export_files
  add column if not exists approval_id uuid references public.job_approvals(id) on delete set null,
  add column if not exists record_count integer;
