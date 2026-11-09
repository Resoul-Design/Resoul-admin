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
};

const LINE_COLUMNS = "id, invoice_no, extra_ref, pet_name, product_name, variant_title, variant_id, product_code, vendor, quantity, unit_price, amount, status, status_note, customer_order_date, completed_on, delivered_to_vendor_on, vendor_returned_on, cost, remarks, source, source_ref, sync_status, sync_error, shopify_ref, invoice_url, target_company_id";

type CompanyLine = { label: string; quantity: number; price?: number };

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

  // 已入表格的來源
  const usedRefs = new Set(rows.map((r) => r.source_ref).filter(Boolean) as string[]);
  const usedCompanies = new Set(rows.map((r) => r.target_company_id).filter(Boolean) as string[]);
  const companyRows = company.data || [];
  const companyOfOrder = new Map(companyRows.filter((c) => c.shopify_order_id).map((c) => [String(c.shopify_order_id), String(c.id)]));

  const suggestions: ProductLine[] = [];
  for (const o of orders.data || []) {
    if (o.cancelled_at || usedRefs.has(o.shopify_order_id)) continue;
    const companyId = companyOfOrder.get(o.shopify_order_id);
    if (companyId && (usedRefs.has(`company:${companyId}`) || usedCompanies.has(companyId))) continue;
    ((o.line_items || []) as ProductLineItem[]).forEach((it, i) => {
      suggestions.push({
        ...blank(invoice, `s-${o.shopify_order_id}-${i}`), suggested: true, source: "shopify", source_ref: o.shopify_order_id,
        product_name: it.title || "", variant_title: it.variant_title && it.variant_title !== "Default Title" ? it.variant_title : null, product_code: it.sku || null,
        quantity: Number(it.quantity || 1), unit_price: it.unit_price == null ? null : Number(it.unit_price), amount: it.unit_price == null ? null : Number(it.unit_price) * Number(it.quantity || 1),
        status: orderMemorialStatus(o) || "ordered", customer_order_date: String(o.shopify_created_at || "").slice(0, 10) || null,
      });
    });
  }
  const orderIds = new Set((orders.data || []).map((o) => o.shopify_order_id));
  for (const c of companyRows) {
    if (c.status === "cancelled" || usedRefs.has(`company:${c.id}`) || usedCompanies.has(String(c.id))) continue;
    if (c.shopify_order_id && orderIds.has(c.shopify_order_id)) continue; // 已由 Shopify 訂單列出
    const all = ((c.details as { lines?: CompanyLine[] } | null)?.lines || []) as CompanyLine[];
    // 紀念品／其他：全部項目；火化及獸醫：第一項是服務本身，附加費不算產品
    const items = ["product", "other"].includes(c.order_type) ? all : c.order_type === "deposit" ? [] : all.slice(1).filter((l) => !String(l.label).startsWith("附加費"));
    items.forEach((l, i) => {
      const { name, variant } = splitLabel(l.label);
      const price = l.price == null ? null : Number(l.price);
      suggestions.push({
        ...blank(invoice, `s-c${c.id}-${i}`), suggested: true, source: "company_order", source_ref: `company:${c.id}`,
        product_name: name, variant_title: variant, quantity: Number(l.quantity || 1), unit_price: price, amount: price == null ? null : price * Number(l.quantity || 1),
        customer_order_date: String(c.created_at || "").slice(0, 10) || null,
      });
    });
  }
  return { ready: true, lines: [...lines, ...suggestions], cancelled };
}
