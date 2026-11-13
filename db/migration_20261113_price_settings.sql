-- 2026-11-13 價目設定：骨灰龕成本、轉介夥伴、司機標準收費（後台「價目設定」頁編輯）
-- 未執行前，後台沿用程式內的預設值（與下方初始資料相同）。可重複執行。
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

-- 初始資料（已存在的不覆蓋）
insert into price_settings (kind, key, amount, sort) values
  ('urn', 'URN01S', 12, 1), ('urn', 'URN01L', 25, 2), ('urn', 'URN01SP', 12, 3), ('urn', 'URN01LP', 25, 4),
  ('urn', 'URN02S', 35, 5), ('urn', 'URN02L', 45, 6), ('urn', 'URN02SP', 35, 7), ('urn', 'URN02LP', 45, 8),
  ('urn', 'URN03', 20, 9), ('urn', 'URN03P', 20, 10), ('urn', 'URN03UP', 20, 11),
  ('urn', 'URN04S', 25, 12), ('urn', 'URN04L', 50, 13), ('urn', 'URN04SP', 25, 14), ('urn', 'URN04LP', 50, 15), ('urn', 'URN04SUP', 25, 16), ('urn', 'URN04LUP', 50, 17),
  ('urn', 'URN05S', 25, 18), ('urn', 'URN05L', 50, 19), ('urn', 'URN05SP', 25, 20), ('urn', 'URN05LP', 50, 21), ('urn', 'URN05SUP', 25, 22), ('urn', 'URN05LUP', 50, 23),
  ('urn', 'URN06', 25, 24), ('urn', 'URN06UP', 25, 25),
  ('urn', 'URN07', 55, 26), ('urn', 'URN07UP', 55, 27), ('urn', 'URN07P', 55, 28),
  ('urn', 'URN08', 200, 29), ('urn', 'URN08UP', 200, 30),
  ('urn', 'URN09', 80, 31), ('urn', 'URN09UP', 80, 32),
  ('urn', 'URNW', 0, 33)
on conflict (kind, key) do nothing;

insert into price_settings (kind, key, rate_type, rate, needs_package_code, aliases, sort) values
  ('referral', 'Precious Pet Clinic', 'percent', 0.1, false, '{}', 1),
  ('referral', 'OAFA', 'percent', 0.1, true, '{}', 2),
  ('referral', 'Yeah O2', 'percent', 0.15, false, '{YeahO2}', 3),
  ('referral', 'Joyee', 'fixed', 180, false, '{}', 4),
  ('referral', 'Buddy''s', 'percent', 0.1, false, '{}', 5),
  ('referral', 'Small animal', 'percent', 0.1, false, '{}', 6),
  ('referral', '半山貓醫院', 'percent', 0.1, false, '{}', 7),
  ('referral', 'HKDR(ALC)', 'zero', 0, false, '{}', 8),
  ('referral', 'Royal Pet 0-20', 'percent', 0.1, false, '{}', 9),
  ('referral', 'Royal Pet 21-40', 'percent', 0.15, false, '{}', 10),
  ('referral', 'Royal Pet 41-80', 'percent', 0.2, false, '{}', 11),
  ('referral', 'Royal Pet 81-100', 'percent', 0.25, false, '{}', 12),
  ('referral', 'Royal Pet>100', 'percent', 0.3, false, '{}', 13)
on conflict (kind, key) do nothing;

-- 司機標準收費（按 2026-11-13 試算表記錄最常見金額）
insert into price_settings (kind, key, amount, sort) values
  ('driver', 'Ricky', 320, 1), ('driver', 'Joe', 0, 2), ('driver', '豪仔 / Ho Jai', 300, 3), ('driver', 'Vivian', 0, 4),
  ('driver', 'Yeah O2', 400, 5), ('driver', 'V''s Dad', 350, 6), ('driver', 'Gary', 300, 7), ('driver', 'JH', 0, 8),
  ('driver', 'Tony', 300, 9), ('driver', 'Jason', 0, 10), ('driver', 'Louis', 300, 11), ('driver', 'O2 Team', 400, 12)
on conflict (kind, key) do nothing;

select kind, count(*) from price_settings group by kind order by kind;
