-- ============================================================
-- 遷移：cremation_bookings.case_no 加 UNIQUE（防止並發撞號）
-- 用法：Supabase（diyxcx）→ SQL Editor
-- ⚠️ 請【先執行第 1 步診斷】，確認沒有重複，才執行第 2 步建立 UNIQUE 索引。
--    若第 1 步有結果（重複），請先人手處理／回報，唔好靜默覆蓋。
-- 背景：專案編號已改用 Shopify 訂單名（#RESOUL-####）為單一真相；
--       case_no 只作舊制內部編號，加 UNIQUE 以防未來並發產生撞號。
-- ============================================================

-- ── 第 1 步：診斷現有重複（先跑呢段；有 row 回傳＝有重複）──────────────
--   複製結果回報，決定點處理（改號／清 NULL）後，先做第 2 步。
select case_no, count(*) as n, array_agg(id) as booking_ids
from public.cremation_bookings
where case_no is not null and btrim(case_no) <> ''
group by case_no
having count(*) > 1
order by n desc, case_no;

-- ── 第 2 步：建立部分 UNIQUE 索引（只限非空 case_no；NULL 可重複）──────
--   若第 1 步有重複，呢步會失敗（duplicate key）；請先清理重複再重跑。
create unique index if not exists cremation_bookings_case_no_uniq
  on public.cremation_bookings (case_no)
  where case_no is not null and btrim(case_no) <> '';

-- 驗證：應見到索引已建立
-- select indexname from pg_indexes where tablename = 'cremation_bookings' and indexname = 'cremation_bookings_case_no_uniq';
