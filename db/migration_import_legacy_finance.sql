-- ============================================================
-- 一次性：將舊有 booking.amount / cost 匯入專案明細（project_entries）
-- 用途：切換到「專案明細」為單一收支來源後，把之前自動填入的收入/成本保留
-- 用法：Supabase → SQL Editor → 貼上 → Run（可安全重複，不會重覆匯入）
-- ============================================================

insert into public.project_entries (booking_id, kind, description, amount, entry_date)
select b.id, 'income',
       '火化服務費' || coalesce('（' || b.plan || '）', ''),
       b.amount, coalesce(b.service_date, b.created_at::date)
from public.cremation_bookings b
where b.amount is not null and b.amount > 0
  and not exists (
    select 1 from public.project_entries pe
    where pe.booking_id = b.id and pe.kind = 'income'
  );

insert into public.project_entries (booking_id, kind, description, amount, entry_date)
select b.id, 'expense', '成本',
       b.cost, coalesce(b.service_date, b.created_at::date)
from public.cremation_bookings b
where b.cost is not null and b.cost > 0
  and not exists (
    select 1 from public.project_entries pe
    where pe.booking_id = b.id and pe.kind = 'expense'
  );
