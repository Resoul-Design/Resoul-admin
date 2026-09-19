-- ============================================================
-- RESOUL 後台（resoul-admin）完整 schema — 供客戶 diyxcx 執行
-- 用法：diyxcx Supabase → SQL Editor → 貼上全部 → Run（大致 idempotent）
-- 目的：令後台可連客戶 project，前後台統一。
-- 生成：schema.sql + 全部 migration_*.sql（按序）
-- ============================================================


-- ===================== schema.sql =====================

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
  status      text        not null default 'pending' check (status in ('pending','approved')),
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

-- ===================== migration_public_booking.sql =====================

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

-- ===================== migration_booking_fields.sql =====================

-- ============================================================
-- 遷移：預約火化加入專案編號與財務欄位
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

alter table public.cremation_bookings
  add column if not exists case_no text,                 -- 專案編號
  add column if not exists amount  numeric(12, 2),       -- 收入
  add column if not exists cost    numeric(12, 2);       -- 成本

create index if not exists cb_case_no_idx on public.cremation_bookings (case_no);

-- ===================== migration_payment_tracking.sql =====================

-- ============================================================
-- 遷移：預約付款追蹤 + Shopify paid webhook 對應欄位
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

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

-- ===================== migration_plan_prices.sql =====================

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

-- ===================== migration_permissions.sql =====================

-- ============================================================
-- 遷移：員工功能權限（RBAC）
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

-- 每位員工可存取的功能清單（模組 key 陣列）；管理員自動擁有全部
alter table public.staff
  add column if not exists permissions text[] not null default '{}';

-- 排更表：所有在職員工可提交與檢視（原本只限管理員）
drop policy if exists "staff read shifts" on public.shifts;
drop policy if exists "admin manage shifts" on public.shifts;
drop policy if exists "staff rw shifts" on public.shifts;
create policy "staff rw shifts" on public.shifts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ===================== migration_schedule.sql =====================

-- ============================================================
-- 遷移：為預約火化加入「服務時間」欄（安排火化服務用）
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

alter table public.cremation_bookings
  add column if not exists service_time time;

-- ===================== migration_shift_approval.sql =====================

-- ============================================================
-- 遷移：排更審批流程（shifts.status）
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

alter table public.shifts
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved'));

-- 既有更表視為已批准
update public.shifts set status = 'approved' where status = 'pending';

-- ===================== migration_staff_tasks.sql =====================

-- ============================================================
-- 遷移：任務指派（tasks）
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- 前置：需已建立 staff / shifts / cremation_bookings（見 schema.sql）
-- ============================================================

create table if not exists public.tasks (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text        not null,
  detail      text,
  booking_id  uuid        references public.cremation_bookings(id) on delete set null,
  assignee    uuid        references public.staff(id) on delete set null,
  due_date    date,
  status      text        not null default 'todo' check (status in ('todo','doing','done')),
  created_by  uuid        references public.staff(id) on delete set null
);
create index if not exists tasks_status_idx on public.tasks (status, due_date);

alter table public.tasks enable row level security;
drop policy if exists "staff rw tasks" on public.tasks;
create policy "staff rw tasks" on public.tasks
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ===================== migration_project_entries.sql =====================

-- ============================================================
-- 遷移：專案收支明細 + 文件上載
-- 用法：Supabase → SQL Editor → 貼上 → Run（安全，可重複執行）
-- ============================================================

create table if not exists public.project_entries (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  booking_id  uuid        not null references public.cremation_bookings(id) on delete cascade,
  kind        text        not null check (kind in ('income','expense')),  -- 收入 / 支出
  description text        not null,
  amount      numeric(12, 2) not null default 0,
  entry_date  date        not null default current_date,
  file_path   text,                                   -- Storage 內文件路徑（收據等）
  created_by  uuid        references public.staff(id) on delete set null
);
create index if not exists pe_booking_idx on public.project_entries (booking_id);

alter table public.project_entries enable row level security;
drop policy if exists "staff rw entries" on public.project_entries;
create policy "staff rw entries" on public.project_entries
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- 私密文件 bucket（收據/單據）
insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', false)
on conflict (id) do nothing;

drop policy if exists "staff read project-files"  on storage.objects;
drop policy if exists "staff write project-files" on storage.objects;
drop policy if exists "staff del project-files"   on storage.objects;
create policy "staff read project-files"  on storage.objects for select to authenticated
  using (bucket_id = 'project-files' and public.is_staff());
create policy "staff write project-files" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and public.is_staff());
create policy "staff del project-files"   on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and public.is_staff());

-- ===================== migration_import_legacy_finance.sql =====================

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

-- ===================== migration_product_orders.sql =====================

create table if not exists public.product_orders (
  shopify_order_id text primary key,
  order_name text not null,
  shopify_created_at timestamptz not null,
  shopify_updated_at timestamptz,
  customer_name text,
  email text,
  phone text,
  phone_key text,
  financial_status text,
  fulfillment_status text,
  total_amount numeric(12, 2) not null default 0,
  currency text not null default 'HKD',
  line_items jsonb not null default '[]'::jsonb,
  cancelled_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists product_orders_phone_idx
  on public.product_orders (phone_key, shopify_created_at desc);
create index if not exists product_orders_created_idx
  on public.product_orders (shopify_created_at desc);

alter table public.product_orders enable row level security;
drop policy if exists "staff read product orders" on public.product_orders;
create policy "staff read product orders" on public.product_orders
  for select to authenticated using (public.is_staff());
