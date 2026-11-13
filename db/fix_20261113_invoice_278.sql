-- 2026-11-13 用戶要求：對外單號 350 改為 278，之後新單由 279 開始
-- 單號 350 為 2026-11-13 15:54 開的預約接送訂金（付款連結草稿 #D 1631522160868）
begin;
do $$ begin
  if exists (select 1 from public.company_invoices where invoice_no = 278) then raise exception '單號 278 已被使用，未有更改'; end if;
  if not exists (select 1 from public.company_invoices where invoice_no = 350) then raise exception '找不到單號 350，未有更改'; end if;
end $$;
update public.company_invoices set invoice_no = 278, project_no = '278', manual = true, note = '用戶要求：350 改為 278（2026-11-13）' where invoice_no = 350;
update public.company_orders     set invoice_no = 278, project_no = '278' where invoice_no = 350;
update public.deposit_bookings   set invoice_no = 278, project_no = '278' where invoice_no = 350;
update public.cremation_bookings set invoice_no = 278 where invoice_no = 350;
update public.product_orders     set invoice_no = 278 where invoice_no = 350;
update public.deposit_ledger     set invoice_no = 278 where invoice_no = 350;
update public.logistics_orders   set invoice_no = 278 where invoice_no = 350;
-- 下一張新單＝279
select setval('public.company_invoice_no_seq', 278, true);
commit;

select 'company_invoices' t, invoice_no, project_no from public.company_invoices where invoice_no in (278, 350)
union all select 'company_orders', invoice_no, project_no from public.company_orders where invoice_no in (278, 350)
union all select 'deposit_bookings', invoice_no, project_no from public.deposit_bookings where invoice_no in (278, 350)
union all select 'logistics_orders', invoice_no, null from public.logistics_orders where invoice_no in (278, 350);
