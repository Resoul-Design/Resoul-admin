-- ============================================================
-- 遷移：預約火化加入專案編號與財務欄位
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

alter table public.cremation_bookings
  add column if not exists case_no text,                 -- 專案編號
  add column if not exists amount  numeric(12, 2),       -- 收入
  add column if not exists cost    numeric(12, 2);       -- 成本

create index if not exists cb_case_no_idx on public.cremation_bookings (case_no);
