-- ============================================================
-- Google 評價：英文顯示名稱（2026-10-06）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（可重複執行）
-- 說明：英文版網站不顯示中文字。填寫後英文版用此名稱；留空時自動轉換
--       （「Jacky 的主人」→「Jacky's owner」），名稱為中文時顯示「A pet parent」。
-- ============================================================

alter table public.google_reviews
  add column if not exists display_name_en text not null default '';
