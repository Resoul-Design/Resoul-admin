-- ============================================================
-- 火化進度及骨灰交還追蹤（2026-10-03）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（可重複執行）
-- 內容：
--   1. cremation_bookings 新增各階段時間：已接送、火化中、可取回、已交還，以及簽收人
--   2. 狀態新增 ready（可取回）；pickup 在後台顯示為「已接送」，completed 代表已交還／已完成
-- ============================================================

alter table public.cremation_bookings
  add column if not exists picked_up_at         timestamptz,  -- 已接送
  add column if not exists cremation_started_at timestamptz,  -- 火化中
  add column if not exists ready_at             timestamptz,  -- 可取回
  add column if not exists returned_at          timestamptz,  -- 已交還
  add column if not exists returned_to          text;         -- 簽收人

-- 重建狀態檢查（只處理 status 欄，不影響 payment_status 等其他檢查）
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.cremation_bookings'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like 'CHECK ((status %'
  loop
    execute format('alter table public.cremation_bookings drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.cremation_bookings
  add constraint cremation_bookings_status_check
  check (status in ('new','scheduled','pickup','cremating','ready','completed','cancelled'));

-- 方便列出「可取回未交還」
create index if not exists cb_ready_idx on public.cremation_bookings (ready_at) where returned_at is null;
