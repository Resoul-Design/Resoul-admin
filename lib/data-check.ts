// 資料核對（只讀）：客戶資料與 Shopify、價目設定是否一致。
// 訂單付款、金額、取消等對帳在「同步狀態」；這裡只看客戶資料：套餐代碼、紀念品產品行、轉介、司機、骨灰龕成本。
// 唯一可一鍵修正的是套餐代碼（只改後台客戶資料，按 Shopify 款式 SKU；不會修改 Shopify）。
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingDraftIds, invoiceDocIds, looseCremationIds, shopifyTotals, summarizeInvoice, type InvoiceRows } from "@/lib/shopify-payable";
import { loadPriceSettings } from "@/lib/price-settings";
import { findPartner } from "@/lib/logistics-calc";
import { canonicalDriver } from "@/lib/driver-names";
import { urnCost } from "@/lib/urn-costs";
import { loadInvoiceProductLines } from "@/lib/memorial-lines";

export type DataFix = { kind: "package-code"; invoiceNo: number; from: string; to: string };
export type DataIssue = { category: string; invoiceNo: string; text: string; link?: string; fix?: DataFix };
export type DataCheckResult = { checkedAt: string; counts: Record<string, number>; issues: DataIssue[] };

type Row = Record<string, unknown>;
const text = (v: unknown) => String(v ?? "").trim();
const money = (v: unknown): number | null => {
  const s = text(v).replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const NO_REFERRAL = /^(n\/?a|na|others?|-|—|none|無|沒有)$/i;
const NO_DRIVER = /^(n\/?a|na|-|—|pending|待定)$/i;

export async function dataCheck(): Promise<DataCheckResult> {
  const db = createAdminClient();
  const [prices, lg, co, dep, cre, po] = await Promise.all([
    loadPriceSettings(),
    db.from("logistics_orders").select("*").limit(5000),
    db.from("company_orders").select("id, invoice_no, order_type, status, linked_id, shopify_order_id, shopify_draft_id").not("invoice_no", "is", null).limit(5000),
    db.from("deposit_bookings").select("id, invoice_no, status, payment_status, shopify_order_id, is_test").not("invoice_no", "is", null).limit(5000),
    db.from("cremation_bookings").select("id, invoice_no, status, payment_status, shopify_order_id, is_test").not("invoice_no", "is", null).limit(5000),
    db.from("product_orders").select("invoice_no, shopify_order_id, cancelled_at, is_test").not("invoice_no", "is", null).limit(5000),
  ]);
  const logistics = (lg.data || []) as Row[];
  const byInvoice = new Map<string, InvoiceRows>();
  const rowsFor = (no: unknown) => {
    const k = text(no);
    if (!byInvoice.has(k)) byInvoice.set(k, { deposits: [], cremations: [], company: [], products: [] });
    return byInvoice.get(k)!;
  };
  for (const r of (dep.data || []) as Row[]) rowsFor(r.invoice_no).deposits.push(r);
  for (const r of (cre.data || []) as Row[]) rowsFor(r.invoice_no).cremations.push(r);
  for (const r of (co.data || []) as Row[]) rowsFor(r.invoice_no).company.push(r);
  for (const r of (po.data || []) as Row[]) rowsFor(r.invoice_no).products.push(r);

  // Shopify：一次過讀取所有單號的單據
  const drafts = await bookingDraftIds([...byInvoice.values()].flatMap(looseCremationIds));
  const docsBy = new Map([...byInvoice].map(([no, rows]) => [no, invoiceDocIds(rows, drafts)]));
  const totals = await shopifyTotals([...docsBy.values()].flatMap((d) => [...d.depIds, ...d.docs]));
  const shopifyBy = new Map([...docsBy].map(([no, d]) => [no, summarizeInvoice(d.depIds, d.docs, totals)]));

  const issues: DataIssue[] = [];
  const link = (no: string) => `/logistics/${encodeURIComponent(no)}`;
  const label = (r: Row) => [text(r.pet_name), text(r.owner_name)].filter(Boolean).join("｜");

  for (const r of logistics) {
    const no = text(r.invoice_no);
    if (!no) continue;
    const who = label(r);
    const shop = shopifyBy.get(no);
    const live = !!shop?.hasDocs;

    // 1) 套餐代碼
    const stored = text(r.package_code);
    if (shop?.planSku && stored.toUpperCase() !== shop.planSku.toUpperCase()) {
      issues.push({ category: "套餐代碼與 Shopify 不同", invoiceNo: no, text: `${who}：後台 ${stored || "（未有）"}，Shopify ${shop.planSku}`, link: link(no), fix: { kind: "package-code", invoiceNo: Number(no), from: stored, to: shop.planSku } });
    }
    // 2) 轉介
    const ref = text(r.referral);
    if (ref && !NO_REFERRAL.test(ref) && !findPartner(ref, prices.partners)) {
      issues.push({ category: "轉介夥伴不在價目設定", invoiceNo: no, text: `${who}：「${ref}」轉介費按 0 計算`, link: "/prices" });
    }
    // 3) 司機
    const driver = text(r.driver);
    const fee = driver && !NO_DRIVER.test(driver) ? prices.driverFees[canonicalDriver(driver)] : undefined;
    if (driver && !NO_DRIVER.test(driver) && fee == null) {
      issues.push({ category: "司機未設定標準收費", invoiceNo: no, text: `${who}：司機「${driver}」`, link: "/prices" });
    }
    // 4) 骨灰龕代碼
    const urn = text(r.urn);
    const cost = urn ? urnCost(urn, prices.urnCosts) : null;
    if (/^URN/i.test(urn) && cost == null) {
      issues.push({ category: "骨灰龕代碼未有成本", invoiceNo: no, text: `${who}：${urn}`, link: "/prices" });
    }
    // 5) 已存成本與現行價目不同（只限有 Shopify 單據的新單；只列出，不改舊單已存金額）
    if (live) {
      const savedDriver = money(r.driver_or_gogovan_cost);
      if (fee != null && savedDriver != null && Math.abs(savedDriver - fee) > 0.005) issues.push({ category: "已存成本與現行價目不同", invoiceNo: no, text: `${who}：司機費已存 ${hk(savedDriver)}，${canonicalDriver(driver)} 現行 ${hk(fee)}`, link: link(no) });
      const savedUrn = money(r.urn_cost);
      if (cost != null && savedUrn != null && Math.abs(savedUrn - cost) > 0.005) issues.push({ category: "已存成本與現行價目不同", invoiceNo: no, text: `${who}：骨灰龕成本已存 ${hk(savedUrn)}，${urn.toUpperCase()} 現行 ${hk(cost)}`, link: link(no) });
    }
  }

  // 6) 紀念品產品行（只限有 Shopify 單據的單號）
  const liveInvoices = [...shopifyBy].filter(([, s]) => s.hasDocs).map(([no]) => no).filter((no) => /^\d+$/.test(no));
  const names = new Map(logistics.map((r) => [text(r.invoice_no), label(r)]));
  for (let i = 0; i < liveInvoices.length; i += 6) {
    const batch = liveInvoices.slice(i, i + 6);
    const results = await Promise.all(batch.map((no) => loadInvoiceProductLines(Number(no))));
    results.forEach((res, j) => {
      const no = batch[j];
      if (!res.ready || res.cancelled) return;
      const who = names.get(no) || "";
      const missing = res.lines.filter((l) => l.missing);
      const suggested = res.lines.filter((l) => l.suggested);
      const item = (l: { product_name: string; variant_title: string | null; quantity: number }) => `${l.product_name}${l.variant_title ? `（${l.variant_title}）` : ""}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`;
      if (missing.length) issues.push({ category: "紀念品產品行在 Shopify 已刪除", invoiceNo: no, text: `${who ? `${who}：` : ""}${missing.map(item).join("、")}`, link: link(no) });
      if (suggested.length) issues.push({ category: "紀念品產品未入表格", invoiceNo: no, text: `${who ? `${who}：` : ""}${suggested.map(item).join("、")}`, link: link(no) });
    });
  }

  issues.sort((a, b) => a.category.localeCompare(b.category, "zh-Hant") || Number(b.invoiceNo) - Number(a.invoiceNo));
  return {
    checkedAt: new Date().toISOString(),
    counts: { 客戶資料: logistics.length, "有 Shopify 單據的單號": liveInvoices.length },
    issues,
  };
}

// 套餐代碼：按 Shopify 更新後台客戶資料（只在仍為核對時的舊值時更新）
export async function fixPackageCode(fix: DataFix): Promise<{ error?: string; done?: string }> {
  if (fix.kind !== "package-code" || !Number.isInteger(fix.invoiceNo) || !/^(BJ|CJ|SJ)\d+$/i.test(fix.to)) return { error: "修正資料無效。" };
  const db = createAdminClient();
  const { data: row } = await db.from("logistics_orders").select("package_code").eq("invoice_no", fix.invoiceNo).maybeSingle();
  if (!row) return { error: "找不到客戶資料。" };
  if (text(row.package_code) !== text(fix.from)) return { error: "套餐代碼已被更改，請重新核對。" };
  const { error } = await db.from("logistics_orders").update({ package_code: fix.to, updated_at: new Date().toISOString() }).eq("invoice_no", fix.invoiceNo);
  if (error) return { error: "未能更新，請稍後再試。" };
  return { done: `套餐代碼已改為 ${fix.to}` };
}
