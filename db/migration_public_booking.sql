-- ============================================================
-- 遷移：允許消費者網站公開提交預約火化 / 安樂死
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- 安全：公開提交一律 status='new'，並清空金額/成本/專案編號等內部欄
-- ============================================================

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
