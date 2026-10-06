-- ============================================================
-- 遷移：網站內容（2026-10-06）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（安全，可重複執行）
-- 說明：
--   • site_content：後台「網站內容」儲存的收費表、紀念精品、商店分類、常見問題及頁頂公告（每區塊一行 JSON）。
--     網站經 /api/site-content 讀取；未儲存的區塊，網站維持原有內容。
--   • 只經伺服器（service_role）讀寫；不開放 anon／authenticated 直接存取。
--   • 回覆知識庫四則收費範本改用收費代號（{火化收費表} 等），插入回覆時自動填入「網站內容」的最新收費。
-- ============================================================

create table if not exists public.site_content (
  key         text        primary key,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;

-- 回覆知識庫：收費範本改用代號（只更新以下四則）
update public.reply_snippets set
  zh = $$我哋有三個火化旅程，收費按毛孩實際體重計算：
・風之旅：{風之旅起價} 起（私人接送、個別火化同基本骨灰安排）
・雲之旅：{雲之旅起價} 起（完整私人告別儀式同指定紀念項目）
・星之旅：{星之旅起價} 起（深度個人化告別同進階紀念選擇）
詳細比較可以睇：{網站}/cremation#plans$$,
  en = $$We offer three cremation journeys, priced by your pet's actual weight:
• Breeze: from {風之旅起價} (private pick-up, individual cremation and a simple ashes arrangement)
• Cloud: from {雲之旅起價} (a complete private farewell ceremony with selected memorial items)
• Star: from {星之旅起價} (a deeply personalised farewell with advanced memorial options)
Full comparison: {網站}/cremation-en#plans$$,
  updated_at = now()
where slug = 'price_journeys';

update public.reply_snippets set
  zh = $$按體重收費（風之旅／雲之旅／星之旅）：
{火化收費表}
表以外嘅體重請同我哋確認收費。$$,
  en = $$Fees by weight (Breeze / Cloud / Star):
{火化收費表}
For weights not listed, please check with us for the fee.$$,
  updated_at = now()
where slug = 'price_weight';

update public.reply_snippets set
  title = '上門安樂死參考收費',
  zh = $$上門評估及安樂善終嘅參考收費（已包括獸醫上門診症同注射針劑）：
{獸醫收費表}
（日間：中午 12 時至晚上 8 時；晚間：晚上 8 時至午夜 12 時）
實際費用同鎮靜安排由獨立註冊獸醫評估及確認，火化同紀念品另計。$$,
  en = $$Reference fees for a home assessment and euthanasia (including the vet's home visit and the injection):
{獸醫收費表}
(Day: 12 noon–8 pm; evening: 8 pm–midnight)
Final fees and sedation are assessed and confirmed by the independent registered vet; cremation and keepsakes are charged separately.$$,
  updated_at = now()
where slug = 'price_vet';

update public.reply_snippets set
  zh = $$情緒支援嘅收費：
{情緒支援收費表}
實際服務內容、資格同收費會喺預約前確認。詳情可以睇：{網站}/referral#pricing$$,
  en = $$Grief support fees:
{情緒支援收費表}
Service details, qualifications and fees are confirmed before booking. Details: {網站}/referral-en#pricing$$,
  updated_at = now()
where slug = 'price_grief';
