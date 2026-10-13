-- Baseline: the schema as it existed in the Supabase project on 2026-10-12.
--
-- `supabase db pull` needs Docker and produced an empty file, so this was
-- reconstructed from the live catalog (columns, constraints, indexes, RLS
-- policies, the profile trigger, storage buckets and policies). It is written
-- to be safe to run against a database that already has these objects.

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, created by trigger)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table if not exists public.extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'draft'
    constraint extraction_jobs_status_check
    check (status in ('draft', 'processing', 'needs_review', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_extraction_jobs_user on public.extraction_jobs (user_id);

-- ---------------------------------------------------------------------------
-- Excel template
-- ---------------------------------------------------------------------------
create table if not exists public.workbook_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.extraction_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  file_size bigint,
  created_at timestamptz not null default now()
);
create index if not exists idx_workbook_files_job on public.workbook_files (job_id);

create table if not exists public.workbook_sheets (
  id uuid primary key default gen_random_uuid(),
  workbook_file_id uuid not null references public.workbook_files(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sheet_name text not null,
  sheet_index integer not null,
  header_row_index integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_workbook_sheets_file on public.workbook_sheets (workbook_file_id);

create table if not exists public.workbook_columns (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.workbook_sheets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  column_name text not null,
  column_index integer not null,
  inferred_type text
    constraint workbook_columns_inferred_type_check
    check (inferred_type in ('text', 'date', 'time', 'duration', 'number')),
  created_at timestamptz not null default now()
);
create index if not exists idx_workbook_columns_sheet on public.workbook_columns (sheet_id);

-- ---------------------------------------------------------------------------
-- Instructions and field schema
-- ---------------------------------------------------------------------------
create table if not exists public.extraction_instructions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.extraction_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  instructions_text text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_extraction_instructions_job on public.extraction_instructions (job_id);

create table if not exists public.extraction_schemas (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.extraction_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_extraction_schemas_job on public.extraction_schemas (job_id);

create table if not exists public.extraction_fields (
  id uuid primary key default gen_random_uuid(),
  schema_id uuid not null references public.extraction_schemas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field_key text not null,
  label text not null,
  data_type text not null
    constraint extraction_fields_data_type_check
    check (data_type in ('string', 'date', 'time', 'duration', 'number')),
  required boolean not null default false,
  sort_order integer not null default 0,
  target_column_id uuid references public.workbook_columns(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_extraction_fields_schema on public.extraction_fields (schema_id);

-- ---------------------------------------------------------------------------
-- Source documents and OCR pages
-- ---------------------------------------------------------------------------
create table if not exists public.uploaded_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.extraction_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  file_type text not null
    constraint uploaded_documents_file_type_check
    check (file_type in ('jpg', 'jpeg', 'png', 'pdf')),
  page_count integer not null default 1,
  status text not null default 'uploaded'
    constraint uploaded_documents_status_check
    check (status in ('uploaded', 'processing', 'ocr_complete', 'extraction_complete', 'needs_review', 'completed', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists idx_uploaded_documents_job on public.uploaded_documents (job_id);

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.uploaded_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_number integer not null,
  ocr_raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_document_pages_document on public.document_pages (document_id);

-- ---------------------------------------------------------------------------
-- Extracted records, validation, corrections
-- ---------------------------------------------------------------------------
create table if not exists public.extraction_records (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.extraction_jobs(id) on delete cascade,
  document_page_id uuid not null references public.document_pages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'extracted'
    constraint extraction_records_status_check
    check (status in ('extracted', 'needs_review', 'missing', 'ambiguous', 'invalid', 'user_corrected', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_extraction_records_job on public.extraction_records (job_id);
create index if not exists idx_extraction_records_page on public.extraction_records (document_page_id);

create table if not exists public.extracted_fields (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.extraction_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field_key text not null,
  value text,
  confidence numeric,
  status text not null default 'extracted'
    constraint extracted_fields_status_check
    check (status in ('extracted', 'needs_review', 'missing', 'ambiguous', 'invalid', 'user_corrected')),
  original_ai_value text,
  created_at timestamptz not null default now()
);
create index if not exists idx_extracted_fields_record on public.extracted_fields (record_id);

create table if not exists public.validation_issues (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.extraction_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field_key text,
  issue_type text not null
    constraint validation_issues_issue_type_check
    check (issue_type in ('missing', 'invalid_date', 'invalid_time', 'math_mismatch', 'duplicate')),
  message text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_validation_issues_record on public.validation_issues (record_id);

create table if not exists public.user_corrections (
  id uuid primary key default gen_random_uuid(),
  extracted_field_id uuid not null references public.extracted_fields(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_value text,
  new_value text,
  corrected_at timestamptz not null default now()
);
create index if not exists idx_user_corrections_field on public.user_corrections (extracted_field_id);

-- ---------------------------------------------------------------------------
-- Exports
-- ---------------------------------------------------------------------------
create table if not exists public.export_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.extraction_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_export_files_job on public.export_files (job_id);

-- ---------------------------------------------------------------------------
-- Row level security: every table is limited to the owning user
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare
  t text;
begin
  foreach t in array array[
    'extraction_jobs', 'workbook_files', 'workbook_sheets', 'workbook_columns',
    'extraction_instructions', 'extraction_schemas', 'extraction_fields',
    'uploaded_documents', 'document_pages', 'extraction_records',
    'extracted_fields', 'validation_issues', 'user_corrections', 'export_files'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: three private buckets, each user confined to their own top folder
-- (object paths are <user id>/<job id>/<file>)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('original-workbooks', 'original-workbooks', false),
  ('source-documents', 'source-documents', false),
  ('generated-exports', 'generated-exports', false)
on conflict (id) do nothing;

drop policy if exists "own workbook files" on storage.objects;
create policy "own workbook files" on storage.objects
  for all
  using (bucket_id = 'original-workbooks' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'original-workbooks' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own source documents" on storage.objects;
create policy "own source documents" on storage.objects
  for all
  using (bucket_id = 'source-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'source-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own export files" on storage.objects;
create policy "own export files" on storage.objects
  for all
  using (bucket_id = 'generated-exports' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'generated-exports' and (storage.foldername(name))[1] = auth.uid()::text);
