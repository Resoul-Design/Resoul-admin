-- 2026-11-09：紀念品多產品列、產品狀態、後台取消及退款記錄。可重複執行。

-- 1) 紀念品訂單的產品狀態（已訂購／待交付／已完成）。null＝未人手設定，按 Shopify 出貨狀態對應，舊單不受影響。
alter table public.product_orders add column if not exists memorial_status text;

-- 2) 紀念品產品列：同一單號可有多行（Excel「Memorial Product Order Tracking」、Shopify 項目、後台新增）
create table if not exists public.memorial_product_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_no integer not null,
  extra_ref text,                         -- 附加單號（例如 66B）
  pet_name text,
  product_name text not null,
  variant_title text,
  variant_id text,                        -- Shopify 款式 ID（由產品清單揀選時）
  product_code text,
  vendor text,
  quantity numeric not null default 1,
  unit_price numeric,
  amount numeric,
  status text not null default 'ordered', -- ordered／pending_delivery／completed；其他值視為舊狀態照原文顯示
  status_note text,                       -- Excel 原有狀態文字
  customer_order_date date,
  completed_on date,
  delivered_to_vendor_on date,
  vendor_returned_on date,
  cost numeric,
  remarks text,
  source text not null default 'manual',  -- manual／excel／shopify／company_order
  source_ref text,                        -- Shopify 訂單 GID 或 company:<id>
  source_row integer,                     -- Excel 行號
  sync_status text not null default 'none' check (sync_status in ('none', 'pending', 'syncing', 'synced', 'failed')),
  sync_error text,
  shopify_ref text,                       -- Shopify 草稿／訂單號（例如 #D72）
  shopify_draft_id text,
  invoice_url text,
  target_company_id uuid,
  synced_at timestamptz,
  sort_order integer not null default 0,
  raw_row jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memorial_product_lines_invoice_idx on public.memorial_product_lines (invoice_no, sort_order);
create index if not exists memorial_product_lines_source_ref_idx on public.memorial_product_lines (source_ref);
create unique index if not exists memorial_product_lines_excel_row_idx on public.memorial_product_lines (source_row) where source = 'excel';
alter table public.memorial_product_lines enable row level security;
drop policy if exists "staff read memorial lines" on public.memorial_product_lines;
create policy "staff read memorial lines" on public.memorial_product_lines for select to authenticated using (public.is_staff());

-- 3) 取消及退款記錄（不刪除原有單據）
create table if not exists public.order_cancellations (
  id uuid primary key default gen_random_uuid(),
  entity text not null,                   -- deposit／cremation／product／company
  entity_id text not null,
  invoice_no integer,
  amount numeric,
  reason text,
  refund_mode text not null default 'none' check (refund_mode in ('none', 'manual', 'shopify')),
  refund_status text not null default 'not_required' check (refund_status in ('not_required', 'pending', 'refunded')),
  shopify_order_id text,
  shopify_draft_id text,
  created_by text,
  created_at timestamptz not null default now(),
  refunded_at timestamptz,
  refunded_by text
);
create unique index if not exists order_cancellations_entity_idx on public.order_cancellations (entity, entity_id);
create index if not exists order_cancellations_order_idx on public.order_cancellations (shopify_order_id);
alter table public.order_cancellations enable row level security;
drop policy if exists "staff read cancellations" on public.order_cancellations;
create policy "staff read cancellations" on public.order_cancellations for select to authenticated using (public.is_staff());
