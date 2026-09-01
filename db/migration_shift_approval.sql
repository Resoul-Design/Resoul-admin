-- ============================================================
-- 遷移：排更審批流程（shifts.status）
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

alter table public.shifts
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved'));

-- 既有更表視為已批准
update public.shifts set status = 'approved' where status = 'pending';
