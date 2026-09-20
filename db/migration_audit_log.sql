-- 審計記錄：紀錄後台的重要操作（刪除、改狀態、改員工等）。
-- 於 Supabase → SQL Editor 貼上並 Run 一次（可重複執行）。

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  action      text not null,   -- 例：delete_project, update_booking, hide_post
  entity      text,            -- 對象（資料表／範疇）
  entity_id   text,
  detail      text
);

alter table public.audit_log enable row level security;

-- 在職員工可讀
drop policy if exists "staff read audit" on public.audit_log;
create policy "staff read audit" on public.audit_log
  for select to authenticated
  using (exists (select 1 from public.staff s where s.id = auth.uid() and s.active));

-- 只允許伺服器端（service_role）寫入
revoke insert, update, delete on public.audit_log from anon, authenticated;

create index if not exists audit_created_idx on public.audit_log (created_at desc);
