-- ============================================================
-- 更新：回覆知識庫「情緒支援收費」（2026-10-03）
-- 用法：Supabase（diyxcx）→ SQL Editor → 貼上全部 → Run（可重複執行）
-- 說明：網站情緒支援收費改為 4 項（只在「專業輔導轉介及資源」頁顯示），知識庫範本同步。
--       如同事已在後台改過此範本，執行後會以下列內容覆蓋。
-- ============================================================

update public.reply_snippets
set zh = $$情緒支援的收費：
・離別後關懷訊息及電子指南：免費
・與我們傾訴／初步需要了解：免費
・合資格輔導員個別面談 50 分鐘：HK$380 至 580
・註冊輔導／臨床心理學家 50 分鐘：約 HK$1,100 至 1,600（由專業人士確認）
實際服務內容、資格同收費會喺預約前確認。詳情可以睇：{網站}/referral#pricing$$,
    en = $$Grief support fees:
• Aftercare message and digital guide: free
• Talk to us / initial needs check: free
• Qualified counsellor session (50 min): HK$380–580
• Registered counselling / clinical psychologist (50 min): approx. HK$1,100–1,600, confirmed by the professional
Service details, qualifications and fees are confirmed before booking. Details: {網站}/referral-en#pricing$$,
    updated_at = now()
where slug = 'price_grief';
