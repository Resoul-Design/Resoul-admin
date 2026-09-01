-- ============================================================
-- 遷移：專案收支明細 + 文件上載
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

create table if not exists public.project_entries (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  booking_id  uuid        not null references public.cremation_bookings(id) on delete cascade,
  kind        text        not null check (kind in ('income','expense')),  -- 收入 / 支出
  description text        not null,
  amount      numeric(12, 2) not null default 0,
  entry_date  date        not null default current_date,
  file_path   text,                                   -- Storage 內文件路徑（收據等）
  created_by  uuid        references public.staff(id) on delete set null
);
create index if not exists pe_booking_idx on public.project_entries (booking_id);

alter table public.project_entries enable row level security;
drop policy if exists "staff rw entries" on public.project_entries;
create policy "staff rw entries" on public.project_entries
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 私密文件 bucket（收據/單據）
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

drop policy if exists "staff read project-files"  on storage.objects;
drop policy if exists "staff write project-files" on storage.objects;
drop policy if exists "staff del project-files"   on storage.objects;
create policy "staff read project-files"  on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.is_staff());
create policy "staff write project-files" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.is_staff());
create policy "staff del project-files"   on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and public.is_staff());
