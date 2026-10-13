-- Marks an uploaded document whose original file and read text have been
-- removed under the retention policy (30 days after the job was last
-- changed). The row itself stays, so the job still shows what was processed
-- and the extracted records keep their link to it. Additive.

alter table public.uploaded_documents
  add column if not exists purged_at timestamptz;

create index if not exists idx_uploaded_documents_unpurged
  on public.uploaded_documents (job_id) where purged_at is null;
