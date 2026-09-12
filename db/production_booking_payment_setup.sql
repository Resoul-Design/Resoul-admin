-- ============================================================
-- RESOUL production setup: public booking submissions + payment tracking
-- 用法：Supabase 專案 (diyxcxkgvqvyrstrzttq) → SQL Editor → 貼上全部 → Run
-- 安全：可重複執行；不會刪除現有 booking。
-- 目的：
--   1) 允許 resoul-landing 前台公開提交 booking
--   2) 加入付款追蹤欄位，讓 Shopify orders/paid webhook 可更新狀態
-- ============================================================

-- 1) 付款追蹤欄位 ------------------------------------------------
alter table public.cremation_bookings
  add column if not exists payment_ref text,
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','failed','refunded')),
  add column if not exists payment_amount numeric(12, 2),
  add column if not exists payment_currency text,
  add column if not exists shopify_order_id text,
  add column if not exists shopify_order_name text,
  add column if not exists paid_at timestamptz;

create unique index if not exists cb_payment_ref_idx
  on public.cremation_bookings (payment_ref)
  where payment_ref is not null;

create index if not exists cb_payment_status_idx
  on public.cremation_bookings (payment_status, created_at desc);

-- 2) 公開表單提交保護 --------------------------------------------
create or replace function public.cb_before_insert_public()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'anon' then
    new.status     := 'new';
    new.amount     := null;
    new.cost       := null;
    new.case_no    := null;
    new.handled_by := null;
    new.service_time := null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_cb_public on public.cremation_bookings;
create trigger trg_cb_public
  before insert on public.cremation_bookings
  for each row execute function public.cb_before_insert_public();

drop policy if exists "public submit booking" on public.cremation_bookings;
create policy "public submit booking" on public.cremation_bookings
  for insert to anon with check (true);

-- 3) 快速檢查 -----------------------------------------------------
-- 執行後可以用以下查詢確認欄位存在：
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'cremation_bookings'
--   and column_name in ('payment_ref','payment_status','payment_amount','payment_currency','shopify_order_name','paid_at')
-- order by column_name;
