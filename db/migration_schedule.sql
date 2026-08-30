-- ============================================================
-- 遷移：為預約火化加入「服務時間」欄（安排火化服務用）
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

alter table public.cremation_bookings
  add column if not exists service_time time;
