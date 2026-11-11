import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { LogisticsForm } from "../_logistics-form";
import { LOGISTICS_FIELDS } from "@/lib/logistics-fields";
import { deriveCustomerData } from "@/lib/logistics-derive";
import { extraOrders, parseExtraRef } from "@/lib/logistics-extra";
import { ExtraOrders } from "../_extra-orders";
import { ProductLines } from "../_product-lines";
import { loadInvoiceProductLines } from "@/lib/memorial-lines";
import { loadCatalog } from "@/lib/catalog";
import { lineTotals } from "@/lib/logistics-calc";
import { invoiceShopify } from "@/lib/shopify-payable";
import { canonicalDriver, driverOptions } from "@/lib/drivers";
import { deriveLogisticsAutoCosts } from "@/lib/logistics-auto-costs";

export const dynamic = "force-dynamic";
export default async function LogisticsDetail({ params }: { params: Promise<{ invoice: string }> }) {
  const staff = await getStaff(); if (!staff) redirect("/login"); if (!hasModule(staff, ["inventory"])) notFound();
  const invoice = decodeURIComponent((await params).invoice);
  // 附加單（例 66B）→ 原單號頁的附加單位置
  const extraRef = parseExtraRef(invoice);
  if (extraRef) redirect(`/logistics/${extraRef.invoice}#extra-${extraRef.ref}`);
  const admin = createAdminClient();
  const [logistics, logisticsHistory, company, deposits, cremations, products] = await Promise.all([
    admin.from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle(),
    admin.from("logistics_orders").select("driver, urn, urn_cost, driver_or_gogovan_cost").order("updated_at", { ascending: false }).limit(1000),
    // 同一單號可有多筆記錄（同一專案共用單號）
    admin.from("company_orders").select("*").eq("invoice_no", Number(invoice) || invoice).order("created_at").limit(20),
    admin.from("deposit_bookings").select("*").eq("invoice_no", Number(invoice) || invoice).order("created_at").limit(20),
    admin.from("cremation_bookings").select("*").eq("invoice_no", Number(invoice) || invoice).order("created_at").limit(20),
    admin.from("product_orders").select("*").eq("invoice_no", Number(invoice) || invoice).order("shopify_created_at").limit(20),
  ]);
  const co = company.data?.[0], dep = deposits.data?.[0], cre = cremations.data?.[0], pro = products.data?.[0];
  const data = logistics.data || (co ? { ...co, owner_name: co.customer_name, phone: co.phone, email: co.email } : null) || (dep ? { ...dep, phone: dep.contact } : null) || (cre ? { ...cre, phone: cre.contact } : null) || (pro ? { ...pro, owner_name: pro.customer_name } : null);
  if (!data) notFound();
  // 客戶資料表格：已保存的值優先；空白欄位按同一單號的單據自動填入（淡黃色標示，按「儲存修改」後保存）
  const lg = logistics.data as Record<string, unknown> | null;
  // Shopify 實時金額及套餐 SKU（只讀）
  const [shopify, drivers] = await Promise.all([invoiceShopify({ deposits: deposits.data || [], cremations: cremations.data || [], company: company.data || [], products: products.data || [] }), driverOptions()]);
  const invoiceNo = Number(invoice);
  const [productLines, catalog] = await Promise.all([loadInvoiceProductLines(invoiceNo), loadCatalog("souvenir")]);
  const derived = deriveCustomerData({ deposits: deposits.data || [], cremations: cremations.data || [], company: company.data || [], products: products.data || [], planSku: shopify.planSku });
  const automatic = deriveLogisticsAutoCosts(
    lg || { invoice_no: invoiceNo },
    (logisticsHistory.data || []) as unknown as Record<string, unknown>[],
    productLines.ready ? (productLines.lines as unknown as Record<string, unknown>[]) : [],
    (products.data || []) as Record<string, unknown>[],
    (company.data || []) as Record<string, unknown>[],
  );
  const allDerived = { ...derived, ...automatic };
  const autoKeys: string[] = [];
  const formInitial: Record<string, string> = Object.fromEntries(LOGISTICS_FIELDS.map((f) => {
    const saved = lg ? lg[f.key] : null;
    const auto = allDerived[f.key];
    const automaticKey = ["memorial_addon_price", "driver_or_gogovan_cost", "urn_cost"].includes(f.key);
    if (automaticKey && auto != null && String(auto) !== "") { autoKeys.push(f.key); return [f.key, String(auto).slice(0, f.type === "date" ? 10 : 2000)]; }
    // 司機：同一人不同寫法以合併後的名稱顯示（資料庫原文不變，未修改不會寫入）
    if (saved != null && String(saved) !== "") return [f.key, f.key === "driver" ? canonicalDriver(String(saved)) : String(saved).slice(0, f.type === "date" ? 10 : 2000)];
    if (auto != null && String(auto) !== "") { if (!f.hidden) autoKeys.push(f.key); return [f.key, String(auto).slice(0, f.type === "date" ? 10 : 2000)]; }
    return [f.key, ""];
  }));
  return <div><div className="mb-5 flex items-center gap-3"><Link href="/logistics" className="text-sm text-[var(--gold)] hover:underline">← 客戶資料</Link><h1 className="text-2xl font-semibold">{invoice}</h1></div><LogisticsForm invoice={invoice} initial={formInitial} exists={!!logistics.data} isAdmin={staff.role === "admin"} autoKeys={autoKeys} derived={Object.fromEntries(Object.entries(allDerived).map(([k, v]) => [k, String(v)]))} shopify={shopify} drivers={drivers} urnProducts={catalog.products.filter((p) => p.productType.includes("骨灰龕")).map((p) => ({ id: p.id, title: p.title, variants: p.variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku })) }))} lines={productLines.ready ? lineTotals(productLines.lines) : null} memorialItems={productLines.ready ? productLines.lines.filter((l) => l.id && !l.suggested && !l.missing).map((l) => ({ id: String(l.id), name: `${l.product_name}${l.variant_title ? `（${l.variant_title}）` : ""}`, quantity: l.quantity, vendor: l.vendor || "", delivered_to_vendor_on: String(l.delivered_to_vendor_on || "").slice(0, 10), vendor_returned_on: String(l.vendor_returned_on || "").slice(0, 10), completed_on: String(l.completed_on || "").slice(0, 10), cost: l.cost == null ? "" : String(l.cost), remarks: l.remarks || "" })) : []} />{productLines.ready ? <ProductLines invoice={invoiceNo} lines={productLines.lines} catalog={catalog.products} catalogError={catalog.error} showCost cancelled={productLines.cancelled} /> : <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">未啟用紀念品產品表格：請先於 Supabase 執行 db/migration_20261109_memorial_lines_cancel.sql。</p>}<ExtraOrders orders={extraOrders(logistics.data)} isAdmin={staff.role === "admin"} /></div>;
}