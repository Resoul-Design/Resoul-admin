// Shopify 實時金額（只讀）：原價、接送訂金抵扣、其他折扣、應付及實收。
// 讀取失敗時不當作 0。已收訂金只計確實已付的接送訂金，抵扣不會在應付上再減一次。
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { classifyOrderPayment, payableText, selectPlanSku, splitCreditAndPromo, summarizeDeposits, type DepositInput, type RemotePayment } from "@/lib/money-rules";

export { payableText };

export type ShopifyTotals = {
  id: string;
  name: string;
  kind: "draft" | "order";
  open: boolean;
  paid: boolean;
  cancelled: boolean;
  refunded: boolean;
  gross: number;
  credit: number;
  other: number;
  payable: number;
  received: number;
  skus: string[];
  lines: { title: string | null; variantTitle: string | null; sku: string | null }[];
};

const QUERY = `query PayableNodes($ids: [ID!]!) { nodes(ids: $ids) {
  ... on DraftOrder { id name status order { id } appliedDiscount { title value valueType } lineItemsSubtotalPrice { shopMoney { amount } } totalDiscountsSet { shopMoney { amount } } totalPriceSet { shopMoney { amount } } lineItems(first: 30) { nodes { sku title variantTitle } } }
  ... on Order { id name cancelledAt displayFinancialStatus customAttributes { key value } totalDiscountsSet { shopMoney { amount } } currentTotalPriceSet { shopMoney { amount } } totalOutstandingSet { shopMoney { amount } } totalReceivedSet { shopMoney { amount } } totalRefundedSet { shopMoney { amount } } lineItems(first: 30) { nodes { sku title variantTitle } } }
} }`;

type Money = { shopMoney: { amount: string } };
type Line = { sku: string | null; title: string | null; variantTitle: string | null };
type Node =
  | { id: string; name: string; status: string; order: { id: string } | null; appliedDiscount: { title: string | null; value: number; valueType: string } | null; lineItemsSubtotalPrice: Money; totalDiscountsSet: Money; totalPriceSet: Money; lineItems: { nodes: Line[] } }
  | { id: string; name: string; cancelledAt: string | null; displayFinancialStatus: string; customAttributes: { key: string; value: string | null }[]; totalDiscountsSet: Money; currentTotalPriceSet: Money; totalOutstandingSet: Money; totalReceivedSet: Money; totalRefundedSet: Money; lineItems: { nodes: Line[] } };

const n = (m: Money | null | undefined) => Number(m?.shopMoney.amount || 0);
const CREDIT_TITLE = "接送訂金抵扣";
const gid = (id: string) => (/^\d+$/.test(id) ? `gid://shopify/Order/${id}` : id);

function creditAmount(gross: number, discount: { title: string | null; value: number; valueType: string } | null): number {
  if (!discount || !(discount.title || "").includes(CREDIT_TITLE)) return 0;
  if (discount.valueType === "FIXED_AMOUNT") return Number(discount.value) || 0;
  if (discount.valueType === "PERCENTAGE") return gross * (Number(discount.value) || 0) / 100;
  return 0;
}

function toTotals(node: Node): ShopifyTotals {
  const lines = node.lineItems.nodes.map((line) => ({ title: line.title, variantTitle: line.variantTitle, sku: line.sku }));
  const skus = lines.map((line) => line.sku || "").filter(Boolean);
  if ("lineItemsSubtotalPrice" in node) {
    const gross = n(node.lineItemsSubtotalPrice);
    const split = splitCreditAndPromo(n(node.totalDiscountsSet), creditAmount(gross, node.appliedDiscount));
    const open = node.status !== "COMPLETED" && !node.order;
    return { id: node.id, name: node.name, kind: "draft", open, paid: false, cancelled: false, refunded: false, gross, ...split, payable: open ? n(node.totalPriceSet) : 0, received: 0, skus, lines };
  }
  const payment = classifyOrderPayment(node.displayFinancialStatus, !!node.cancelledAt, n(node.totalReceivedSet), n(node.totalRefundedSet));
  const discount = n(node.totalDiscountsSet);
  const creditAttr = node.customAttributes.find((item) => item.key === "Deposit credit")?.value || "";
  const matched = creditAttr.match(/HK\$\s*([\d,]+(?:\.\d+)?)/);
  const split = splitCreditAndPromo(discount, matched ? Number(matched[1].replace(/,/g, "")) : 0);
  const gross = n(node.currentTotalPriceSet) + discount;
  return { id: node.id, name: node.name, kind: "order", open: false, paid: payment.paid, cancelled: payment.voided, refunded: payment.refunded, gross, ...split, payable: payment.voided ? 0 : n(node.totalOutstandingSet), received: payment.net, skus, lines };
}

export async function loadShopifyTotals(ids: (string | null | undefined)[]): Promise<{ ok: boolean; totals: Map<string, ShopifyTotals> }> {
  const list = [...new Set(ids.filter((id): id is string => !!id && /^gid:\/\/shopify\/(DraftOrder|Order)\/\d+$/.test(id)))];
  const totals = new Map<string, ShopifyTotals>();
  try {
    for (let i = 0; i < list.length; i += 100) {
      const res = await shopifyGraphQL<{ nodes: (Node | null)[] }>(QUERY, { ids: list.slice(i, i + 100) });
      for (const node of res.nodes) if (node?.id) totals.set(node.id, toTotals(node));
    }
    return { ok: true, totals };
  } catch (e) {
    console.error("[shopify_totals]", e instanceof Error ? e.message : "unknown");
    return { ok: false, totals: new Map() };
  }
}

export async function shopifyTotals(ids: (string | null | undefined)[]): Promise<Map<string, ShopifyTotals>> {
  return (await loadShopifyTotals(ids)).totals;
}

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

export type InvoiceShopify = {
  loadError: boolean;
  hasDocs: boolean;
  depositPaid: number | null;
  depositSource: "none" | "shopify" | "cash" | "mixed" | "unverified";
  depositNote: string;
  gross: number | null;
  credit: number | null;
  other: number | null;
  payable: number | null;
  planSku: string;
};

export async function invoiceShopify(rows: { deposits: Record<string, unknown>[]; cremations: Record<string, unknown>[]; company: Record<string, unknown>[]; products: Record<string, unknown>[] }): Promise<InvoiceShopify> {
  const live = (row: Record<string, unknown>) => String(row.status || "") !== "cancelled" && !row.cancelled_at && !row.is_test;
  const deposits = rows.deposits.filter((row) => live(row));
  const depIds = deposits.map((row) => String(row.shopify_order_id || "")).filter(Boolean).map(gid);
  const docs = new Set<string>();
  const linked = new Set<string>();
  for (const row of rows.company.filter((item) => live(item) && item.order_type !== "deposit")) {
    if (row.linked_id) linked.add(String(row.linked_id));
    const id = String(row.shopify_order_id || row.shopify_draft_id || "");
    if (id) docs.add(gid(id));
  }
  const loose = rows.cremations.filter((row) => live(row) && !linked.has(String(row.id)));
  const drafts = await bookingDraftIds(loose.filter((row) => !row.shopify_order_id).map((row) => String(row.id)));
  for (const row of loose) {
    const id = String(row.shopify_order_id || drafts.get(String(row.id)) || "");
    if (id) docs.add(gid(id));
  }
  for (const row of rows.products.filter(live)) if (row.shopify_order_id) docs.add(String(row.shopify_order_id));
  const loaded = await loadShopifyTotals([...depIds, ...docs]);
  const empty: InvoiceShopify = { loadError: true, hasDocs: false, depositPaid: null, depositSource: "unverified", depositNote: "Shopify 未能讀取，已收訂金未改為 0", gross: null, credit: null, other: null, payable: null, planSku: "" };
  if (!loaded.ok) return empty;
  const inputs: DepositInput[] = deposits.map((row) => ({
    status: String(row.status || ""),
    paymentStatus: String(row.payment_status || ""),
    paymentAmount: Number(row.payment_amount || 0),
    shopifyOrderId: row.shopify_order_id ? gid(String(row.shopify_order_id)) : "",
    isTest: !!row.is_test,
  }));
  const remote = (id: string): RemotePayment | null => {
    const total = loaded.totals.get(gid(id));
    if (!total) return { found: false, paid: false, voided: false, refunded: false, net: 0 };
    return { found: true, paid: total.paid, voided: total.cancelled, refunded: total.refunded, net: total.received };
  };
  const deposit = summarizeDeposits(inputs, remote, false);
  const list = [...docs].map((id) => loaded.totals.get(id)).filter((item): item is ShopifyTotals => !!item && !item.cancelled && (item.kind === "order" || item.open));
  const sum = (key: "gross" | "credit" | "other" | "payable") => Math.round(list.reduce((total, item) => total + item[key], 0) * 100) / 100;
  return {
    loadError: false,
    hasDocs: list.length > 0,
    depositPaid: deposit.amount,
    depositSource: deposit.source,
    depositNote: deposit.notes.filter((item, index) => deposit.notes.indexOf(item) === index).join("；"),
    gross: list.length ? sum("gross") : null,
    credit: list.length ? sum("credit") : null,
    other: list.length ? sum("other") : null,
    payable: list.length ? sum("payable") : null,
    planSku: selectPlanSku(list.flatMap((item) => item.lines)),
  };
}
