-- 2026-11-13 價目設定加「紀念品成本及供應商」（kind = product，按 Shopify SKU）
-- 初始資料（含成本）不放公開 repo：請執行 OneDrive「Resoul 寵物善終/SQL/data_20261113_product_costs.sql」（已包括以下結構改動）。
alter table public.price_settings add column if not exists vendor text;
alter table public.price_settings drop constraint if exists price_settings_kind_check;
alter table public.price_settings add constraint price_settings_kind_check check (kind in ('urn', 'referral', 'driver', 'product'));
