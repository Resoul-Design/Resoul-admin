-- ============================================================
-- 遷移：任務指派（tasks）
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- 前置：需已建立 staff / shifts / cremation_bookings（見 schema.sql）
-- ============================================================

create table if not exists public.tasks (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text        not null,
  detail      text,
  booking_id  uuid        references public.cremation_bookings(id) on delete set null,
  assignee    uuid        references public.staff(id) on delete set null,
  due_date    date,
  status      text        not null default 'todo' check (status in ('todo','doing','done')),
  created_by  uuid        references public.staff(id) on delete set null
);
create index if not exists tasks_status_idx on public.tasks (status, due_date);

alter table public.tasks enable row level security;
drop policy if exists "staff rw tasks" on public.tasks;
create policy "staff rw tasks" on public.tasks
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
