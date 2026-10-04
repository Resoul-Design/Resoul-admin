"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopDomain, shopifyGraphQL } from "@/lib/shopify";
import { isRslProjectNo } from "@/lib/order-label";
import { logAudit } from "@/lib/audit";
import { CREMATION_TYPES, DEPOSIT_TYPES } from "@/lib/catalog";
import { PLAN_CODES } from "@/lib/company";
import { findTimeSlot } from "@/lib/deposit-followup";

// 後台「＋ 新增訂單」（火化預約／接送服務）：與網站相同流程——
// 先建立預約記錄（專案編號＋付款參考），再開 Shopify 草稿訂單（帶同一 payment_ref），
// 客人付款後 orders/paid webhook 按 payment_ref 自動標記已付款。

export type BookingOrderMode = "cremation" | "deposit";

export type BookingOrderState = {
  error?: string;
  created?: {
    projectNo: string;
    paymentRef: string;
    draftId: string;
    draftName: string;
    invoiceUrl: string;
    adminUrl: string;
    amount: string;
    productLabel: string;
    ownerName: string;
    contact: string;
    email: string;
  };
};

export type BookingInvoiceState = { error?: string; sent?: boolean };

const MODULE: Record<BookingOrderMode, string> = { cremation: "bookings", deposit: "deposits" };
const TYPES: Record<BookingOrderMode, string[]> = { cremation: CREMATION_TYPES, deposit: DEPOSIT_TYPES };

type VariantResponse = {
  productVariant: {
    id: string;
    title: string;
    price: string | null;
    product: { title: string; productType: string | null; status: string };
  } | null;
};

type DraftResponse = {
  draftOrderCreate: {
    draftOrder: { id: string; name: string; invoiceUrl: string | null; totalPriceSet: { shopMoney: { amount: string } } } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
};

const VARIANT_QUERY = `query BookingVariant($id: ID!) {
  productVariant(id: $id) { id title price product { title productType status } }
}`;

const DRAFT_MUTATION = `mutation CreateBookingDraftOrder($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder { id name invoiceUrl totalPriceSet { shopMoney { amount } } }
    userErrors { field message }
  }
}`;

const INVOICE_MUTATION = `mutation SendBookingDraftInvoice($id: ID!) {
  draftOrderInvoiceSend(id: $id) { draftOrder { id } userErrors { field message } }
}`;

function hkYYMMDD() {
  const hk = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return hk.toISOString().slice(2, 10).replace(/-/g, "");
}

// 與網站相同格式：RSL-YYMMDD-8 位隨機碼；PAY-時間碼-8 位隨機碼
function makeProjectNo() {
  const code = Array.from(randomBytes(5), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8).toUpperCase();
  return `RSL-${hkYYMMDD()}-${code}`;
}
function makePaymentRef() {
  return `PAY-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function field(data: FormData, name: string, max: number) {
  return String(data.get(name) || "").trim().slice(0, max);
}

export async function createBookingOrder(_prev: BookingOrderState, data: FormData): Promise<BookingOrderState> {
  const mode: BookingOrderMode = data.get("mode") === "deposit" ? "deposit" : "cremation";
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  if (!hasModule(staff, [MODULE[mode]])) return { error: "沒有此功能的使用權限。" };

  const ownerName = field(data, "ownerName", 100);
  const contact = field(data, "contact", 40);
  const email = field(data, "email", 254);
  const enteredProject = field(data, "projectNo", 40).toUpperCase();
  const petName = field(data, "petName", 100);
  const petType = field(data, "petType", 80);
  const serviceDate = field(data, "serviceDate", 10);
  const serviceTimeRaw = field(data, "serviceTime", 60);
  const address = field(data, "address", 300);
  const note = field(data, "note", 1000);
  const variantId = field(data, "variantId", 120);

  if (!ownerName) return { error: "請填寫主人稱呼。" };
  if (!contact) return { error: "請填寫聯絡電話。" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "電郵格式無效。" };
  if (enteredProject && !isRslProjectNo(enteredProject)) return { error: "專案編號格式應為 RSL-年月日-代碼；新客人請留空。" };
  if (serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return { error: "日期格式無效。" };
  if (!/^gid:\/\/shopify\/ProductVariant\/[A-Za-z0-9_-]+$/.test(variantId)) return { error: "請選擇產品。" };
  const serviceTime = serviceTimeRaw ? findTimeSlot(serviceTimeRaw)?.zh || "" : "";

  // 以 Shopify 核對產品：只可使用本頁相關類型的上架產品
  let variant: NonNullable<VariantResponse["productVariant"]>;
  try {
    const res = await shopifyGraphQL<VariantResponse>(VARIANT_QUERY, { id: variantId });
    if (!res.productVariant) return { error: "找不到所選產品，請重新選擇。" };
    variant = res.productVariant;
  } catch {
    return { error: "未能讀取 Shopify 產品，請稍後再試。" };
  }
  if (variant.product.status !== "ACTIVE" || !TYPES[mode].includes((variant.product.productType || "").trim())) {
    return { error: "此產品不屬於本頁可選的產品。" };
  }

  const projectNo = enteredProject || makeProjectNo();
  const paymentRef = makePaymentRef();
  const price = Number(variant.price || 0);
  const variantLabel = variant.title && variant.title !== "Default Title" ? `（${variant.title}）` : "";
  const productLabel = `${variant.product.title}${variantLabel}`;
  const staffName = staff.name || staff.email;
  const notes = [
    `專案編號：${projectNo}`,
    `付款參考: ${paymentRef}`,
    `產品: ${productLabel}`,
    serviceTime ? `希望時段: ${serviceTime}` : "",
    `後台建立：${staffName}`,
    note ? `備註: ${note}` : "",
  ].filter(Boolean).join(" | ");

  const supabase = createAdminClient();
  const table = mode === "deposit" ? "deposit_bookings" : "cremation_bookings";
  const planKey = Object.keys(PLAN_CODES).find((k) => variant.product.title.includes(k));
  const row: Record<string, string | number | null> =
    mode === "deposit"
      ? {
          owner_name: ownerName, contact, project_no: projectNo, pet_name: petName || null, pet_type: petType || null,
          plan: "預約接送訂金", service_date: serviceDate || null, service_time: serviceTime || null,
          pickup_address: address || null, notes, source: "admin:deposit", status: "new",
          payment_ref: paymentRef, payment_status: "pending", payment_amount: price, payment_currency: "HKD",
        }
      : {
          owner_name: ownerName, contact, pet_name: petName || null, pet_type: petType || null,
          // cremation_bookings.service_time 為 time 類型，只接受 14:00 等時間；希望時段文字已寫入 notes（列表由 notes 讀取）
          plan: planKey || variant.product.title, service_date: serviceDate || null, service_time: null,
          pickup_address: address || null, notes, source: "admin:cremation", status: "new",
          payment_ref: paymentRef, payment_status: "pending", payment_amount: price, payment_currency: "HKD",
        };
  const { data: inserted, error: insertError } = await supabase.from(table).insert(row).select("id").single();
  if (insertError) {
    console.error("[booking_order_insert]", insertError.message);
    return { error: `未能建立預約記錄：${insertError.message}` };
  }

  const refAttributes = [
    { key: "payment_ref", value: paymentRef },
    { key: "Project No", value: projectNo },
  ];
  const input = {
    ...(email ? { email } : {}),
    note: [`Resoul Admin ${mode === "deposit" ? "接送訂金" : "火化預約"}`, `主人：${ownerName}`, `電話：${contact}`, petName ? `寵物：${petName}` : "", `專案編號：${projectNo}`].filter(Boolean).join("\n"),
    tags: ["Resoul Admin", mode === "deposit" ? "Pickup Deposit" : "Cremation"],
    customAttributes: refAttributes,
    lineItems: [{ variantId, quantity: 1, customAttributes: refAttributes }],
  };

  try {
    const res = await shopifyGraphQL<DraftResponse>(DRAFT_MUTATION, { input });
    const payload = res.draftOrderCreate;
    if (payload.userErrors.length || !payload.draftOrder?.invoiceUrl) {
      await supabase.from(table).delete().eq("payment_ref", paymentRef);
      return { error: payload.userErrors.map((e) => e.message).join("；") || "Shopify 沒有回傳付款連結，請稍後再試。" };
    }
    const draft = payload.draftOrder;
    if (mode === "deposit") {
      // 訂金跟進會重用此付款連結（未執行 migration_deposit_followup.sql 時略過）
      await supabase
        .from("deposit_bookings")
        .update({ payment_link: draft.invoiceUrl, payment_link_at: new Date().toISOString(), payment_draft_id: draft.id })
        .eq("payment_ref", paymentRef);
    } else if (inserted?.id) {
      // 火化付款跟進會重用此付款連結（未執行 migration_follow_ups.sql 時略過）
      await supabase
        .from("follow_up_marks")
        .upsert({ entity: "cremation", ref: inserted.id, payment_link: draft.invoiceUrl, payment_link_at: new Date().toISOString(), payment_draft_id: draft.id }, { onConflict: "entity,ref" });
    }
    await logAudit(mode === "deposit" ? "create_deposit_order" : "create_cremation_order", table, null, `${projectNo}｜${productLabel}｜${draft.name}`);
    revalidatePath(mode === "deposit" ? "/deposits" : "/bookings");
    revalidatePath("/");
    const host = shopDomain().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return {
      created: {
        projectNo,
        paymentRef,
        draftId: draft.id,
        draftName: draft.name,
        invoiceUrl: draft.invoiceUrl!,
        adminUrl: `https://${host}/admin/draft_orders/${draft.id.split("/").pop()}`,
        amount: draft.totalPriceSet.shopMoney.amount,
        productLabel,
        ownerName,
        contact,
        email,
      },
    };
  } catch (e) {
    console.error("[booking_order_draft]", e instanceof Error ? e.message : "unknown error");
    await supabase.from(table).delete().eq("payment_ref", paymentRef);
    return { error: "建立 Shopify 付款頁失敗，預約記錄未有保存，請確認 Shopify 連線後重試。" };
  }
}

export async function sendBookingInvoice(_prev: BookingInvoiceState, data: FormData): Promise<BookingInvoiceState> {
  const mode: BookingOrderMode = data.get("mode") === "deposit" ? "deposit" : "cremation";
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  if (!hasModule(staff, [MODULE[mode]])) return { error: "沒有此功能的使用權限。" };
  const id = String(data.get("draftId") || "");
  if (!/^gid:\/\/shopify\/DraftOrder\/[A-Za-z0-9_-]+$/.test(id)) return { error: "草稿訂單編號無效。" };
  try {
    const res = await shopifyGraphQL<{ draftOrderInvoiceSend: { draftOrder: { id: string } | null; userErrors: { message: string }[] } }>(INVOICE_MUTATION, { id });
    const payload = res.draftOrderInvoiceSend;
    if (payload.userErrors.length) return { error: payload.userErrors.map((e) => e.message).join("；") };
    if (!payload.draftOrder) return { error: "Shopify 沒有確認寄送結果，請到 Shopify 草稿訂單核對。" };
    return { sent: true };
  } catch {
    return { error: "付款連結未能寄出，請到 Shopify 草稿訂單確認後再試。" };
  }
}
