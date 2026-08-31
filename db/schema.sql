-- ============================================================
-- Resoul 後台管理系統（Admin）— Supabase Schema
-- 用法：Supabase 專案 → SQL Editor → 貼上全部 → Run
-- 涵蓋：員工/角色、預約火化記錄、員工排更；並為「留言板審核」加員工權限
-- 設計重點：員工登入（Supabase Auth）+ 角色（admin/staff）+ RLS 最小權限
-- 注意：本檔與消費者站的 posts 表共用同一個 Supabase 專案
-- ============================================================

-- 0) 共用工具：更新 updated_at ---------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

-- 1) 員工 / 角色 ------------------------------------------------
-- 每個後台使用者對應一個 auth.users；只有列在此表且 active 的人可進入後台
create table if not exists public.staff (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text        unique not null,
  name        text,
  role        text        not null default 'staff' check (role in ('admin','staff')),
  active      boolean     not null default true,
  permissions text[]      not null default '{}',   -- 可存取功能（模組 key）；管理員自動全部
  created_at  timestamptz not null default now()
);

-- 權限判斷輔助函數（SECURITY DEFINER 以繞過 staff 自身的 RLS 遞迴）
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s where s.id = auth.uid() and s.active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s where s.id = auth.uid() and s.active and s.role = 'admin');
$$;

alter table public.staff enable row level security;
-- 員工可讀員工名單；只有 admin 可增改員工
drop policy if exists "staff read"   on public.staff;
drop policy if exists "admin manage" on public.staff;
create policy "staff read"   on public.staff for select to authenticated using (public.is_staff());
create policy "admin manage" on public.staff for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- 2) 預約火化記錄（由 Google Sheet 搬入）------------------------
create table if not exists public.cremation_bookings (
  id             uuid        primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  case_no        text,                              -- 專案編號
  amount         numeric(12, 2),                    -- 收入
  cost           numeric(12, 2),                    -- 成本
  owner_name     text,                              -- 主人姓名
  contact        text,                              -- 電話 / WhatsApp
  pet_name       text,                              -- 毛孩名
  pet_type       text,                              -- 種類（貓/狗…）
  plan           text,                              -- 風之旅 / 雲之旅 / 星之旅
  service_date   date,                              -- 預約服務日期
  service_time   time,                              -- 預約服務時間
  pickup_address text,                              -- 接送地址
  status         text        not null default 'new'
                 check (status in ('new','scheduled','pickup','cremating','completed','cancelled')),
  source         text,                              -- web / whatsapp / partner:<code>
  notes          text,
  handled_by     uuid        references public.staff(id) on delete set null
);
create index if not exists cb_status_idx on public.cremation_bookings (status, service_date);
create index if not exists cb_created_idx on public.cremation_bookings (created_at desc);

drop trigger if exists trg_cb_touch on public.cremation_bookings;
create trigger trg_cb_touch before update on public.cremation_bookings
  for each row execute function public.touch_updated_at();

alter table public.cremation_bookings enable row level security;
drop policy if exists "staff rw bookings" on public.cremation_bookings;
create policy "staff rw bookings" on public.cremation_bookings
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 3) 員工排更（Phase 2，先建表）--------------------------------
create table if not exists public.shifts (
  id          uuid        primary key default gen_random_uuid(),
  staff_id    uuid        not null references public.staff(id) on delete cascade,
  shift_date  date        not null,
  start_time  time,
  end_time    time,
  role_note   text,                                 -- 崗位 / 備註（接送、火化、店務…）
  created_at  timestamptz not null default now()
);
create index if not exists shifts_date_idx on public.shifts (shift_date);

alter table public.shifts enable row level security;
-- 所有在職員工可提交與檢視班表
drop policy if exists "staff read shifts"  on public.shifts;
drop policy if exists "admin manage shifts" on public.shifts;
drop policy if exists "staff rw shifts" on public.shifts;
create policy "staff rw shifts" on public.shifts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 4) 留言板審核：為已登入員工加更新/刪除權限 --------------------
-- （消費者站的 posts 表原本只准 anon 讀 visible / 新增；審核在此開放給員工）
drop policy if exists "staff read all posts"  on public.posts;
drop policy if exists "staff update posts"    on public.posts;
drop policy if exists "staff delete posts"    on public.posts;
create policy "staff read all posts" on public.posts for select to authenticated using (public.is_staff());
create policy "staff update posts"   on public.posts for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff delete posts"   on public.posts for delete to authenticated using (public.is_staff());

-- ============================================================
-- 完成。後續步驟：
-- 1) Authentication → Users 建立員工帳戶（或用邀請），
--    再 insert into public.staff (id, email, name, role) 對應 auth 使用者 id。
-- 2) 首位管理員設 role='admin'。
-- 3) 訂單 / 庫存 / 文章 走 Shopify Admin API（見 resoul-admin/README.md）。
-- ============================================================
