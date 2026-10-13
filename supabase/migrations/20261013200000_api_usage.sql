-- A log of calls to the expensive endpoints (OCR, AI extraction, AI field
-- proposals), used to rate-limit each user. Additive: nothing is changed or removed.

create table if not exists public.api_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null
    constraint api_usage_action_check check (action in ('ocr', 'extract', 'schema')),
  created_at timestamptz not null default now()
);

create index if not exists idx_api_usage_user_action_time
  on public.api_usage (user_id, action, created_at desc);

alter table public.api_usage enable row level security;

-- Users may add to and read their own log, but not edit or delete it —
-- otherwise the limit could be reset by deleting rows.
drop policy if exists "read own usage" on public.api_usage;
create policy "read own usage" on public.api_usage
  for select using (auth.uid() = user_id);

drop policy if exists "record own usage" on public.api_usage;
create policy "record own usage" on public.api_usage
  for insert with check (auth.uid() = user_id);
