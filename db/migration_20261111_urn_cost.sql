-- 客戶資料：骨灰龕成本（毛利扣除）。只新增可留空的欄位，不改任何既有資料。
alter table public.logistics_orders add column if not exists urn_cost numeric;
