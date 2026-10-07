-- ============================================================
-- 遷移：紀念品訂單專案編號（2026-10-07）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（安全，可重複執行）
-- 說明：product_orders 加 project_no。後台同步訂單、Shopify webhook 或打開「紀念品訂單」頁時，
--       未有編號的訂單會自動補上：訂單已帶 RSL 編號（連結原有專案）就沿用，否則產生新的 RSL 編號。已有的編號不會更改。
-- ============================================================

alter table public.product_orders add column if not exists project_no text;
create index if not exists product_orders_project_no_idx on public.product_orders (project_no);
