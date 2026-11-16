// Shopify 優惠碼：列出、建立、啟用／停用；並把優惠碼套用到單號未付款的 Shopify 付款連結（草稿）。
// 需要 Shopify app 權限 read_discounts、write_discounts（未加時回傳 NO_SCOPE 訊息）。
import { unstable_cache } from "next/cache";
import { shopifyGraphQL } from "@/lib/shopify";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingDraftIds } from "@/lib/shopify-payable";

export const DISCOUNTS_TAG = "shopify-discounts";
export const NO_SCOPE = "Shopify app 未有優惠碼權限：請在 Shopify app 設定加入 read_discounts 及 write_discounts，並更新後台的 Shopify 金鑰。";

export type DiscountCode = {
  id: string; title: string; code: string; status: string; summary: string;
  startsAt: string | null; endsAt: string | null; usageLimit: number | null; used: number;
  combinesOrder: boolean; combinesProduct: boolean;
};

const LIST = `query Discounts($after: String) {
  codeDiscountNodes(first: 100, after: $after, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes { id codeDiscount {
      __typename
      ... on DiscountCodeBasic { title status summary startsAt endsAt usageLimit asyncUsageCount codes(first: 1) { nodes { code } } combinesWith { orderDiscounts productDiscounts } }
      ... on DiscountCodeBxgy { title status summary startsAt endsAt usageLimit asyncUsageCount codes(first: 1) { nodes { code } } combinesWith { orderDiscounts productDiscounts } }
      ... on DiscountCodeFreeShipping { title status summary startsAt endsAt usageLimit asyncUsageCount codes(first: 1) { nodes { code } } combinesWith { orderDiscounts productDiscounts } }
    } }
  }
}`;
type Node = { id: string; codeDiscount: { title?: string; status?: string; summary?: string; startsAt?: string | null; endsAt?: string | null; usageLimit?: number | null; asyncUsageCount?: number; codes?: { nodes: { code: string }[] }; combinesWith?: { orderDiscounts: boolean; productDiscounts: boolean } } };

const scopeError = (e: unknown) => /read_discounts|write_discounts|ACCESS_DENIED/i.test(e instanceof Error ? e.message : String(e));

async function fetchDiscounts(): Promise<DiscountCode[]> {
  const out: DiscountCode[] = [];
  let after: string | null = null;
  for (let page = 0; page < 5; page++) {
    const r: { codeDiscountNodes: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Node[] } } = await shopifyGraphQL(LIST, { after });
    for (const n of r.codeDiscountNodes.nodes) {
      const d = n.codeDiscount;
      const code = d.codes?.nodes[0]?.code;
      if (!code) continue;
      out.push({ id: n.id, title: d.title || code, code, status: d.status || "", summary: d.summary || "", startsAt: d.startsAt ?? null, endsAt: d.endsAt ?? null, usageLimit: d.usageLimit ?? null, used: d.asyncUsageCount ?? 0, combinesOrder: !!d.combinesWith?.orderDiscounts, combinesProduct: !!d.combinesWith?.productDiscounts });
    }
    if (!r.codeDiscountNodes.pageInfo.hasNextPage) break;
    after = r.codeDiscountNodes.pageInfo.endCursor;
  }
  return out;
}
const cached = unstable_cache(fetchDiscounts, ["shopify-discounts-v1"], { tags: [DISCOUNTS_TAG], revalidate: 300 });

export async function listDiscounts(fresh = false): Promise<{ codes: DiscountCode[]; error?: string }> {
  try { return { codes: fresh ? await fetchDiscounts() : await cached() }; }
  catch (e) { return { codes: [], error: scopeError(e) ? NO_SCOPE : "未能讀取 Shopify 優惠碼，請稍後再試。" }; }
}

export type NewDiscount = { code: string; title?: string; kind: "percent" | "amount"; value: number; startsAt: string; endsAt?: string | null; usageLimit?: number | null; oncePerCustomer?: boolean; minSubtotal?: number | null; combineOrder?: boolean };

const CREATE = `mutation Create($input: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $input) { codeDiscountNode { id } userErrors { field message } } }`;
export async function createDiscount(d: NewDiscount): Promise<{ error?: string }> {
  const input = {
    title: d.title?.trim() || d.code,
    code: d.code,
    startsAt: d.startsAt,
    ...(d.endsAt ? { endsAt: d.endsAt } : {}),
    ...(d.usageLimit ? { usageLimit: d.usageLimit } : {}),
    appliesOncePerCustomer: !!d.oncePerCustomer,
    context: { all: "ALL" },
    customerGets: { value: d.kind === "percent" ? { percentage: d.value / 100 } : { discountAmount: { amount: d.value.toFixed(2), appliesOnEachItem: false } }, items: { all: true } },
    ...(d.minSubtotal ? { minimumRequirement: { subtotal: { greaterThanOrEqualToSubtotal: d.minSubtotal.toFixed(2) } } } : {}),
    combinesWith: { orderDiscounts: d.combineOrder !== false, productDiscounts: true, shippingDiscounts: true },
  };
  try {
    const r = await shopifyGraphQL<{ discountCodeBasicCreate: { userErrors: { message: string }[] } }>(CREATE, { input });
    const errs = r.discountCodeBasicCreate.userErrors;
    return errs.length ? { error: errs.map((e) => e.message).join("；") } : {};
  } catch (e) { return { error: scopeError(e) ? NO_SCOPE : "未能建立優惠碼，請稍後再試。" }; }
}

export async function setDiscountActive(id: string, active: boolean): Promise<{ error?: string }> {
  const m = active
    ? `mutation A($id: ID!) { discountCodeActivate(id: $id) { userErrors { message } } }`
    : `mutation D($id: ID!) { discountCodeDeactivate(id: $id) { userErrors { message } } }`;
  try {
    const r = await shopifyGraphQL<Record<string, { userErrors: { message: string }[] }>>(m, { id });
    const errs = Object.values(r)[0]?.userErrors || [];
    return errs.length ? { error: errs.map((e) => e.message).join("；") } : {};
  } catch (e) { return { error: scopeError(e) ? NO_SCOPE : "未能更新優惠碼，請稍後再試。" }; }
}

// 套用到單號未付款的 Shopify 付款連結（接送訂金單除外）；code 空白＝移除優惠碼
const UPDATE = `mutation ApplyCode($id: ID!, $input: DraftOrderInput!) {
  draftOrderUpdate(id: $id, input: $input) { draftOrder { id name discountCodes totalDiscountsSet { shopMoney { amount } } } userErrors { field message } }
}`;
export async function applyCodeToInvoice(invoiceNo: number, code: string): Promise<{ applied: string[]; warnings: string[] }> {
  const admin = createAdminClient();
  const [co, cre] = await Promise.all([
    admin.from("company_orders").select("id, order_type, status, shopify_draft_id, shopify_order_id, linked_id").eq("invoice_no", invoiceNo),
    admin.from("cremation_bookings").select("id, status, payment_status, shopify_order_id").eq("invoice_no", invoiceNo),
  ]);
  const drafts = new Set<string>();
  const linked = new Set<string>();
  for (const c of co.data || []) {
    if (c.linked_id) linked.add(String(c.linked_id));
    if (c.order_type === "deposit" || c.status === "paid" || c.status === "cancelled" || c.shopify_order_id || !c.shopify_draft_id) continue;
    drafts.add(String(c.shopify_draft_id));
  }
  const loose = (cre.data || []).filter((r) => !linked.has(String(r.id)) && r.payment_status !== "paid" && r.status !== "cancelled" && !r.shopify_order_id).map((r) => String(r.id));
  for (const id of (await bookingDraftIds(loose)).values()) drafts.add(id);
  const applied: string[] = [], warnings: string[] = [];
  if (!drafts.size) { if (code) warnings.push("此單沒有未付款的 Shopify 付款連結，優惠碼只記錄在客戶資料（已付款的單不能再加優惠碼）。"); return { applied, warnings }; }
  for (const id of drafts) {
    try {
      const r = await shopifyGraphQL<{ draftOrderUpdate: { draftOrder: { name: string; discountCodes: string[] } | null; userErrors: { message: string }[] } }>(UPDATE, { id, input: { discountCodes: code ? [code] : [] } });
      const errs = r.draftOrderUpdate.userErrors;
      const d = r.draftOrderUpdate.draftOrder;
      if (errs.length) warnings.push(`${d?.name || "付款連結"}：${errs.map((e) => e.message).join("；")}`);
      else if (code && d && !d.discountCodes.map((x) => x.toUpperCase()).includes(code.toUpperCase())) warnings.push(`${d.name}：Shopify 未接受優惠碼「${code}」（可能已停用、未到開始日期，或不可與接送訂金抵扣合併）。`);
      else if (d) applied.push(d.name);
    } catch (e) {
      warnings.push(`付款連結：${e instanceof Error ? e.message.slice(0, 120) : "未能套用優惠碼"}`);
    }
  }
  return { applied, warnings };
}
