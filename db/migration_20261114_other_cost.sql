-- 2026-11-14 客戶資料「成本及利潤」新增其他費用及說明（毛利會扣除其他費用）
alter table public.logistics_orders add column if not exists other_cost numeric;
alter table public.logistics_orders add column if not exists other_cost_note text;
