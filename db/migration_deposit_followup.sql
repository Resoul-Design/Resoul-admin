-- ============================================================
-- 遷移：接送訂金跟進（2026-10-01）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（安全，可重複執行）
-- 說明：
--   • reminded_at／reminder_count：同事標記「已提醒」的時間及次數，避免重複催客人。
--   • follow_up_closed_at：同事標記「不再跟進」的時間，之後不再出現在跟進清單。
--   • payment_link／payment_link_at／payment_draft_id：後台以 Shopify 草稿訂單重新產生的付款連結，
--     7 日內重用同一條，避免重複開草稿訂單。草稿訂單帶同一個 payment_ref，
--     客人付款後 orders/paid webhook 會照舊按 payment_ref 自動標記已付款。
-- ============================================================

alter table public.deposit_bookings
  add column if not exists reminded_at         timestamptz,
  add column if not exists reminder_count      integer not null default 0,
  add column if not exists follow_up_closed_at timestamptz,
  add column if not exists payment_link        text,
  add column if not exists payment_link_at     timestamptz,
  add column if not exists payment_draft_id    text;
