-- 2026-11-13 價目設定：骨灰龕成本、轉介夥伴、司機標準收費（後台「價目設定」頁編輯）
-- 可重複執行。
create table if not exists price_settings (
  kind text not null check (kind in ('urn', 'referral', 'driver')),
  key text not null,
  amount numeric,                       -- 骨灰龕成本、司機標準收費
  rate_type text check (rate_type in ('percent', 'fixed', 'zero')), -- 轉介：按套餐價百分比／固定金額／不收費
  rate numeric,                         -- 轉介：百分比用小數（0.1＝10%），固定金額用港幣
  needs_package_code boolean not null default false,
  aliases text[] not null default '{}', -- 轉介：同一夥伴的其他寫法
  sort integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (kind, key)
);
-- 只供伺服器（service role）讀寫
alter table price_settings enable row level security;

-- 初始資料（骨灰龕成本、轉介比例、司機收費）已於 2026-11-13 寫入資料庫，之後在後台「價目設定」修改；數字不放公開 repo。

select kind, count(*) from price_settings group by kind order by kind;
