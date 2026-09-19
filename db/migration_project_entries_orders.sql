-- 讓「專案收支明細」除了火化預約（booking_id）外，也可連結到產品訂單（order_ref）。
-- 於 Supabase → SQL Editor 貼上並 Run 一次（可重複執行）。

-- 1) booking_id 由 NOT NULL 改為可空（產品專案不需要 booking_id）
alter table public.project_entries alter column booking_id drop not null;

-- 2) 新增 order_ref 欄，存放產品訂單識別碼（Shopify order 的 gid 或 order_name）
alter table public.project_entries add column if not exists order_ref text;

-- 3) 至少要連結到其中一方（火化預約或產品訂單）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pe_ref_present'
  ) then
    alter table public.project_entries
      add constraint pe_ref_present check (booking_id is not null or order_ref is not null);
  end if;
end $$;

-- 4) order_ref 索引，加快按產品訂單查明細
create index if not exists pe_order_ref_idx on public.project_entries (order_ref);
