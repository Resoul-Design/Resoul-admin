-- 2026-11-16 紀念品產品行：供應商結算日期（對應 Excel「Memorial Product Order Tracking」Vendor settlement date）
alter table public.memorial_product_lines add column if not exists vendor_settled_on date;
