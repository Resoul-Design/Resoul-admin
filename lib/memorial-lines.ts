// 紀念品產品列：同一單號可有多行。已保存的行來自 memorial_product_lines；
// 未入表格的 Shopify／開新單項目列為「建議」（淡黃色），按儲存才寫入。
import { createAdminClient } from "@/lib/supabase/admin";
import { orderMemorialStatus } from "@/lib/memorial-status";
import type { ProductLineItem } from "@/lib/product-orders";

export type ProductLine = {
  id: string | null;
  key: string; // 畫面用：已保存＝id；建議／新增＝臨時鍵
  invoice_no: number;
  extra_ref: string | null;
  pet_name: string | null;
  product_name: string;
  variant_title: string | null;
  variant_id: string | null;
  product_code: string | null;
  vendor: string | null;
  quantity: number;
  unit_price: number | null;
  amount: number | null;
  status: string;
  status_note: string | null;
  customer_order_date: string | null;
  completed_on: string | null;
  delivered_to_vendor_on: string | null;
  vendor_returned_on: string | null;
  cost: number | null;
  remarks: string | null;
  source: string;
  source_ref: string | null;
  sync_status: "none" | "pending" | "syncing" | "synced" | "failed";
  sync_error: string | null;
  shopify_ref: string | null;
  invoice_url: string | null;
  suggested?: boolean;
  missing?: boolean; // 已同步，但 Shopify 付款連結已沒有此項目（例如在 Shopify 刪除）
};

const LINE_COLUMNS = "id, invoice_no, extra_ref, pet_name, product_name, variant_title, variant_id, product_code, vendor, quantity, unit_price, amount, status, status_note, customer_order_date, completed_on, delivered_to_vendor_on, vendor_returned_on, cost, remarks, source, source_ref, sync_status, sync_error, shopify_ref, invoice_url, target_company_id";

type CompanyLine = { label: string; quantity: number; price?: number; sku?: string | null };

// 「產品（款式）」→ 名稱及款式；「項目（HK$100）」只取名稱
function splitLabel(label: string): { name: string; variant: string | null } {
  const m = String(label || "").match(/^(.*)（([^（）]*)）$/);
  if (!m) return { name: String(label || ""), variant: null };
  return /^HK\$/.test(m[2]) ? { name: m[1], variant: null } : { name: m[1], variant: m[2] };
}

function blank(invoice: number, key: string): ProductLine {
  return {
    id: null, key, invoice_no: invoice, extra_ref: null, pet_name: null, product_name: "", variant_title: null, variant_id: null, product_code: null, vendor: null,
    quantity: 1, unit_price: null, amount: null, status: "ordered", status_note: null, customer_order_date: null, completed_on: null, delivered_to_vendor_on: null, vendor_returned_on: null,
    cost: null, remarks: null, source: "manual", source_ref: null, sync_status: "none", sync_error: null, shopify_ref: null, invoice_url: null,
  };
}

export async function loadInvoiceProductLines(invoice: number): Promise<{ ready: boolean; lines: ProductLine[]; cancelled: boolean }> {
  const admin = createAdminClient();
  const [saved, orders, company, deposits, cremations] = await Promise.all([
    admin.from("memorial_product_lines").select(LINE_COLUMNS).eq("invoice_no", invoice).order("sort_order").order("created_at"),
    admin.from("product_orders").select("shopify_order_id, line_items, shopify_created_at, cancelled_at, memorial_status, fulfillment_status").eq("invoice_no", invoice),
    admin.from("company_orders").select("id, order_type, status, details, created_at, shopify_order_id, linked_id").eq("invoice_no", invoice),
    admin.from("deposit_bookings").select("status").eq("invoice_no", invoice),
    admin.from("cremation_bookings").select("status").eq("invoice_no", invoice),
  ]);
  // 同一單號所有記錄都已取消：不可再加產品
  const statuses = [...(deposits.data || []).map((r) => r.status), ...(cremations.data || []).map((r) => r.status), ...(company.data || []).map((r) => r.status), ...(orders.data || []).map((r) => (r.cancelled_at ? "cancelled" : "active"))];
  const cancelled = statuses.length > 0 && statuses.every((s) => s === "cancelled");
  if (saved.error) return { ready: false, lines: [], cancelled };
  const rows = (saved.data || []) as unknown as (Omit<ProductLine, "key"> & { target_company_id: string | null })[];
  const lines: ProductLine[] = rows.map((r) => ({ ...r, key: String(r.id), quantity: Number(r.quantity), unit_price: r.unit_price == null ? null : Number(r.unit_price), amount: r.amount == null ? null : Number(r.amount), cost: r.cost == null ? null : Number(r.cost) }));

  // 已入表格的項目：按「產品名稱｜款式」逐件扣減，單據內仍未對應的項目才列為建議
  const keyOf = (name: unknown, variant: unknown) => `${String(name || "").trim().toLowerCase()}|${String(variant || "").trim().toLowerCase()}`;
  const unmatched = new Map<string, number>();
  for (const r of rows) unmatched.set(keyOf(r.product_name, r.variant_title), (unmatched.get(keyOf(r.product_name, r.variant_title)) || 0) + Number(r.quantity || 1));
  const take = (name: unknown, variant: unknown, qty: number) => {
    const k = keyOf(name, variant), have = unmatched.get(k) || 0;
    if (have <= 0) return qty;
    unmatched.set(k, Math.max(0, have - qty));
    return Math.max(0, qty - have);
  };
  const companyRows = company.data || [];
  // 已同步的行：對照付款連結的最新項目（開單記錄的項目由對帳／全部同步跟隨 Shopify 更新）
  const companyLeft = new Map<string, Map<string, number>>();
  for (const c of companyRows) {
    const m = new Map<string, number>();
    for (const l of ((c.details as { lines?: CompanyLine[] } | null)?.lines || []) as CompanyLine[]) { const { name, variant } = splitLabel(l.label); m.set(keyOf(name, variant), (m.get(keyOf(name, variant)) || 0) + Number(l.quantity || 1)); }
    companyLeft.set(String(c.id), m);
  }
  for (const l of lines) {
    if (l.sync_status !== "synced") continue;
    const target = rows.find((r) => r.id === l.id)?.target_company_id;
    const m = target ? companyLeft.get(String(target)) : undefined;
    if (!m) continue;
    const k = keyOf(l.product_name, l.variant_title), have = m.get(k) || 0;
    if (have >= l.quantity) m.set(k, have - l.quantity);
    else l.missing = true;
  }

  const suggestions: ProductLine[] = [];
  for (const o of orders.data || []) {
    if (o.cancelled_at) continue;
    ((o.line_items || []) as ProductLineItem[]).forEach((it, i) => {
      const variant = it.variant_title && it.variant_title !== "Default Title" ? it.variant_title : null;
      const left = take(it.title, variant, Number(it.quantity || 1));
      if (left <= 0) return;
      suggestions.push({
        ...blank(invoice, `s-${o.shopify_order_id}-${i}`), suggested: true, source: "shopify", source_ref: o.shopify_order_id,
        product_name: it.title || "", variant_title: it.variant_title && it.variant_title !== "Default Title" ? it.variant_title : null, product_code: it.sku || null,
        quantity: left, unit_price: it.unit_price == null ? null : Number(it.unit_price), amount: it.unit_price == null ? null : Number(it.unit_price) * left,
        status: orderMemorialStatus(o) || "ordered", customer_order_date: String(o.shopify_created_at || "").slice(0, 10) || null,
      });
    });
  }
  const orderIds = new Set((orders.data || []).map((o) => o.shopify_order_id));
  for (const c of companyRows) {
    if (c.status === "cancelled") continue;
    if (c.shopify_order_id && orderIds.has(c.shopify_order_id)) continue; // 已由 Shopify 訂單列出
    const all = ((c.details as { lines?: CompanyLine[] } | null)?.lines || []) as CompanyLine[];
    // 紀念品／其他：全部項目；火化及獸醫：第一項是服務本身，附加費不算產品
    const items = ["product", "other"].includes(c.order_type) ? all : c.order_type === "deposit" ? [] : all.slice(1).filter((l) => !String(l.label).startsWith("附加費"));
    items.forEach((l, i) => {
      const { name, variant } = splitLabel(l.label);
      const price = l.price == null ? null : Number(l.price);
      const left = take(name, variant, Number(l.quantity || 1));
      if (left <= 0) return;
      suggestions.push({
        ...blank(invoice, `s-c${c.id}-${i}`), suggested: true, source: "company_order", source_ref: `company:${c.id}`,
        product_name: name, variant_title: variant, product_code: l.sku || null, quantity: left, unit_price: price, amount: price == null ? null : price * left,
        customer_order_date: String(c.created_at || "").slice(0, 10) || null,
      });
    });
  }
  return { ready: true, lines: [...lines, ...suggestions], cancelled };
}
