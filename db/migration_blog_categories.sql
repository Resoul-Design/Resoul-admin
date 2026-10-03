-- ============================================================
-- 網誌文章分類（2026-10-03）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（可重複執行）
-- 說明：後台「文章記錄」管理分類；網站網誌頁按此表顯示分類篩選掣。
--       中文名稱須與 Shopify 文章標籤（Tags）完全相同。
-- ============================================================

create table if not exists public.blog_categories (
  id         uuid        primary key default gen_random_uuid(),
  tag        text        not null unique,          -- 中文名稱＝Shopify 文章標籤
  label_en   text        not null default '',      -- 英文網站顯示名稱
  sort_order integer     not null default 0,       -- 數字細先顯示
  is_active  boolean     not null default true,    -- 是否在網站顯示
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blog_categories enable row level security;
revoke all on public.blog_categories from anon, authenticated;
grant select on public.blog_categories to anon;
grant all on public.blog_categories to service_role;

-- 網站（publishable key）只可讀取已啟用的分類
drop policy if exists "public read active blog categories" on public.blog_categories;
create policy "public read active blog categories" on public.blog_categories
  for select to anon using (is_active);

insert into public.blog_categories (tag, label_en, sort_order)
select seed.tag, seed.label_en, seed.sort_order
from (values
  ('突發應急與善終指南', 'Emergency & farewell guide', 10),
  ('服務流程與方案選擇', 'Process & plans', 20),
  ('永恆紀念與骨灰飾物', 'Keepsakes & ashes jewellery', 30),
  ('心靈陪伴與哀傷輔導', 'Grief support & counselling', 40)
) as seed(tag, label_en, sort_order)
where not exists (select 1 from public.blog_categories);
