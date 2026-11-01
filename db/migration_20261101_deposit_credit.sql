-- 接送訂金抵扣：已付的接送訂金可套用於一張火化預約或一張紀念品草稿訂單（每筆訂金只可使用一次）
-- 請於 Supabase（diyxcx）SQL Editor 執行；可重複執行。

alter table public.deposit_bookings
  add column if not exists credit_target text,            -- 'cremation:<預約 id>' 或 'draft:gid://shopify/DraftOrder/...'
  add column if not exists credit_amount numeric(12,2),
  add column if not exists credit_applied_at timestamptz;

-- 每張單只可套用一筆訂金
create unique index if not exists deposit_bookings_credit_target_key
  on public.deposit_bookings (credit_target) where credit_target is not null;

alter table public.cremation_bookings
  add column if not exists deposit_credit numeric(12,2),
  add column if not exists deposit_credit_ref uuid references public.deposit_bookings(id) on delete set null;

notify pgrst, 'reload schema';
