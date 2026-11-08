-- 客戶資料附加單：Excel「66B」等（同一客人之後再加的骨灰盅存放、紀念品單）附在原單號。
-- 每項 { "ref": "66B", "fields": { 欄位代號: 值 }, "source_row": Excel 行號 }，欄位代號與 lib/logistics-fields.ts 相同。
alter table public.logistics_orders
  add column if not exists extra_orders jsonb not null default '[]'::jsonb;
