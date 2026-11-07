-- 公司發票編號（invoice_no）、接送訂金流水及統一「開新單」記錄
-- 請於 Supabase（diyxcx）SQL Editor 執行；可重複執行。
--
-- 規則
--   • 對外單號／發票編號＝公司自有流水整數 invoice_no（例如 290），同一專案（RSL- 或自訂專案編號）共用一個編號。
--   • 新專案（網站預約、後台開新單、網上商店訂單）的專案編號＝單號（例如專案 290 的單號亦是 290）；舊 RSL- 專案維持不變。
--   • Shopify 訂單號／名稱／GID 只作內部參考，不會寫入 invoice_no。
--   • 接送訂金收取、抵扣及餘額一律以 invoice_no 記入 deposit_ledger（由資料庫觸發器自動記錄，網站及後台流程毋須改動）。
--
-- ⚠️ 執行前請確認下面「最後已用的公司單號」：新單號會由此數字之後開始（現時設為 289）。

-- 1. 編號來源 ---------------------------------------------------------------
create sequence if not exists public.company_invoice_no_seq minvalue 1;

create table if not exists public.company_invoices (
  invoice_no integer primary key,
  project_no text unique,                   -- 同一專案共用；沒有專案編號的記錄為 null
  manual boolean not null default false,    -- 人手指定或修正
  note text,
  created_at timestamptz not null default now()
);
alter table public.company_invoices enable row level security;

-- 備註內的專案編號（舊記錄的 case_no 可能為空）
create or replace function public.project_no_from_notes(p_notes text)
returns text language sql immutable set search_path = public as $$
  select nullif(btrim((regexp_match(coalesce(p_notes, ''), '(?:專案編號|Project no\.)[：:]\s*([^｜|]+)', 'i'))[1]), '')
$$;

-- 取得（或建立）專案的公司單號；同時有兩個請求時亦只會產生一個編號
create or replace function public.company_invoice_for_project(p_project text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_project text := nullif(upper(btrim(coalesce(p_project, ''))), '');
  v_no integer;
begin
  if v_project is not null then
    select invoice_no into v_no from company_invoices where project_no = v_project;
    if v_no is not null then return v_no; end if;
  end if;
  loop
    v_no := nextval('company_invoice_no_seq');
    begin
      insert into company_invoices (invoice_no, project_no) values (v_no, v_project);
      return v_no;
    exception when unique_violation then
      -- 另一交易剛為同一專案建立了編號；或此數字已被人手使用，取下一個
      if v_project is not null then
        select invoice_no into v_no from company_invoices where project_no = v_project;
        if v_no is not null then return v_no; end if;
      end if;
    end;
  end loop;
end $$;

-- 新專案：取下一個單號，並以同一數字作專案編號（例如 290）
create or replace function public.new_company_project()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_no integer;
begin
  loop
    v_no := nextval('company_invoice_no_seq');
    begin
      insert into company_invoices (invoice_no, project_no) values (v_no, v_no::text);
      return v_no;
    exception when unique_violation then
      null; -- 此數字（或同名專案編號）已被人手使用，取下一個
    end;
  end loop;
end $$;

-- 網上商店訂單未有專案：以新單號作專案編號（同一訂單同時收到多個通知亦只會配一次）
create or replace function public.assign_new_project_to_product_order(p_order_id text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_current text;
  v_no integer;
begin
  select project_no into v_current from product_orders where shopify_order_id::text = p_order_id for update;
  if not found then return null; end if;
  if nullif(btrim(v_current), '') is not null then return v_current; end if;
  v_no := new_company_project();
  update product_orders set project_no = v_no::text where shopify_order_id::text = p_order_id;
  return v_no::text;
end $$;

-- 管理員人手修正單號（同一專案的所有記錄及流水一併更新）
create or replace function public.set_company_invoice_no(p_old integer, p_new integer, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_new is null or p_new < 1 then raise exception 'invalid invoice number'; end if;
  if p_old = p_new then return; end if;
  if exists (select 1 from company_invoices where invoice_no = p_new) then
    raise exception 'invoice number % is already used', p_new using errcode = '23505';
  end if;
  update company_invoices set invoice_no = p_new, manual = true, note = left(p_note, 500) where invoice_no = p_old;
  if not found then raise exception 'invoice number % not found', p_old; end if;
  update deposit_bookings set invoice_no = p_new where invoice_no = p_old;
  update cremation_bookings set invoice_no = p_new where invoice_no = p_old;
  update product_orders set invoice_no = p_new where invoice_no = p_old;
  update company_orders set invoice_no = p_new where invoice_no = p_old;
  update deposit_ledger set invoice_no = p_new where invoice_no = p_old;
  -- 人手用了較大的數字時，之後自動編號由其後開始，避免撞號
  perform setval('company_invoice_no_seq', greatest(p_new, (select last_value from company_invoice_no_seq)), true);
end $$;

-- 2. 各記錄的單號欄 ---------------------------------------------------------
alter table public.deposit_bookings add column if not exists invoice_no integer;
alter table public.cremation_bookings add column if not exists invoice_no integer;
alter table public.product_orders add column if not exists invoice_no integer;
create index if not exists deposit_bookings_invoice_no_idx on public.deposit_bookings (invoice_no);
create index if not exists cremation_bookings_invoice_no_idx on public.cremation_bookings (invoice_no);
create index if not exists product_orders_invoice_no_idx on public.product_orders (invoice_no);

-- 3. 統一「開新單」記錄（類型細節放 details；Shopify 只作參考欄）-------------
create table if not exists public.company_orders (
  id uuid primary key default gen_random_uuid(),
  client_token uuid unique,                -- 防止重覆提交
  invoice_no integer not null,
  project_no text not null,
  order_type text not null check (order_type in ('cremation', 'vet', 'deposit', 'product', 'other')),
  status text not null default 'draft' check (status in ('draft', 'awaiting_payment', 'paid', 'cancelled')),
  customer_name text not null,
  phone text,
  phone_key text,
  email text,
  pet_name text,
  referrer_phone text,
  amount numeric(12,2),
  payment_intent text not null default 'link' check (payment_intent in ('link', 'received')),
  payment_ref text not null,
  details jsonb not null default '{}'::jsonb,
  linked_table text check (linked_table in ('deposit_bookings', 'cremation_bookings')),
  linked_id uuid,
  shopify_draft_id text,
  shopify_invoice_url text,
  shopify_order_id text,
  sync_error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_orders_invoice_no_idx on public.company_orders (invoice_no);
create index if not exists company_orders_phone_key_idx on public.company_orders (phone_key);
alter table public.company_orders enable row level security;

-- 4. 自動配單號：新增記錄或改專案編號時，按專案取得公司單號 --------------------
create or replace function public.assign_invoice_no()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new text;
  v_old text;
begin
  if tg_table_name = 'cremation_bookings' then
    v_new := coalesce(nullif(btrim(new.case_no), ''), project_no_from_notes(new.notes));
    if tg_op = 'UPDATE' then v_old := coalesce(nullif(btrim(old.case_no), ''), project_no_from_notes(old.notes)); end if;
  else
    v_new := nullif(btrim(new.project_no), '');
    if tg_op = 'UPDATE' then v_old := nullif(btrim(old.project_no), ''); end if;
  end if;

  if tg_op = 'INSERT' then
    -- 網上商店訂單初時未有專案編號：等指派專案後才配單號
    if new.invoice_no is null and (v_new is not null or tg_table_name <> 'product_orders') then
      new.invoice_no := company_invoice_for_project(v_new);
    end if;
  elsif new.invoice_no is not distinct from old.invoice_no then
    -- 未有單號，或專案編號改了（例如「連結專案」）：跟隨該專案的單號；人手改單號時不干預
    if new.invoice_no is null and (v_new is not null or tg_table_name <> 'product_orders') then
      new.invoice_no := company_invoice_for_project(v_new);
    elsif v_new is not null and upper(v_new) is distinct from upper(coalesce(v_old, '')) then
      new.invoice_no := company_invoice_for_project(v_new);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists deposit_bookings_invoice_no on public.deposit_bookings;
create trigger deposit_bookings_invoice_no before insert or update on public.deposit_bookings
  for each row execute function public.assign_invoice_no();
drop trigger if exists cremation_bookings_invoice_no on public.cremation_bookings;
create trigger cremation_bookings_invoice_no before insert or update on public.cremation_bookings
  for each row execute function public.assign_invoice_no();
drop trigger if exists product_orders_invoice_no on public.product_orders;
create trigger product_orders_invoice_no before insert or update on public.product_orders
  for each row execute function public.assign_invoice_no();

-- 5. 接送訂金流水（invoice_no 必填；Shopify 訂單只作參考）--------------------
create table if not exists public.deposit_ledger (
  id bigint generated always as identity primary key,
  invoice_no integer not null,
  kind text not null check (kind in ('received', 'applied', 'released', 'refunded', 'adjustment')),
  amount numeric(12,2) not null,           -- 正數＝增加可扣餘額；負數＝扣減
  deposit_id uuid references public.deposit_bookings(id) on delete set null,
  target text,                             -- 抵扣到哪張單（cremation:<id> 或 draft:<gid>）
  shopify_order_id text,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists deposit_ledger_invoice_no_idx on public.deposit_ledger (invoice_no);
alter table public.deposit_ledger enable row level security;

-- 付款、退款、抵扣及取消抵扣時自動記錄（網站 webhook、人手收款及後台抵扣共用）
create or replace function public.deposit_ledger_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.invoice_no is null then return new; end if;
  if new.payment_status = 'paid' and (tg_op = 'INSERT' or old.payment_status is distinct from 'paid') then
    insert into deposit_ledger (invoice_no, kind, amount, deposit_id, shopify_order_id, note)
    values (new.invoice_no, 'received', coalesce(new.payment_amount, 0), new.id, new.shopify_order_id, '接送訂金已付款');
  end if;
  if tg_op = 'UPDATE' then
    -- 訂金改屬另一專案（例如連結專案）：流水跟隨新單號
    if old.invoice_no is not null and new.invoice_no is distinct from old.invoice_no then
      update deposit_ledger set invoice_no = new.invoice_no where deposit_id = new.id;
    end if;
    if old.payment_status = 'paid' and new.payment_status = 'refunded' then
      insert into deposit_ledger (invoice_no, kind, amount, deposit_id, shopify_order_id, note)
      values (new.invoice_no, 'refunded', -coalesce(old.payment_amount, 0), new.id, new.shopify_order_id, '接送訂金已退款');
    end if;
    if new.credit_target is not null and old.credit_target is null then
      insert into deposit_ledger (invoice_no, kind, amount, deposit_id, target, note)
      values (new.invoice_no, 'applied', -coalesce(new.credit_amount, 0), new.id, new.credit_target, '接送訂金抵扣');
    elsif new.credit_target is null and old.credit_target is not null then
      insert into deposit_ledger (invoice_no, kind, amount, deposit_id, target, note)
      values (new.invoice_no, 'released', coalesce(old.credit_amount, 0), new.id, old.credit_target, '取消接送訂金抵扣');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists deposit_bookings_ledger on public.deposit_bookings;
create trigger deposit_bookings_ledger after insert or update on public.deposit_bookings
  for each row execute function public.deposit_ledger_sync();

-- 按單號的訂金餘額（只供後台以服務金鑰讀取）
create or replace view public.deposit_balances with (security_invoker = true) as
  select invoice_no,
         sum(amount) filter (where kind = 'received') as received,
         -sum(amount) filter (where kind in ('applied', 'released')) as applied,
         -sum(amount) filter (where kind = 'refunded') as refunded,
         sum(amount) as balance
  from public.deposit_ledger
  group by invoice_no;

-- 6. 權限：只限後台服務金鑰 ---------------------------------------------------
revoke all on public.company_invoices, public.company_orders, public.deposit_ledger, public.deposit_balances from anon, authenticated;
revoke execute on function public.company_invoice_for_project(text) from public, anon, authenticated;
revoke execute on function public.set_company_invoice_no(integer, integer, text) from public, anon, authenticated;
revoke execute on function public.assign_invoice_no() from public, anon, authenticated;
revoke execute on function public.deposit_ledger_sync() from public, anon, authenticated;
grant execute on function public.company_invoice_for_project(text) to service_role;
grant execute on function public.set_company_invoice_no(integer, integer, text) to service_role;
revoke execute on function public.new_company_project() from public, anon, authenticated;
revoke execute on function public.assign_new_project_to_product_order(text) from public, anon, authenticated;
grant execute on function public.new_company_project() to service_role;
grant execute on function public.assign_new_project_to_product_order(text) to service_role;

-- 7. 舊記錄背填 ----------------------------------------------------------------
-- 7a. 最後已用的公司單號（⚠️ 按實際修改；新單號由此數字 + 1 開始）
select setval('public.company_invoice_no_seq',
  greatest(289, coalesce((select max(invoice_no) from public.company_invoices), 0)), true);

-- 7b. Shopify 訂單備註已指定單號的舊單（由 Shopify 讀取後產生）
insert into public.company_invoices (invoice_no, project_no, manual, note) values
  (289, 'RSL-261107-522F5S5I', true, '由 Shopify #RS-1054 備註「Invoice No.：289」背填')
on conflict do nothing;

-- 7c. 其餘專案按最早建立次序配單號
do $$
declare r record;
begin
  for r in
    select project, min(created) as first_at from (
      select upper(btrim(project_no)) as project, created_at as created from public.deposit_bookings where nullif(btrim(project_no), '') is not null
      union all
      select upper(coalesce(nullif(btrim(case_no), ''), public.project_no_from_notes(notes))), created_at from public.cremation_bookings
      union all
      select upper(btrim(project_no)), shopify_created_at from public.product_orders where nullif(btrim(project_no), '') is not null
    ) x
    where project is not null
    group by project
    order by min(created), project
  loop
    perform public.company_invoice_for_project(r.project);
  end loop;
end $$;

-- 7d. 寫入各記錄（觸發器會按專案取同一單號；沒有專案編號的火化／獸醫記錄各自取新單號）
update public.deposit_bookings set invoice_no = public.company_invoice_for_project(project_no) where invoice_no is null;
update public.cremation_bookings set invoice_no = public.company_invoice_for_project(coalesce(nullif(btrim(case_no), ''), public.project_no_from_notes(notes))) where invoice_no is null;
update public.product_orders set invoice_no = public.company_invoice_for_project(project_no) where invoice_no is null and nullif(btrim(project_no), '') is not null;

-- 7e. 已付款的接送訂金及已套用的抵扣補入流水（只補未有流水的訂金）
insert into public.deposit_ledger (invoice_no, kind, amount, deposit_id, shopify_order_id, note, created_at)
select d.invoice_no, 'received', coalesce(d.payment_amount, 0), d.id, d.shopify_order_id, '背填：接送訂金已付款', coalesce(d.paid_at, d.created_at)
from public.deposit_bookings d
where d.payment_status = 'paid' and d.invoice_no is not null
  and not exists (select 1 from public.deposit_ledger l where l.deposit_id = d.id and l.kind = 'received');
insert into public.deposit_ledger (invoice_no, kind, amount, deposit_id, target, note, created_at)
select d.invoice_no, 'applied', -coalesce(d.credit_amount, 0), d.id, d.credit_target, '背填：接送訂金抵扣', coalesce(d.credit_applied_at, now())
from public.deposit_bookings d
where d.credit_target is not null and d.invoice_no is not null
  and not exists (select 1 from public.deposit_ledger l where l.deposit_id = d.id and l.kind = 'applied');

notify pgrst, 'reload schema';

-- 檢查（執行後應全部為 0）：
-- select count(*) from public.deposit_bookings where invoice_no is null;
-- select count(*) from public.cremation_bookings where invoice_no is null;
-- select count(*) from public.deposit_bookings d where d.payment_status = 'paid' and not exists (select 1 from public.deposit_ledger l where l.deposit_id = d.id);
