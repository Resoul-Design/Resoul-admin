-- ============================================================
-- 遷移：員工功能權限（RBAC）
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

-- 每位員工可存取的功能清單（模組 key 陣列）；管理員自動擁有全部
alter table public.staff
  add column if not exists permissions text[] not null default '{}';

-- 排更表：所有在職員工可提交與檢視（原本只限管理員）
drop policy if exists "staff read shifts" on public.shifts;
drop policy if exists "admin manage shifts" on public.shifts;
drop policy if exists "staff rw shifts" on public.shifts;
create policy "staff rw shifts" on public.shifts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
