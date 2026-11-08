// 後台與 Shopify 對帳：比較付款狀態、金額、取消／退款、付款連結、開新單記錄、紀念品訂單及單號。
// 只讀取；修正由 app/(dashboard)/sync/_reconcile-actions.ts 執行（只改後台，按 Shopify 實際資料）。
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";

type Money = { shopMoney: { amount: string } };
type SOrder = { id: string; name: string; createdAt: string; displayFinancialStatus: string; cancelledAt: string | null; test: boolean; totalPriceSet: Money; customAttributes: { key: string; value: string | null }[] };
type SDraft = { id: string; name: string; status: string; order: { id: string; name: string } | null; totalPriceSet: Money };

export type FixKind = "booking-paid" | "booking-cancel" | "company-paid" | "product-refresh";
export type Issue = {
  category: string;
  invoiceNo: string;
  text: string;
  fix?: { kind: FixKind; table?: "deposit_bookings" | "cremation_bookings"; id: string; orderId?: string };
  link?: string;
};
export type ReconcileResult = { checkedAt: string; counts: Record<string, number>; issues: Issue[] };

const TYPE: Record<string, string> = { deposit: "預約接送訂金", cremation: "善終／告別套餐", vet: "安樂在家", product: "紀念品／加購", other: "其他／自訂" };
const gid = (id: unknown) => { const s = String(id || ""); return s.startsWith("gid://") ? s : /^\d+$/.test(s) ? `gid://shopify/Order/${s}` : ""; };
const num = (v: unknown) => Number(v || 0);
const paidS = (o: SOrder) => ["PAID", "PARTIALLY_REFUNDED"].includes(o.displayFinancialStatus);

async function pages<T>(query: string, key: "orders" | "draftOrders"): Promise<T[]> {
  const out: T[] = [];
  let after: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r: Record<string, { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: T[] }> = await shopifyGraphQL(query, { after });
    out.push(...r[key].nodes);
    if (!r[key].pageInfo.hasNextPage) break;
    after = r[key].pageInfo.endCursor;
  }
  return out;
}

export async function reconcile(opts: { includeTest?: boolean } = {}): Promise<ReconcileResult> {
  const db = createAdminClient();
  const live = opts.includeTest ? () => true : (test: unknown) => !test;
  const [orders, drafts, dep, cre, po, co, marks] = await Promise.all([
    pages<SOrder>(`query($after: String) { orders(first: 100, after: $after, sortKey: CREATED_AT, reverse: true) { pageInfo { hasNextPage endCursor } nodes { id name createdAt displayFinancialStatus cancelledAt test totalPriceSet { shopMoney { amount } } customAttributes { key value } } } }`, "orders"),
    pages<SDraft>(`query($after: String) { draftOrders(first: 100, after: $after, sortKey: UPDATED_AT, reverse: true) { pageInfo { hasNextPage endCursor } nodes { id name status order { id name } totalPriceSet { shopMoney { amount } } } } }`, "draftOrders"),
    db.from("deposit_bookings").select("id, invoice_no, owner_name, payment_status, payment_amount, shopify_order_id, shopify_order_name, payment_draft_id, status, is_test").then((r) => (r.data || []).filter((x) => live(x.is_test))),
    db.from("cremation_bookings").select("id, invoice_no, owner_name, payment_status, payment_amount, deposit_credit, shopify_order_id, shopify_order_name, status, source, is_test").then((r) => (r.data || []).filter((x) => live(x.is_test))),
    db.from("product_orders").select("shopify_order_id, order_name, invoice_no, financial_status, total_amount, cancelled_at, is_test").then((r) => (r.data || []).filter((x) => live(x.is_test))),
    db.from("company_orders").select("id, invoice_no, order_type, status, amount, shopify_draft_id, shopify_order_id, linked_id, details").then((r) => r.data || []),
    db.from("follow_up_marks").select("entity, ref, payment_draft_id").not("payment_draft_id", "is", null).then((r) => r.data || []),
  ]);
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const byDraft = new Map(drafts.map((d) => [d.id, d]));
  const testOrder = new Set(opts.includeTest ? [] : orders.filter((o) => o.test).map((o) => o.id));
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);

  // 1) 接送訂金、火化／獸醫 vs Shopify 訂單
  for (const [label, table, rows] of [["接送", "deposit_bookings", dep], ["火化／獸醫", "cremation_bookings", cre]] as const) {
    for (const r of rows as Record<string, unknown>[]) {
      const no = String(r.invoice_no ?? "—");
      const who = `${label}${r.is_test ? "（測試）" : ""}｜${String(r.owner_name || "")}${r.shopify_order_name ? `｜${r.shopify_order_name}` : ""}`;
      const id = gid(r.shopify_order_id);
      if (id) {
        const o = byOrder.get(id);
        if (!o) { add({ category: "Shopify 找不到訂單", invoiceNo: no, text: who }); continue; }
        if (o.test && !opts.includeTest) continue;
        if (r.payment_status === "paid" && !paidS(o) && !o.cancelledAt && !/REFUND|VOID/.test(o.displayFinancialStatus)) add({ category: "付款狀態不一致", invoiceNo: no, text: `${who}：後台已付款，Shopify ${o.displayFinancialStatus}` });
        if (r.payment_status !== "paid" && paidS(o)) add({ category: "付款狀態不一致", invoiceNo: no, text: `${who}：Shopify 已付款，後台 ${r.payment_status}`, fix: { kind: "booking-paid", table, id: String(r.id), orderId: o.id } });
        const refunded = /REFUND|VOID/.test(o.displayFinancialStatus);
        if ((o.cancelledAt && r.status !== "cancelled") || (refunded && r.payment_status !== "refunded")) add({ category: "Shopify 已取消／退款，後台未更新", invoiceNo: no, text: `${who}：Shopify ${o.cancelledAt ? "已取消" : ""}${refunded ? `（${o.displayFinancialStatus}）` : ""}`, fix: { kind: "booking-cancel", table, id: String(r.id), orderId: o.id } });
        const expect = num(r.payment_amount) - (table === "cremation_bookings" ? num(r.deposit_credit) : 0);
        const got = num(o.totalPriceSet.shopMoney.amount);
        if (r.payment_status === "paid" && r.payment_amount != null && Math.abs(expect - got) > 0.5) add({ category: "金額不一致", invoiceNo: no, text: `${who}：後台應收 HK$${expect}，Shopify HK$${got}` });
      } else if (r.payment_status === "paid") {
        add({ category: "後台已付款但沒有 Shopify 訂單", invoiceNo: no, text: who });
      }
    }
  }
  // 2) 付款連結已付款但後台未標記
  const pendingDraft = (draftId: unknown) => { const d = draftId ? byDraft.get(String(draftId)) : undefined; return d && d.status === "COMPLETED" && d.order && !testOrder.has(d.order.id) ? d : null; };
  for (const r of dep as Record<string, unknown>[]) {
    const d = r.payment_status !== "paid" ? pendingDraft(r.payment_draft_id) : null;
    if (d) add({ category: "付款連結已付款，後台未標記", invoiceNo: String(r.invoice_no ?? "—"), text: `接送｜${r.owner_name}：${d.name} → ${d.order?.name}`, fix: { kind: "booking-paid", table: "deposit_bookings", id: String(r.id), orderId: d.order!.id } });
  }
  for (const m of marks as Record<string, unknown>[]) {
    const r = (cre as Record<string, unknown>[]).find((x) => x.id === m.ref);
    const d = r && r.payment_status !== "paid" ? pendingDraft(m.payment_draft_id) : null;
    if (r && d) add({ category: "付款連結已付款，後台未標記", invoiceNo: String(r.invoice_no ?? "—"), text: `火化／獸醫｜${r.owner_name}：${d.name} → ${d.order?.name}`, fix: { kind: "booking-paid", table: "cremation_bookings", id: String(r.id), orderId: d.order!.id } });
  }
  // 3) 開新單記錄
  for (const c of co as Record<string, unknown>[]) {
    const no = String(c.invoice_no ?? "—");
    const d = c.shopify_draft_id ? byDraft.get(String(c.shopify_draft_id)) : undefined;
    if (d?.order && testOrder.has(d.order.id)) continue;
    if (!c.shopify_draft_id && c.status !== "cancelled") add({ category: "開新單未同步 Shopify", invoiceNo: no, text: `${TYPE[String(c.order_type)] || c.order_type}：請在單詳情按「重試同步」`, link: `/new-order/${c.id}` });
    else if (d && d.status === "COMPLETED" && c.status !== "paid" && c.status !== "cancelled") add({ category: "開新單記錄未標記已付款", invoiceNo: no, text: `${TYPE[String(c.order_type)] || c.order_type}：Shopify 已付款（${d.order?.name}）`, fix: { kind: "company-paid", id: String(c.id), orderId: d.order?.id } });
    else if (d && d.status === "OPEN" && c.status === "paid") add({ category: "開新單狀態不一致", invoiceNo: no, text: `${TYPE[String(c.order_type)] || c.order_type}：後台已付款，Shopify 付款連結未付款`, link: `/new-order/${c.id}` });
    if (d && !c.linked_id) {
      const expect = num(c.amount) - num((c.details as { depositCredit?: { amount?: number } | null } | null)?.depositCredit?.amount);
      const got = num(d.totalPriceSet.shopMoney.amount);
      if (Math.abs(expect - got) > 0.5) add({ category: "金額不一致", invoiceNo: no, text: `開新單 ${TYPE[String(c.order_type)] || c.order_type}：後台 HK$${expect}，Shopify HK$${got}`, link: `/new-order/${c.id}` });
    }
  }
  // 4) 紀念品訂單
  for (const p of po as Record<string, unknown>[]) {
    const o = byOrder.get(String(p.shopify_order_id));
    const no = String(p.invoice_no ?? "—");
    if (!o) { add({ category: "Shopify 找不到訂單", invoiceNo: no, text: `紀念品｜${p.order_name}` }); continue; }
    if (o.test && !opts.includeTest) continue;
    const diff = String(p.financial_status || "") !== o.displayFinancialStatus || !!p.cancelled_at !== !!o.cancelledAt || Math.abs(num(p.total_amount) - num(o.totalPriceSet.shopMoney.amount)) > 0.5;
    if (diff) add({ category: "紀念品訂單資料過時", invoiceNo: no, text: `${p.order_name}：後台 ${p.financial_status} HK$${p.total_amount}${p.cancelled_at ? "（已取消）" : ""}，Shopify ${o.displayFinancialStatus} HK$${o.totalPriceSet.shopMoney.amount}${o.cancelledAt ? "（已取消）" : ""}`, fix: { kind: "product-refresh", id: o.id, orderId: o.id } });
  }
  // 5) Shopify 訂單未入後台
  const known = new Set<string>([
    ...(dep as Record<string, unknown>[]).map((r) => gid(r.shopify_order_id)), ...(cre as Record<string, unknown>[]).map((r) => gid(r.shopify_order_id)),
    ...(po as Record<string, unknown>[]).map((r) => String(r.shopify_order_id)), ...(co as Record<string, unknown>[]).map((r) => String(r.shopify_order_id || "")),
  ].filter(Boolean));
  const testKnown = await db.from("product_orders").select("shopify_order_id").eq("is_test", true).then((r) => new Set((r.data || []).map((x) => x.shopify_order_id)));
  const testBook = await Promise.all([
    db.from("deposit_bookings").select("shopify_order_id").eq("is_test", true),
    db.from("cremation_bookings").select("shopify_order_id").eq("is_test", true),
  ]).then((rs) => new Set(rs.flatMap((r) => (r.data || []).map((x) => gid(x.shopify_order_id)))));
  for (const o of orders) {
    if (o.test || known.has(o.id) || testKnown.has(o.id) || testBook.has(o.id)) continue;
    add({ category: "Shopify 訂單未入後台", invoiceNo: "—", text: `${o.name}｜${o.createdAt.slice(0, 10)}｜${o.displayFinancialStatus}｜HK$${o.totalPriceSet.shopMoney.amount}：請按頁頂「立即同步 Shopify 訂單」` });
  }
  const counts: Record<string, number> = { "Shopify 訂單": orders.length, "付款連結": drafts.length, 接送: dep.length, "火化／獸醫": cre.length, 紀念品: po.length, 開新單: co.length };
  return { checkedAt: new Date().toISOString(), counts, issues };
}
