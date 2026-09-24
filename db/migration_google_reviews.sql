create table if not exists public.google_reviews (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  rating smallint not null default 5 check (rating between 1 and 5),
  zh_content text not null,
  en_content text not null default '',
  photo_url text not null default '',
  source_url text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_reviews enable row level security;
revoke all on public.google_reviews from anon, authenticated;
grant all on public.google_reviews to service_role;

insert into public.google_reviews (display_name, rating, zh_content, en_content, sort_order, is_published)
select seed.display_name, seed.rating, seed.zh_content, seed.en_content, seed.sort_order, true
from (values
  ('小白的主人', 5, '司機準時到，接送非常溫柔，途中仲影相通知我哋。每一步都講得好清楚，離開之後仍然有人跟進，好安心。', 'The driver arrived on time and handled everything so gently, even sending photos along the way. Every step was explained clearly, and someone followed up afterwards. Truly reassuring.', 10),
  ('Momo 的主人', 5, '海景告別室很安靜，沒有人催促我們。我可以慢慢陪 Momo 說完最後的話，這段時間對我好重要。', 'The sea-view farewell room was so quiet and no one rushed us. I could take my time to say goodbye to Momo. That time meant everything to me.', 20),
  ('雪球的主人', 5, '骨灰同掌印都處理得好細心。離別之後仲收到關懷訊息，明白我們的心情，真心多謝 RESOUL。', 'The ashes and paw print were handled with such care. We even received a caring message afterwards. Heartfelt thanks to RESOUL.', 30),
  ('布丁的家人', 5, '半夜突然離開，打去熱線好快有人接聽，冷靜咁教我點樣安置。真係幫我哋渡過咗最徬徨嗰一晚。', 'Our pet passed suddenly in the middle of the night. The hotline answered quickly and calmly guided us on what to do. They helped us through the most frightening night.', 40),
  ('Lucky 的主人', 5, '全程冇兜路、冇轉手，由接送到骨灰交還都係同一位同事跟進，好有信任感。', 'No detours, no hand-offs — the same staff member looked after us from pick-up to returning the ashes. It built real trust.', 50),
  ('咖啡的主人', 5, '個別火化，全程有記錄，我可以親自陪住。交還嘅真係得返佢自己，我先真正放心。', 'Individual cremation with a full record, and I could stay with him the whole time. Knowing what came back was only him gave me real peace of mind.', 60),
  ('花生的家人', 5, '職員好有耐性，等我哋喊完、影完相先繼續。冇一刻覺得自己係喺趕時間。', 'The staff were so patient — they waited for us to cry and take photos before continuing. Not once did we feel rushed.', 70),
  ('波波的主人', 5, '第一次面對呢啲事，佢哋一步步教我點揀方案，冇任何硬銷，只係細心解釋。', 'It was my first time facing this. They walked me through the options step by step — no hard selling, just patient explanation.', 80),
  ('奶茶的主人', 5, '追思相框同毛髮紀念做得好靚，擺喺屋企好似佢仲喺度咁。多謝你哋保留呢份連結。', 'The memorial frame and fur keepsake were beautifully made — having them at home feels like she''s still with us. Thank you for keeping that bond.', 90),
  ('灰灰的家人', 5, '由頭到尾都好透明，價錢事先講清楚，冇任何隱藏收費，令人好安心。', 'Everything was transparent from start to finish — prices were explained upfront with no hidden fees. Very reassuring.', 100),
  ('豆豆的主人', 5, '本身好擔心兔仔會唔會唔接收，點知佢哋一樣好尊重咁對待，當佢係我哋屋企人。', 'I worried they might not take a rabbit, but they treated him with the same respect — as one of our family.', 110),
  ('Coco 的主人', 5, '儀式後幾日收到一封慰問信，先發現原來佢哋真係記得 Coco 個名同故事。好感動。', 'A few days after the ceremony we received a letter of condolence, and realised they truly remembered Coco''s name and story. Deeply moving.', 120)
) as seed(display_name, rating, zh_content, en_content, sort_order)
where not exists (select 1 from public.google_reviews);
