-- 2026-10-11：上門安樂死收費改為「劃一基本收費 HK$3,300＋附加費用」
-- 更新回覆知識庫「上門安樂死收費」範本（{獸醫收費表} 代號由後台「網站內容 → 收費」自動產生）。
-- 於 Supabase diyxcx SQL Editor 執行一次即可。

update public.reply_snippets
set title = '上門安樂死收費',
    zh = $$上門評估及安樂善終嘅收費（已包括獸醫上門診症、注射安樂針劑同相關行政費用）：
{獸醫收費表}
安排服務時會先收 HK$1,800 訂金。如果獸醫上門評估後認為唔適宜進行安樂善終，或者主人改變主意，訂金扣除獸醫上門評估費用後，餘額可以全數留作獨立火化費用抵扣。
安樂善終同鎮靜安排由獨立註冊獸醫評估及確認，火化同紀念品另計。$$,
    updated_at = now(),
    en = $$Fees for a home assessment and euthanasia (including the vet's home consultation, the euthanasia injection and related administrative costs):
{獸醫收費表}
A HK$1,800 deposit is collected when the service is arranged. If, after the home assessment, euthanasia is not considered suitable, or you change your mind, the deposit less the vet's home assessment fee can be kept in full towards the independent cremation fee.
Euthanasia and sedation are assessed and confirmed by the independent registered vet; cremation and keepsakes are charged separately.$$
where slug = 'price_vet';
