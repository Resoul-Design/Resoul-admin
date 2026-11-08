"use server";

// 紀念品／其他單在 Shopify 加入了火化方案：轉為火化預約（建立火化預約記錄，沿用同一單號、專案編號及付款連結）
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { CREMATION_TYPES } from "@/lib/catalog";
import { PLAN_CODES } from "@/lib/company";

type Line = { title: string; variantTitle: string | null; quantity: number; originalUnitPriceSet: { shopMoney: { amount: string } } | null; product: { productType: string | null } | null };
type Attr = { key: string; value: string };
const DRAFT = `query ConvDraft($id: ID!) { draftOrder(id: $id) { status tags customAttributes { key value } lineItems(first: 100) { nodes { title variantTitle quantity originalUnitPriceSet { shopMoney { amount } } product { productType } } } } }`;
const ORDER = `query ConvOrder($id: ID!) { order(id: $id) { name tags customAttributes { key value } lineItems(first: 100) { nodes { title variantTitle quantity originalUnitPriceSet { shopMoney { amount } } product { productType } } } } }`;
const DRAFT_UPDATE = `mutation ConvDraftUpdate($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { draftOrder { id } userErrors { message } } }`;
const ORDER_UPDATE = `mutation ConvOrderUpdate($input: OrderInput!) { orderUpdate(input: $input) { order { id } userErrors { message } } }`;

const label = (l: Line) => `${l.title}${l.variantTitle && l.variantTitle !== "Default Title" ? `（${l.variantTitle}）` : ""}`;
const isPlan = (l: Line) => CREMATION_TYPES.includes((l.product?.productType || "").trim()) || Object.keys(PLAN_CODES).some((k) => l.title.includes(k));

export async function convertToCremation(companyId: string): Promise<{ error?: string; done?: string }> {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["bookings"])) return { error: "沒有「火化預約」的使用權限。" };
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return { error: "記錄無效。" };
  const admin = createAdminClient();
  const { data: o } = await admin.from("company_orders").select("*").eq("id", companyId).maybeSingle();
  if (!o) return { error: "找不到此單。" };
  if (o.linked_id || !["product", "other"].includes(o.order_type)) return { error: "此單已是服務單，無須轉換。" };
  if (o.status === "cancelled") return { error: "此單已取消。" };

  // 讀取 Shopify 實際項目（已付款讀訂單，未付款讀付款連結草稿）
  let lines: Line[] = [];
  let attrs: Attr[] = [];
  let tags: string[] = [];
  let orderName = "";
  const paid = o.status === "paid" && !!o.shopify_order_id;
  try {
    if (paid) {
      const r = await shopifyGraphQL<{ order: { name: string; tags: string[]; customAttributes: Attr[]; lineItems: { nodes: Line[] } } | null }>(ORDER, { id: o.shopify_order_id });
      if (!r.order) return { error: "Shopify 找不到此訂單。" };
      lines = r.order.lineItems.nodes; attrs = r.order.customAttributes; tags = r.order.tags; orderName = r.order.name;
    } else if (o.shopify_draft_id) {
      const r = await shopifyGraphQL<{ draftOrder: { status: string; tags: string[]; customAttributes: Attr[]; lineItems: { nodes: Line[] } } | null }>(DRAFT, { id: o.shopify_draft_id });
      if (!r.draftOrder) return { error: "Shopify 付款連結已刪除，請重新開單。" };
      lines = r.draftOrder.lineItems.nodes; attrs = r.draftOrder.customAttributes; tags = r.draftOrder.tags;
    } else return { error: "此單未同步 Shopify。" };
  } catch {
    return { error: "未能連接 Shopify，請稍後再試。" };
  }
  const plan = lines.find(isPlan);
  if (!plan) return { error: "此單未有火化方案項目，無須轉換。" };
  const planName = Object.keys(PLAN_CODES).find((k) => plan.title.includes(k)) || plan.title;
  const gross = lines.reduce((n, l) => n + Number(l.originalUnitPriceSet?.shopMoney.amount || 0) * l.quantity, 0);
  const others = lines.filter((l) => l !== plan);
  const d = (o.details || {}) as { petType?: string | null; serviceDate?: string | null; address?: string | null; internalNote?: string | null };
  const who = staff.name || staff.email;
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

  // 1) 建立火化預約（同一專案編號 → 觸發器配同一單號）
  const notes = [
    `專案編號：${o.project_no}`,
    `付款參考: ${o.payment_ref}`,
    `產品: ${label(plan)}`,
    others.length ? `加購: ${others.map((l) => `${label(l)}×${l.quantity}`).join("、")}` : "",
    d.internalNote ? `備註: ${d.internalNote}` : "",
    `由${o.order_type === "product" ? "紀念品" : "其他"}單轉為火化預約：${who}（${today}）`,
  ].filter(Boolean).join(" | ");
  const row = {
    case_no: o.project_no, owner_name: o.customer_name, contact: o.phone, pet_name: o.pet_name, pet_type: d.petType || null,
    service_date: d.serviceDate || null, pickup_address: d.address || null, plan: planName, status: "new", source: "admin:cremation",
    payment_ref: o.payment_ref, payment_status: paid ? "paid" : "pending", payment_amount: gross, payment_currency: "HKD", notes,
    ...(paid ? { shopify_order_id: o.shopify_order_id, shopify_order_name: orderName, paid_at: o.updated_at || new Date().toISOString() } : {}),
  };
  let ins = await admin.from("cremation_bookings").insert(row).select("id, invoice_no").single();
  if (ins.error && /duplicate|unique/i.test(ins.error.message)) ins = await admin.from("cremation_bookings").insert({ ...row, case_no: null }).select("id, invoice_no").single();
  if (ins.error || !ins.data) return { error: `未能建立火化預約：${ins.error?.message || "未知錯誤"}` };
  const bookingId = ins.data.id as string;

  // 2) 開單記錄改為善終／告別套餐，並連結火化預約
  await admin.from("company_orders").update({ order_type: "cremation", linked_table: "cremation_bookings", linked_id: bookingId, amount: gross, updated_at: new Date().toISOString() }).eq("id", companyId);
  // 3) 付款跟進沿用同一付款連結
  if (!paid && o.shopify_draft_id) {
    await admin.from("follow_up_marks").upsert({ entity: "cremation", ref: bookingId, payment_link: o.shopify_invoice_url, payment_link_at: new Date().toISOString(), payment_draft_id: o.shopify_draft_id }, { onConflict: "entity,ref" });
  }
  // 4) Shopify：類型改為善終／告別套餐並加付款參考（客人付款後火化預約自動標記已付款）
  let warning = "";
  try {
    const nextAttrs = [...attrs.filter((a) => !["order type", "payment_ref"].includes(a.key.toLowerCase())).map(({ key, value }) => ({ key, value: value ?? "" })), { key: "Order Type", value: "善終／告別套餐" }, { key: "payment_ref", value: String(o.payment_ref) }];
    const nextTags = [...new Set([...tags.filter((t) => t !== "Memorial Product" && t !== "Other"), "Cremation"])];
    if (paid) {
      const r = await shopifyGraphQL<{ orderUpdate: { userErrors: { message: string }[] } }>(ORDER_UPDATE, { input: { id: o.shopify_order_id, customAttributes: nextAttrs, tags: nextTags } });
      if (r.orderUpdate.userErrors.length) warning = "Shopify 訂單未能更新類型。";
    } else {
      const r = await shopifyGraphQL<{ draftOrderUpdate: { userErrors: { message: string }[] } }>(DRAFT_UPDATE, { id: o.shopify_draft_id, input: { customAttributes: nextAttrs, tags: nextTags } });
      if (r.draftOrderUpdate.userErrors.length) warning = "Shopify 付款連結未能加付款參考，客人付款後請按「⟳ 全部同步」。";
    }
  } catch {
    warning = "未能更新 Shopify，客人付款後請按「⟳ 全部同步」。";
  }
  await logAudit("convert_to_cremation", "company_orders", companyId, `單號 ${o.invoice_no}：${o.order_type} 轉為火化預約（${planName}）`);
  for (const p of ["/services", "/bookings", "/orders", `/new-order/${companyId}`]) revalidatePath(p);
  return { done: `已轉為火化預約（${planName}）。${warning}` };
}
