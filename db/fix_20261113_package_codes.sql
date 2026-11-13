-- 2026-11-13 套餐代碼對齊 Shopify（用戶確認）：只改 #339 及 #334 兩張單的已存套餐代碼
-- #339：SJ1 → SJ30（Shopify 草稿 SKU）；#334：BJ1 → BJ0（Shopify 草稿 SKU）
-- 只在仍是舊值時更新，可重複執行
update logistics_orders set package_code = 'SJ30', updated_at = now() where invoice_no = 339 and package_code = 'SJ1';
update logistics_orders set package_code = 'BJ0', updated_at = now() where invoice_no = 334 and package_code = 'BJ1';
select invoice_no, package_code from logistics_orders where invoice_no in (334, 339) order by invoice_no;
