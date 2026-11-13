-- 2026-11-13 客戶資料「骨灰龕」組新增骨灰龕供應商（按價目設定的骨灰龕供應商自動填入）
alter table public.logistics_orders add column if not exists urn_supplier text;
-- 價目設定的骨灰龕供應商使用 price_settings.vendor（如未有此欄一併加入）
alter table public.price_settings add column if not exists vendor text;
