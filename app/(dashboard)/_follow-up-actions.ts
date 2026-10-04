"use server";

import { createDraftWithCustomer } from "@/lib/shopify-customer";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";
import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";
import { loadCatalog } from "@/lib/catalog";
import type { FollowEntity } from "@/lib/follow-up";

// 統一跟進（火化服務、獸醫評估、紀念品訂單）的操作；接送服務沿用 deposits/actions.ts

const MODULE: Record<FollowEntity, string> = { cremation: "bookings", vet: "vet_assessments", product: "orders" };
const ENTITY_LABEL: Record<FollowEntity, string> = { cremation: "火化預約", vet: "獸醫評估", product: "紀念品訂單" };
const NOT_READY = "未啟用跟進：請先於 Supabase（diyxcx）執行 db/migration_follow_ups.sql。";
const LINK_REUSE_MS = 7 * 24 * 60 * 60 * 1000;

type Result = { error?: string; link?: string };

function validRef(entity: FollowEntity, ref: string) {
  return entity === "product" ? /^gid:\/\/shopify\/(Order|DraftOrder)\/\d+$/.test(ref) : /^[0-9a-f-]{36}$/i.test(ref);
}

function revalidate() {
  revalidatePath("/bookings");
  revalidatePath("/vet-assessments");
  revalidatePath("/orders");
  revalidatePath("/");
}

async function upsertMark(entity: FollowEntity, ref: string, fields: Record<string, unknown>) {
  const { error } = await createAdminClient()
    .from("follow_up_marks")
    .upsert({ entity, ref, ...fields, updated_at: new Date().toISOString() }, { onConflict: "entity,ref" });
  return error;
}

// reminded：已提醒（獸醫評估：已聯絡）；contacted：已付款後已聯絡安排；closed：不再跟進
export async function markFollowUp(entity: FollowEntity, ref: string, action: "reminded" | "contacted" | "closed"): Promise<Result> {
  if (!MODULE[entity]) return { error: "類別無效。" };
  await requireModule(MODULE[entity]);
  if (!validRef(entity, ref)) return { error: "記錄無效。" };
  const now = new Date().toISOString();
  let fields: Record<string, unknown>;
  let detail: string;
  if (action === "reminded") {
    const { data, error } = await createAdminClient().from("follow_up_marks").select("reminder_count").eq("entity", entity).eq("ref", ref).maybeSingle();
    if (error) return { error: NOT_READY };
    const count = Number(data?.reminder_count || 0) + 1;
    fields = { reminded_at: now, reminder_count: count };
    detail = `${entity === "vet" ? "已聯絡" : "已提醒"}（第 ${count} 次）`;
  } else if (action === "contacted") {
    fields = { contacted_at: now };
    detail = "已聯絡安排";
  } else {
    fields = { closed_at: now };
    detail = "不再跟進";
  }
  const error = await upsertMark(entity, ref, fields);
  if (error) return { error: /follow_up_marks/.test(error.message) ? NOT_READY : "未能儲存，請稍後再試。" };
  await logAudit("follow_up", entity === "product" ? "product_orders" : "cremation_bookings", entity === "product" ? null : ref, `${ENTITY_LABEL[entity]}｜${detail}${entity === "product" ? `｜${ref.split("/").pop()}` : ""}`);
  revalidate();
  return {};
}

type DraftResponse = {
  draftOrderCreate: {
    draftOrder: { id: string; name: string; invoiceUrl: string | null } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
};
const DRAFT_MUTATION = `mutation CreateFollowUpDraft($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder { id name invoiceUrl }
    userErrors { field message }
  }
}`;

// 產生付款連結：火化以 Shopify 草稿訂單（自訂項目，金額＝預約金額，帶同一付款參考，付款後自動標記已付款）；
// 紀念品草稿直接用原有付款頁；獸醫評估不收費
export async function createFollowPaymentLink(entity: FollowEntity, ref: string): Promise<Result> {
  if (!MODULE[entity]) return { error: "類別無效。" };
  await requireModule(MODULE[entity]);
  if (!validRef(entity, ref)) return { error: "記錄無效。" };
  if (entity === "vet") return { error: "獸醫評估不需要付款連結。" };

  if (entity === "product") {
    const draft = (await loadSouvenirDrafts()).find((d) => d.id === ref);
    if (!draft?.invoiceUrl) return { error: "此訂單沒有可用的付款頁，請在 Shopify 處理。" };
    const error = await upsertMark("product", ref, { payment_link: draft.invoiceUrl, payment_link_at: new Date().toISOString(), payment_draft_id: draft.id });
    if (error) return { link: draft.invoiceUrl, error: NOT_READY };
    return { link: draft.invoiceUrl };
  }

  const supabase = createAdminClient();
  const { data: mark, error: markError } = await supabase.from("follow_up_marks").select("payment_link, payment_link_at").eq("entity", "cremation").eq("ref", ref).maybeSingle();
  if (markError) return { error: NOT_READY };
  if (mark?.payment_link && mark.payment_link_at && Date.now() - new Date(mark.payment_link_at).getTime() < LINK_REUSE_MS) {
    return { link: mark.payment_link };
  }
  const { data: b } = await supabase
    .from("cremation_bookings")
    .select("id, owner_name, contact, pet_name, plan, payment_ref, payment_status, payment_amount, case_no, notes, source")
    .eq("id", ref)
    .maybeSingle();
  if (!b || String(b.source || "").includes("euthanasia")) return { error: "找不到此火化預約。" };
  if (b.payment_status === "paid") return { error: "此預約已付款。" };
  const amount = Number(b.payment_amount || 0);
  if (!(amount > 0)) return { error: "此預約未有收費金額，請先於 Shopify 或「編輯資料」確認方案及金額。" };

  // 舊記錄未有付款參考時補上，令客人付款後 webhook 能對回此預約
  let paymentRef = b.payment_ref as string | null;
  if (!paymentRef) {
    paymentRef = `PAY-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const { error } = await supabase.from("cremation_bookings").update({ payment_ref: paymentRef }).eq("id", ref);
    if (error) return { error: "未能建立付款參考，請稍後再試。" };
  }
  const projectNo = canonicalProjectNo(b.case_no, projectNoFromNotes(b.notes));
  const product = (b.notes || "").match(/產品[:：]\s*([^|｜]+)/)?.[1]?.trim() || b.plan || "火化服務";
  const attrs = [{ key: "payment_ref", value: paymentRef }, ...(projectNo !== "—" ? [{ key: "Project No", value: projectNo }] : [])];

  // 優先配對 Shopify 火化產品款式（方案＋體重），配對不到才用自訂項目（按預約金額）
  const norm = (v: string) => v.replace(/\s+/g, "").replace(/[–—-]/g, "-").toLowerCase();
  const weight = product.match(/（([^）]+)）\s*$/)?.[1] || (b.notes || "").match(/體重[:：]\s*([^|｜]+)/)?.[1]?.trim() || "";
  const { products } = await loadCatalog("cremation");
  const planName = String(b.plan || product);
  const match = products.find((p) => planName.includes(p.title.split(" ")[0]) || p.title.includes(planName));
  const variant = match?.variants.find((v) => weight && norm(v.title) === norm(weight)) || (match?.variants.length === 1 ? match.variants[0] : undefined);
  const lineItem = variant && Math.abs(Number(variant.price || 0) - amount) < 0.01
    ? { variantId: variant.id, quantity: 1, customAttributes: attrs }
    : {
        title: product,
        quantity: 1,
        originalUnitPriceWithCurrency: { amount: amount.toFixed(2), currencyCode: "HKD" },
        requiresShipping: false,
        taxable: false,
        customAttributes: attrs,
      };
  const input = {
    note: ["Resoul Admin 火化預約（付款跟進）", `主人：${b.owner_name || "—"}`, `電話：${b.contact || "—"}`, b.pet_name ? `寵物：${b.pet_name}` : "", projectNo !== "—" ? `專案編號：${projectNo}` : ""].filter(Boolean).join("\n"),
    tags: ["Resoul Admin", "Cremation"],
    customAttributes: attrs,
    lineItems: [lineItem],
  };
  try {
    const res = await createDraftWithCustomer<DraftResponse>(DRAFT_MUTATION, input, { name: b.owner_name, phone: b.contact });
    const payload = res.draftOrderCreate;
    if (payload.userErrors.length) return { error: payload.userErrors.map((e) => e.message).join("；") + "（如持續失敗，請在 Shopify 為此預約建立付款連結）" };
    if (!payload.draftOrder?.invoiceUrl) return { error: "Shopify 沒有回傳付款連結，請稍後再試。" };
    const draft = payload.draftOrder;
    const error = await upsertMark("cremation", ref, { payment_link: draft.invoiceUrl, payment_link_at: new Date().toISOString(), payment_draft_id: draft.id });
    await logAudit("create_cremation_payment_link", "cremation_bookings", ref, draft.name);
    revalidate();
    return error ? { link: draft.invoiceUrl!, error: "付款連結已產生，但未能儲存。" } : { link: draft.invoiceUrl! };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    console.error("[cremation_payment_link]", message);
    return { error: /access|scope|permission/i.test(message)
      ? "Shopify 權限不足，未能以預約金額建立付款連結；請在 Shopify 為此預約建立草稿訂單，或先於「編輯資料」確認方案及體重。"
      : "產生付款連結失敗，請確認 Shopify 連線後重試。" };
  }
}
