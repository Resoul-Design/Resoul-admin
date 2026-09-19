-- ============================================================
-- 遷移：將 Shopify 產品訂單同步到 Supabase，供後台直接查閱
-- 用法：Supabase -> SQL Editor -> 貼上全部 -> Run（安全，可重複執行）
-- ============================================================

create table if not exists public.product_orders (
  shopify_order_id       text primary key,
  order_name             text not null,
  shopify_created_at     timestamptz not null,
  shopify_updated_at     timestamptz,
  customer_name          text,
  email                  text,
  phone                  text,
  phone_key              text,
  financial_status       text,
  fulfillment_status     text,
  total_amount           numeric(12, 2) not null default 0,
  currency               text not null default 'HKD',
  line_items             jsonb not null default '[]'::jsonb,
  cancelled_at           timestamptz,
  synced_at              timestamptz not null default now()
);

create index if not exists product_orders_phone_idx
  on public.product_orders (phone_key, shopify_created_at desc);
create index if not exists product_orders_created_idx
  on public.product_orders (shopify_created_at desc);

alter table public.product_orders enable row level security;
drop policy if exists "staff read product orders" on public.product_orders;
create policy "staff read product orders" on public.product_orders
  for select to authenticated using (public.is_staff());

