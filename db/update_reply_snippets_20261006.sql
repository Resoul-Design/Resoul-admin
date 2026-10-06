-- ============================================================
-- 更新：回覆知識庫（2026-10-06）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（可重複執行）
-- 說明：網站已刪除「回歸自然 HK$500」及「慈善套餐 HK$800」說明；服務改名「上門安樂死」。
--       只刪除／更改相關字句，同事在後台改過的其他內容會保留。
-- ============================================================

update public.reply_snippets
set zh = replace(zh, '另外亦有「回歸自然」HK$500 同「慈善套餐」HK$800。', ''),
    en = replace(en, 'We also offer Back to Nature (HK$500) and a Charity Package (HK$800). ', ''),
    updated_at = now()
where slug = 'price_journeys';

update public.reply_snippets
set title = '上門安樂死安排', updated_at = now()
where slug = 'vet_referral' and title = '上門獸醫評估及安樂死安排';
