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

export const dynamic = "force-dynamic";
export default async function LogisticsDetail({ params }: { params: Promise<{ invoice: string }> }) {
  const staff = await getStaff(); if (!staff) redirect("/login"); if (!hasModule(staff, ["inventory"])) notFound();
  const invoice = decodeURIComponent((await params).invoice);
  // 附加單（例 66B）→ 原單號頁的附加單位置
  const extraRef = parseExtraRef(invoice);
  if (extraRef) redirect(`/logistics/${extraRef.invoice}#extra-${extraRef.ref}`);
  const admin = createAdminClient();
  const [logistics, company, deposits, cremations, products] = await Promise.all([
    admin.from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle(),
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
  const derived = deriveCustomerData({ deposits: deposits.data || [], cremations: cremations.data || [], company: company.data || [], products: products.data || [] });
  const autoKeys: string[] = [];
  const formInitial: Record<string, string> = Object.fromEntries(LOGISTICS_FIELDS.map((f) => {
    const saved = lg ? lg[f.key] : null;
    if (saved != null && String(saved) !== "") return [f.key, String(saved).slice(0, f.type === "date" ? 10 : 2000)];
    const auto = derived[f.key];
    if (auto != null && String(auto) !== "") { if (!f.hidden) autoKeys.push(f.key); return [f.key, String(auto).slice(0, f.type === "date" ? 10 : 2000)]; }
    return [f.key, ""];
  }));
  const invoiceNo = Number(invoice);
  const [productLines, catalog] = await Promise.all([loadInvoiceProductLines(invoiceNo), loadCatalog("souvenir")]);
  return <div><div className="mb-5 flex items-center gap-3"><Link href="/logistics" className="text-sm text-[var(--gold)] hover:underline">← 客戶資料</Link><h1 className="text-2xl font-semibold">{invoice}</h1></div><LogisticsForm invoice={invoice} initial={formInitial} exists={!!logistics.data} isAdmin={staff.role === "admin"} autoKeys={autoKeys} derived={Object.fromEntries(Object.entries(derived).map(([k, v]) => [k, String(v)]))} lines={productLines.ready ? lineTotals(productLines.lines) : null} />{productLines.ready ? <ProductLines invoice={invoiceNo} lines={productLines.lines} catalog={catalog.products} catalogError={catalog.error} showCost cancelled={productLines.cancelled} /> : <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">未啟用紀念品產品表格：請先於 Supabase 執行 db/migration_20261109_memorial_lines_cancel.sql。</p>}<ExtraOrders orders={extraOrders(logistics.data)} isAdmin={staff.role === "admin"} /></div>;
}