-- ============================================================
-- 遷移：服務後邀請評價（2026-10-08）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（安全，可重複執行）
-- 說明：記錄已邀請（或略過）Google 評價的接送／火化記錄；同一電話之後不會再列出。
--       只經後台伺服器（service_role）讀寫；不開放 anon／authenticated 直接存取。
-- ============================================================

create table if not exists public.review_invites (
  entity      text        not null check (entity in ('cremation', 'deposit')),
  ref         text        not null,
  phone_key   text,
  skipped     boolean     not null default false,
  invited_at  timestamptz not null default now(),
  invited_by  text,
  primary key (entity, ref)
);
create index if not exists review_invites_phone_idx on public.review_invites (phone_key);
alter table public.review_invites enable row level security;
revoke all on public.review_invites from anon, authenticated;
