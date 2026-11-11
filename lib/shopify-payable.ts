// Shopify 實時金額（只讀）：付款連結草稿或訂單的原價、接送訂金抵扣、其他折扣及應付。
// 後台各頁顯示「應付」一律以此為準，不用後台手填值。
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";

export type ShopifyTotals = {
  id: string;
  name: string;
  kind: "draft" | "order";
  open: boolean; // 未付款草稿
  paid: boolean; // 已付款訂單（含部分退款）
  cancelled: boolean;
  gross: number; // 原價（貨品小計，未扣折扣）
  credit: number; // 接送訂金抵扣
  other: number; // 其他折扣
  payable: number; // 應付（草稿＝總額；訂單＝未付餘額）
  received: number; // 已收（訂單）
  skus: string[]; // 項目 SKU（套餐代碼以此為準）
};

const QUERY = `query PayableNodes($ids: [ID!]!) { nodes(ids: $ids) {
  ... on DraftOrder { id name status order { id } appliedDiscount { title value valueType } lineItemsSubtotalPrice { shopMoney { amount } } totalDiscountsSet { shopMoney { amount } } totalPriceSet { shopMoney { amount } } lineItems(first: 30) { nodes { sku } } }
  ... on Order { id name cancelledAt displayFinancialStatus customAttributes { key value } totalDiscountsSet { shopMoney { amount } } currentTotalPriceSet { shopMoney { amount } } totalOutstandingSet { shopMoney { amount } } totalReceivedSet { shopMoney { amount } } lineItems(first: 30) { nodes { sku } } }
} }`;
type Money = { shopMoney: { amount: string } };
type Node =
  | { id: string; name: string; status: string; order: { id: string } | null; appliedDiscount: { title: string | null; value: number; valueType: string } | null; lineItemsSubtotalPrice: Money; totalDiscountsSet: Money; totalPriceSet: Money; lineItems: { nodes: { sku: string | null }[] } }
  | { id: string; name: string; cancelledAt: string | null; displayFinancialStatus: string; customAttributes: { key: string; value: string | null }[]; totalDiscountsSet: Money; currentTotalPriceSet: Money; totalOutstandingSet: Money; totalReceivedSet: Money; lineItems: { nodes: { sku: string | null }[] } };
const n = (m: Money | null | undefined) => Number(m?.shopMoney.amount || 0);
const CREDIT_TITLE = "接送訂金抵扣";

// 讀取失敗時回傳空 Map（呼叫方沿用後台記錄）
export async function shopifyTotals(ids: (string | null | undefined)[]): Promise<Map<string, ShopifyTotals>> {
  const list = [...new Set(ids.filter((x): x is string => !!x && /^gid:\/\/shopify\/(DraftOrder|Order)\/\d+$/.test(x)))];
  const out = new Map<string, ShopifyTotals>();
  try {
    for (let i = 0; i < list.length; i += 100) {
      const res = await shopifyGraphQL<{ nodes: (Node | null)[] }>(QUERY, { ids: list.slice(i, i + 100) });
      for (const node of res.nodes) {
        if (!node?.id) continue;
        if ("lineItemsSubtotalPrice" in node) {
          const discount = n(node.totalDiscountsSet);
          const credit = node.appliedDiscount && (node.appliedDiscount.title || "").includes(CREDIT_TITLE) && node.appliedDiscount.valueType === "FIXED_AMOUNT" ? Number(node.appliedDiscount.value) : 0;
          const open = node.status !== "COMPLETED" && !node.order;
          out.set(node.id, { id: node.id, name: node.name, kind: "draft", open, paid: false, cancelled: false, gross: n(node.lineItemsSubtotalPrice), credit, other: Math.max(0, discount - credit), payable: open ? n(node.totalPriceSet) : 0, received: 0, skus: node.lineItems.nodes.map((l) => l.sku || "").filter(Boolean) });
        } else if ("currentTotalPriceSet" in node) {
          const discount = n(node.totalDiscountsSet);
          const creditAttr = node.customAttributes.find((a) => a.key === "Deposit credit")?.value || "";
          const m = creditAttr.match(/HK\$\s*([\d,]+(?:\.\d+)?)/);
          const credit = Math.min(discount, m ? Number(m[1].replace(/,/g, "")) : 0);
          const total = n(node.currentTotalPriceSet);
          out.set(node.id, { id: node.id, name: node.name, kind: "order", open: false, paid: /PAID|REFUND/.test(node.displayFinancialStatus), cancelled: !!node.cancelledAt, gross: total + discount, credit, other: Math.max(0, discount - credit), payable: node.cancelledAt ? 0 : n(node.totalOutstandingSet), received: n(node.totalReceivedSet), skus: node.lineItems.nodes.map((l) => l.sku || "").filter(Boolean) });
        }
      }
    }
  } catch (e) {
    console.error("[shopify_totals]", e instanceof Error ? e.message : "unknown");
  }
  return out;
}

// 火化／獸醫預約的付款連結草稿（開新單記錄或跟進記錄）
export async function bookingDraftIds(bookingIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!bookingIds.length) return out;
  const admin = createAdminClient();
  const [marks, cos] = await Promise.all([
    admin.from("follow_up_marks").select("ref, payment_draft_id").in("entity", ["cremation", "vet"]).in("ref", bookingIds).not("payment_draft_id", "is", null),
    admin.from("company_orders").select("linked_id, shopify_draft_id").in("linked_id", bookingIds).not("shopify_draft_id", "is", null),
  ]);
  for (const m of marks.data || []) out.set(String(m.ref), String(m.payment_draft_id));
  for (const c of cos.data || []) if (!out.has(String(c.linked_id))) out.set(String(c.linked_id), String(c.shopify_draft_id));
  return out;
}

// 金額文字：應付為主；有折扣時同時列出原價及折扣
export function payableText(t: { gross: number; credit: number; other: number; payable: number }, prefix = "HK$"): string {
  const f = (x: number) => `${prefix}${x.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const parts = [t.credit ? `訂金抵扣 −${f(t.credit)}` : "", t.other ? `折扣 −${f(t.other)}` : ""].filter(Boolean);
  return parts.length ? `${f(t.payable)}（原價 ${f(t.gross)}、${parts.join("、")}）` : f(t.payable);
}

// 一張單號在 Shopify 的金額（客戶資料用）：已收接送訂金、原價、訂金抵扣、其他折扣、應付
export type InvoiceShopify = { hasDocs: boolean; depositPaid: number; gross: number; credit: number; other: number; payable: number; planSku: string };
export async function invoiceShopify(rows: { deposits: Record<string, unknown>[]; cremations: Record<string, unknown>[]; company: Record<string, unknown>[]; products: Record<string, unknown>[] }): Promise<InvoiceShopify> {
  const live = (r: Record<string, unknown>) => String(r.status || "") !== "cancelled" && !r.cancelled_at && !r.is_test;
  const depIds = rows.deposits.filter((r) => live(r) && r.payment_status === "paid").map((r) => String(r.shopify_order_id || "")).map((id) => (/^\d+$/.test(id) ? `gid://shopify/Order/${id}` : id));
  const docs = new Set<string>();
  const linked = new Set<string>();
  for (const c of rows.company.filter((x) => live(x) && x.order_type !== "deposit")) {
    if (c.linked_id) linked.add(String(c.linked_id));
    const id = String(c.shopify_order_id || c.shopify_draft_id || "");
    if (id) docs.add(/^\d+$/.test(id) ? `gid://shopify/Order/${id}` : id);
  }
  const loose = rows.cremations.filter((r) => live(r) && !linked.has(String(r.id)));
  const drafts = await bookingDraftIds(loose.filter((r) => !r.shopify_order_id).map((r) => String(r.id)));
  for (const r of loose) { const id = String(r.shopify_order_id || drafts.get(String(r.id)) || ""); if (id) docs.add(/^\d+$/.test(id) ? `gid://shopify/Order/${id}` : id); }
  for (const p of rows.products.filter(live)) if (p.shopify_order_id) docs.add(String(p.shopify_order_id));
  const totals = await shopifyTotals([...depIds, ...docs]);
  // 已付款的草稿以其訂單計算
  const list = [...docs].map((id) => totals.get(id)).filter((t): t is ShopifyTotals => !!t && !t.cancelled && (t.kind === "order" || t.open));
  const sum = (k: "gross" | "credit" | "other" | "payable") => Math.round(list.reduce((n, t) => n + t[k], 0) * 100) / 100;
  const planSku = list.flatMap((t) => t.skus).find((s) => /^(BJ|CJ|SJ)\d+$/i.test(s)) || "";
  return {
    hasDocs: list.length > 0,
    depositPaid: depIds.reduce((n, id) => { const t = totals.get(id); return n + (t && t.paid && !t.cancelled ? t.received : 0); }, 0),
    gross: sum("gross"), credit: sum("credit"), other: sum("other"), payable: sum("payable"), planSku,
  };
}
