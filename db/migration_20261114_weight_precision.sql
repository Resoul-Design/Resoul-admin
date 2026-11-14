-- 2026-11-14 體重保留原本的小數位（例如 0.072 公斤），不再進位到兩位小數
alter table public.logistics_orders alter column weight_kg type numeric using weight_kg::numeric;
