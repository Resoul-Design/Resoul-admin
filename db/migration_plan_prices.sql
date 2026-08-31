-- ============================================================
-- 遷移：方案定價（自動計算火化收入/成本）
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

create table if not exists public.plan_prices (
  plan  text primary key,
  price numeric(12, 2) not null default 0,
  cost  numeric(12, 2) not null default 0
);

insert into public.plan_prices (plan) values ('風之旅'), ('雲之旅'), ('星之旅')
  on conflict (plan) do nothing;

alter table public.plan_prices enable row level security;
drop policy if exists "staff read prices" on public.plan_prices;
drop policy if exists "admin manage prices" on public.plan_prices;
create policy "staff read prices"   on public.plan_prices for select to authenticated using (public.is_staff());
create policy "admin manage prices" on public.plan_prices for all    to authenticated using (public.is_admin()) with check (public.is_admin());
