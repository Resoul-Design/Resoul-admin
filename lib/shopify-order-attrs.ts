// Shopify 訂單「其他詳細資訊」：所有訂單統一寫入 Invoice No、Order Type、Project No、payment_ref、Owner、Phone、Pet，
// 令 Order Printer 發票及 Shopify 後台都見到公司單號。資料以後台記錄為準。
// 規則：Invoice No、Order Type、Project No、payment_ref 以後台為準（不同則更新）；Owner、Phone、Pet 只在未有時補上（不覆蓋同事在 Shopify 的修改）。
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";

type Attr = { key: string; value: string };

// 只處理此時間之後建立的訂單（用戶決定：舊單不改，只為以後新開的單補上）
export const SYNC_SINCE = "2026-11-08T03:00:00Z"; // 香港時間 2026-11-08 11:00
type Info = { invoiceNo: string; orderType: string; projectNo: string; paymentRef: string; owner: string; phone: string; pet: string };

const TYPE_LABEL = { deposit: "預約接送訂金", cremation: "善終／告別套餐", vet: "安樂在家", product: "紀念品／加購", other: "其他／自訂" } as const;
const ORDERS = `query RecentOrders($first: Int!, $query: String) { orders(first: $first, sortKey: CREATED_AT, reverse: true, query: $query) { nodes { id customAttributes { key value } } } }`;
const UPDATE = `mutation OrderAttrs($input: OrderInput!) { orderUpdate(input: $input) { order { id } userErrors { message } } }`;
const gid = (id: unknown) => { const s = String(id || ""); return s.startsWith("gid://shopify/Order/") ? s : /^\d+$/.test(s) ? `gid://shopify/Order/${s}` : ""; };
const str = (v: unknown) => (v == null ? "" : String(v).trim());

// 後台記錄 → 每張 Shopify 訂單應有的資料
async function loadInfo(orderIds: string[]): Promise<Map<string, Info>> {
  const out = new Map<string, Info>();
  if (!orderIds.length) return out;
  const db = createAdminClient();
  const nums = orderIds.map((id) => id.split("/").pop() as string);
  const both = [...orderIds, ...nums];
  const [dep, cre, po, co] = await Promise.all([
    db.from("deposit_bookings").select("shopify_order_id, invoice_no, project_no, payment_ref, owner_name, contact, pet_name").in("shopify_order_id", both),
    db.from("cremation_bookings").select("shopify_order_id, invoice_no, case_no, notes, source, payment_ref, owner_name, contact, pet_name").in("shopify_order_id", both),
    db.from("product_orders").select("shopify_order_id, invoice_no, project_no, customer_name, phone").in("shopify_order_id", orderIds),
    db.from("company_orders").select("shopify_order_id, invoice_no, project_no, order_type, payment_ref, customer_name, phone, pet_name, linked_id").in("shopify_order_id", orderIds),
  ]);
  const set = (id: unknown, info: Info) => { const g = gid(id); if (g && info.invoiceNo) out.set(g, { ...(out.get(g) || {}), ...Object.fromEntries(Object.entries(info).filter(([, v]) => v)) } as Info); };
  for (const r of po.data || []) set(r.shopify_order_id, { invoiceNo: str(r.invoice_no), orderType: TYPE_LABEL.product, projectNo: str(r.project_no), paymentRef: "", owner: str(r.customer_name), phone: str(r.phone), pet: "" });
  for (const r of co.data || []) set(r.shopify_order_id, { invoiceNo: str(r.invoice_no), orderType: TYPE_LABEL[r.order_type as keyof typeof TYPE_LABEL] || "", projectNo: str(r.project_no), paymentRef: r.linked_id ? str(r.payment_ref) : "", owner: str(r.customer_name), phone: str(r.phone), pet: str(r.pet_name) });
  for (const r of dep.data || []) set(r.shopify_order_id, { invoiceNo: str(r.invoice_no), orderType: TYPE_LABEL.deposit, projectNo: str(r.project_no), paymentRef: str(r.payment_ref), owner: str(r.owner_name), phone: str(r.contact), pet: str(r.pet_name) });
  for (const r of cre.data || []) {
    const project = canonicalProjectNo(str(r.case_no), projectNoFromNotes(str(r.notes)));
    set(r.shopify_order_id, { invoiceNo: str(r.invoice_no), orderType: str(r.source).includes("euthanasia") ? TYPE_LABEL.vet : TYPE_LABEL.cremation, projectNo: project === "—" ? "" : project, paymentRef: /^PAY-/i.test(str(r.payment_ref)) ? str(r.payment_ref) : "", owner: str(r.owner_name), phone: str(r.contact), pet: str(r.pet_name) });
  }
  return out;
}

function merged(attrs: Attr[], info: Info): Attr[] | null {
  const next = attrs.map(({ key, value }) => ({ key, value: value ?? "" }));
  let changed = false;
  const has = (key: string) => next.find((a) => a.key.toLowerCase() === key.toLowerCase());
  const put = (key: string, value: string, overwrite: boolean) => {
    if (!value) return;
    const cur = has(key);
    if (!cur) { next.push({ key, value }); changed = true; }
    else if (overwrite && cur.value !== value) { cur.value = value; changed = true; }
  };
  put("Invoice No", info.invoiceNo, true);
  put("Order Type", info.orderType, true);
  put("Project No", info.projectNo, true);
  put("payment_ref", info.paymentRef, true);
  put("Owner", has("Customer name")?.value ? "" : info.owner, false);
  put("Phone", info.phone, false);
  put("Pet", has("Pet name")?.value ? "" : info.pet, false);
  return changed ? next : null;
}

// 檢查最近的 Shopify 訂單（或指定訂單），補上／更正資料欄位；只限 SYNC_SINCE 之後建立的訂單；回傳更新數目
export async function syncOrderAttributes(opts: { first?: number; orderIds?: string[] } = {}): Promise<{ checked: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  const ids = opts.orderIds?.length ? `(${opts.orderIds.map((id) => `id:${id.split("/").pop()}`).join(" OR ")}) AND ` : "";
  const query = `${ids}created_at:>=${SYNC_SINCE}`;
  const res = await shopifyGraphQL<{ orders: { nodes: { id: string; customAttributes: Attr[] }[] } }>(ORDERS, { first: Math.min(250, opts.first || opts.orderIds?.length || 30), query });
  const orders = res.orders.nodes;
  const info = await loadInfo(orders.map((o) => o.id));
  let updated = 0;
  for (const o of orders) {
    const i = info.get(o.id);
    if (!i) continue;
    const attrs = merged(o.customAttributes, i);
    if (!attrs) continue;
    try {
      const u = await shopifyGraphQL<{ orderUpdate: { userErrors: { message: string }[] } }>(UPDATE, { input: { id: o.id, customAttributes: attrs } });
      if (u.orderUpdate.userErrors.length) errors.push(`${o.id}: ${u.orderUpdate.userErrors.map((e) => e.message).join("；")}`);
      else updated++;
    } catch (e) {
      errors.push(`${o.id}: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  return { checked: orders.length, updated, errors };
}
