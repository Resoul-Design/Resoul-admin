-- ============================================================
-- 遷移：後台優化（2026-10-07）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（安全，可重複執行）
-- 內容：
--   1. 測試記錄：接送、火化／獸醫評估、紀念品訂單加 is_test（Shopify 測試訂單自動標記，亦可在後台手動標記）。
--      測試記錄不會計入收入、報表及跟進，列表預設隱藏。
--   2. 網站內容版本記錄：每次儲存前保留上一版本，可在後台還原。
--   3. 客戶檔案合併：同一位客人用過不同電話或名稱時，可合併為一個檔案。
--   新資料表只經後台伺服器（service_role）讀寫；不開放 anon／authenticated 直接存取。
-- ============================================================

alter table public.deposit_bookings   add column if not exists is_test boolean not null default false;
alter table public.cremation_bookings add column if not exists is_test boolean not null default false;
alter table public.product_orders     add column if not exists is_test boolean not null default false;

create table if not exists public.site_content_versions (
  id         bigserial   primary key,
  key        text        not null,
  data       jsonb       not null,
  saved_at   timestamptz not null default now(),
  saved_by   text
);
create index if not exists site_content_versions_key_idx on public.site_content_versions (key, saved_at desc);
alter table public.site_content_versions enable row level security;
revoke all on public.site_content_versions from anon, authenticated;

create table if not exists public.customer_aliases (
  alias_key   text        primary key,
  primary_key text        not null,
  created_at  timestamptz not null default now(),
  created_by  text
);
create index if not exists customer_aliases_primary_idx on public.customer_aliases (primary_key);
alter table public.customer_aliases enable row level security;
revoke all on public.customer_aliases from anon, authenticated;
