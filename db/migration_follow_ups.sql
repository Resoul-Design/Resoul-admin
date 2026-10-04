-- ============================================================
-- 統一跟進記錄（2026-10-04）：火化服務、獸醫評估、紀念品訂單
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（可重複執行）
-- 說明：沿用接送服務的四類跟進（已付款未處理／付款失敗／隔日未付款／已提醒仍未付款）。
--       接送服務仍使用 deposit_bookings 上的跟進欄位（migration_deposit_followup.sql）。
--       此表只記錄跟進狀態，不改動預約或訂單資料。
-- ============================================================

create table if not exists public.follow_up_marks (
  entity           text        not null check (entity in ('cremation','vet','product')),
  ref              text        not null,          -- cremation_bookings.id，或 Shopify 訂單／草稿 gid
  reminded_at      timestamptz,                   -- 最近一次提醒（獸醫評估：最近一次聯絡）
  reminder_count   integer     not null default 0,
  contacted_at     timestamptz,                   -- 已付款後已聯絡安排（排期／出貨）
  closed_at        timestamptz,                   -- 不再跟進
  payment_link     text,
  payment_link_at  timestamptz,
  payment_draft_id text,
  updated_at       timestamptz not null default now(),
  primary key (entity, ref)
);

alter table public.follow_up_marks enable row level security;
revoke all on public.follow_up_marks from anon, authenticated;
grant all on public.follow_up_marks to service_role;
