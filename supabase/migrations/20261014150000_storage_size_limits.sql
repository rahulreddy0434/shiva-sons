-- Uploads of timecards now go from the browser straight to storage, so the
-- size limits are enforced by the buckets themselves as well as by the app.
-- Keep these in step with lib/documents/validate-upload.ts (20 MB per
-- document) and lib/excel/limits.ts (4 MB per template). Additive: only the
-- limits change.

update storage.buckets set file_size_limit = 20 * 1024 * 1024 where id = 'source-documents';
update storage.buckets set file_size_limit = 4 * 1024 * 1024 where id = 'original-workbooks';
