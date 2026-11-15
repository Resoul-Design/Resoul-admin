-- 2026-11-16 轉介費付款：記錄已付轉介費的日期（空白＝未付）
alter table public.logistics_orders add column if not exists referral_paid_on date;
