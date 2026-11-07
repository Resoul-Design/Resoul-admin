"use server";

// 單號詳細頁：編輯服務記錄（接送訂金、火化／安樂在家、開新單），保存後同步 Shopify。
// Shopify：已付款訂單用 orderUpdate；未付款付款連結（草稿）用 draftOrderUpdate；只改主人、電話、寵物欄位，其他自訂欄位保留。
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { phoneKey } from "@/lib/product-orders";

export type RecordKind = "deposit" | "cremation" | "company";
export type RecordValues = {
  owner_name?: string; contact?: string; email?: string; pet_name?: string; pet_type?: string;
  service_date?: string; service_time?: string; pickup_address?: string; notes?: string;
};
type Attr = { key: string; value: string };
type UserErrors = { userErrors: { message: string }[] };

const ORDER_QUERY = `query RecordOrder($id: ID!) { order(id: $id) { customAttributes { key value } } }`;
const ORDER_UPDATE = `mutation RecordOrderUpdate($input: OrderInput!) { orderUpdate(input: $input) { order { id } userErrors { message } } }`;
const DRAFT_QUERY = `query RecordDraft($id: ID!) { draftOrder(id: $id) { status customAttributes { key value } } }`;
const DRAFT_UPDATE = `mutation RecordDraftUpdate($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { draftOrder { id } userErrors { message } } }`;

const t = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const orderGid = (id: unknown) => {
  const s = String(id || "");
  return s.startsWith("gid://shopify/Order/") ? s : /^\d+$/.test(s) ? `gid://shopify/Order/${s}` : null;
};

// 以新值取代 Owner／Phone／Pet（不分大小寫，亦取代網站結帳用的 Customer name／Pet name）；空值＝移除
function mergeAttrs(attrs: Attr[], updates: { key: string; aliases: string[]; value: string }[]) {
  const drop = new Set(updates.flatMap((u) => [u.key, ...u.aliases].map((k) => k.toLowerCase())));
  const kept = attrs.filter((a) => !drop.has(a.key.toLowerCase())).map(({ key, value }) => ({ key, value }));
  return [...kept, ...updates.filter((u) => u.value).map((u) => ({ key: u.key, value: u.value }))];
}

async function syncShopify(orderId: string | null, draftId: string | null, owner: string, phone: string, pet: string): Promise<string> {
  const updates = [
    { key: "Owner", aliases: ["Customer name"], value: owner },
    { key: "Phone", aliases: [], value: phone },
    { key: "Pet", aliases: ["Pet name"], value: pet },
  ];
  try {
    if (orderId) {
      const cur = await shopifyGraphQL<{ order: { customAttributes: Attr[] } | null }>(ORDER_QUERY, { id: orderId });
      if (!cur.order) return "找不到 Shopify 訂單，後台已保存。";
      const res = await shopifyGraphQL<{ orderUpdate: UserErrors }>(ORDER_UPDATE, { input: { id: orderId, customAttributes: mergeAttrs(cur.order.customAttributes, updates) } });
      return res.orderUpdate.userErrors.length ? `Shopify 訂單未能更新：${res.orderUpdate.userErrors.map((e) => e.message).join("；")}` : "";
    }
    if (draftId) {
      const cur = await shopifyGraphQL<{ draftOrder: { status: string; customAttributes: Attr[] } | null }>(DRAFT_QUERY, { id: draftId });
      if (!cur.draftOrder || cur.draftOrder.status === "COMPLETED") return "";
      const res = await shopifyGraphQL<{ draftOrderUpdate: UserErrors }>(DRAFT_UPDATE, { id: draftId, input: { customAttributes: mergeAttrs(cur.draftOrder.customAttributes, updates) } });
      return res.draftOrderUpdate.userErrors.length ? `Shopify 付款連結未能更新：${res.draftOrderUpdate.userErrors.map((e) => e.message).join("；")}` : "";
    }
    return "";
  } catch (e) {
    console.error("[record_shopify_sync]", e instanceof Error ? e.message : "unknown");
    return "未能連接 Shopify，後台已保存；請稍後再按一次保存。";
  }
}

export async function updateServiceRecord(kind: RecordKind, id: string, input: RecordValues): Promise<{ error?: string; warning?: string }> {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  if (!["deposit", "cremation", "company"].includes(kind) || !/^[0-9a-f-]{36}$/i.test(id)) return { error: "記錄無效。" };
  const admin = createAdminClient();

  const owner = t(input.owner_name, 100);
  const phone = t(input.contact, 40);
  const pet = t(input.pet_name, 100);
  if (!owner) return { error: "請填寫主人姓名。" };
  if (!phoneKey(phone)) return { error: "請填寫有效電話。" };
  const serviceDate = t(input.service_date, 10);
  if (serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return { error: "日期格式無效。" };
  const email = t(input.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "電郵格式無效。" };

  let orderId: string | null = null;
  let draftId: string | null = null;
  let invoiceNo: number | null = null;
  if (kind === "deposit") {
    if (!hasModule(staff, ["deposits"])) return { error: "沒有此功能的使用權限。" };
    const { data: r } = await admin.from("deposit_bookings").select("shopify_order_id, payment_draft_id, invoice_no").eq("id", id).maybeSingle();
    if (!r) return { error: "找不到此記錄。" };
    const { error } = await admin.from("deposit_bookings").update({
      owner_name: owner, contact: phone, pet_name: pet || null, pet_type: t(input.pet_type, 80) || null,
      service_date: serviceDate || null, service_time: t(input.service_time, 60) || null,
      pickup_address: t(input.pickup_address, 300) || null, notes: t(input.notes, 4000) || null,
    }).eq("id", id);
    if (error) return { error: "未能保存，請稍後再試。" };
    orderId = orderGid(r.shopify_order_id);
    draftId = r.payment_draft_id || null;
    invoiceNo = r.invoice_no ?? null;
  } else if (kind === "cremation") {
    const { data: r } = await admin.from("cremation_bookings").select("shopify_order_id, invoice_no, source").eq("id", id).maybeSingle();
    if (!r) return { error: "找不到此記錄。" };
    const vet = String(r.source || "").includes("euthanasia");
    if (!hasModule(staff, [vet ? "vet_assessments" : "bookings"])) return { error: "沒有此功能的使用權限。" };
    const { error } = await admin.from("cremation_bookings").update({
      owner_name: owner, contact: phone, pet_name: pet || null, pet_type: t(input.pet_type, 80) || null,
      service_date: serviceDate || null, service_time: t(input.service_time, 60) || null,
      pickup_address: t(input.pickup_address, 300) || null, notes: t(input.notes, 4000) || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return { error: "未能保存，請稍後再試。" };
    const { data: mark } = await admin.from("follow_up_marks").select("payment_draft_id").eq("entity", vet ? "vet" : "cremation").eq("ref", id).maybeSingle();
    orderId = orderGid(r.shopify_order_id);
    draftId = (mark?.payment_draft_id as string | null) || null;
    invoiceNo = r.invoice_no ?? null;
  } else {
    const { data: r } = await admin.from("company_orders").select("order_type, shopify_order_id, shopify_draft_id, invoice_no, linked_id").eq("id", id).maybeSingle();
    if (!r) return { error: "找不到此記錄。" };
    if (r.linked_id) return { error: "此單的資料請在對應的接送／火化記錄修改。" };
    if (!hasModule(staff, ["orders"])) return { error: "沒有此功能的使用權限。" };
    const { error } = await admin.from("company_orders").update({
      customer_name: owner, phone, phone_key: phoneKey(phone), email: email || null, pet_name: pet || null, updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return { error: "未能保存，請稍後再試。" };
    orderId = orderGid(r.shopify_order_id);
    draftId = r.shopify_draft_id || null;
    invoiceNo = r.invoice_no ?? null;
  }

  // 開新單記錄跟隨服務記錄（主人、電話、寵物）
  if (kind !== "company") {
    await admin.from("company_orders").update({ customer_name: owner, phone, phone_key: phoneKey(phone), pet_name: pet || null, updated_at: new Date().toISOString() }).eq("linked_id", id);
  }
  const warning = await syncShopify(orderId, draftId, owner, phone, pet);
  await logAudit("update_service_record", kind === "deposit" ? "deposit_bookings" : kind === "cremation" ? "cremation_bookings" : "company_orders", id, `單號 ${invoiceNo ?? "—"}｜修改主人／電話／寵物等資料${warning ? `｜${warning}` : "｜已同步 Shopify"}`);
  for (const p of ["/services", "/deposits", "/bookings", "/vet-assessments", "/orders"]) revalidatePath(p);
  if (invoiceNo) revalidatePath(`/logistics/${invoiceNo}`);
  return warning ? { warning } : {};
}
