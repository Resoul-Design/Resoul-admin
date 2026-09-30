"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { requireModule } from "@/lib/auth";
import { shopifyGraphQL } from "@/lib/shopify";

const VALID = ["new", "contacted", "scheduled", "completed", "cancelled"];

export async function updateDeposit(formData: FormData) {
  await requireModule("deposits");
  const id = String(formData.get("id") || "");
  if (!id) return;
  const value = (key: string) => String(formData.get(key) || "").trim() || null;
  const rawStatus = String(formData.get("status") || "new");
  const status = VALID.includes(rawStatus) ? rawStatus : "new";
  await createAdminClient().from("deposit_bookings").update({
    owner_name: value("owner_name"),
    contact: value("contact"),
    pet_name: value("pet_name"),
    pet_type: value("pet_type"),
    service_date: value("service_date"),
    service_time: value("service_time"),
    pickup_address: value("pickup_address"),
    notes: value("notes"),
    status,
  }).eq("id", id);
  await logAudit("update_deposit", "deposit_bookings", id, `狀態=${status}`);
  revalidatePath("/deposits");
}

// ===== 訂金跟進（2026-10-01）=====
// 需先於 Supabase 執行 db/migration_deposit_followup.sql。

const DEPOSIT_SKU = "RS-DEPOSIT";
const LINK_REUSE_MS = 7 * 24 * 60 * 60 * 1000;
const FOLLOW_UP_MISSING = "未啟用訂金跟進：請先於 Supabase 執行 db/migration_deposit_followup.sql。";

type DepositVariantResponse = { productVariants: { edges: { node: { id: string } }[] } };
type DepositDraftResponse = {
  draftOrderCreate: {
    draftOrder: { id: string; name: string; invoiceUrl: string } | null;
    userErrors: { field: string[] | null; message: string }[];
  };
};

const DEPOSIT_VARIANT_QUERY = `query DepositVariant($query: String!) {
  productVariants(first: 1, query: $query) { edges { node { id } } }
}`;

const DEPOSIT_DRAFT_MUTATION = `mutation CreateDepositDraftOrder($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) {
    draftOrder { id name invoiceUrl }
    userErrors { field message }
  }
}`;

function followUpColumnMissing(message?: string) {
  return !!message && /reminded_at|reminder_count|follow_up_closed_at|payment_link|payment_draft_id/.test(message);
}

function revalidateFollowUp() {
  revalidatePath("/deposits");
  revalidatePath("/");
}

// 以 Shopify 草稿訂單重新產生訂金付款連結；帶同一 payment_ref，付款後 webhook 自動標記已付款。
export async function createDepositPaymentLink(id: string): Promise<{ link?: string; error?: string }> {
  await requireModule("deposits");
  if (!id) return { error: "記錄無效。" };
  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("deposit_bookings")
    .select("id, owner_name, pet_name, notes, status, payment_ref, payment_status, payment_link, payment_link_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: followUpColumnMissing(error.message) ? FOLLOW_UP_MISSING : "讀取記錄失敗，請稍後再試。" };
  if (!row) return { error: "找不到此記錄。" };
  if (row.payment_status === "paid" || row.payment_status === "refunded") return { error: "此訂金已付款或已退款，毋須付款連結。" };
  if (row.status === "cancelled" || row.status === "completed") return { error: "此記錄已取消或已完成。" };
  if (!row.payment_ref) return { error: "此記錄沒有付款參考號，未能配對付款，請聯絡管理員。" };
  if (row.payment_link && row.payment_link_at && Date.now() - new Date(row.payment_link_at).getTime() < LINK_REUSE_MS) {
    return { link: row.payment_link };
  }

  try {
    const variants = await shopifyGraphQL<DepositVariantResponse>(DEPOSIT_VARIANT_QUERY, { query: `sku:${DEPOSIT_SKU}` });
    const variantId = variants.productVariants.edges[0]?.node.id;
    if (!variantId) return { error: `Shopify 找不到訂金產品（SKU ${DEPOSIT_SKU}）。` };

    const projectNo = (row.notes || "").match(/(?:專案編號|Project no\.)[：:]\s*(RSL-[A-Z0-9]+-[A-Z0-9]+)/i)?.[1] || "";
    const refAttributes = [
      { key: "payment_ref", value: row.payment_ref },
      ...(projectNo ? [{ key: "Project No", value: projectNo }] : []),
    ];
    const input = {
      note: ["Resoul Admin 接送訂金（重新產生付款連結）", row.owner_name ? `主人：${row.owner_name}` : "", row.pet_name ? `寵物：${row.pet_name}` : "", projectNo ? `專案編號：${projectNo}` : ""].filter(Boolean).join("\n"),
      tags: ["Resoul Admin", "Pickup Deposit"],
      customAttributes: refAttributes,
      lineItems: [{ variantId, quantity: 1, customAttributes: refAttributes }],
    };
    const result = await shopifyGraphQL<DepositDraftResponse>(DEPOSIT_DRAFT_MUTATION, { input });
    const payload = result.draftOrderCreate;
    if (payload.userErrors.length) return { error: payload.userErrors.map((e) => e.message).join("；") };
    if (!payload.draftOrder?.invoiceUrl) return { error: "Shopify 沒有回傳付款連結，請稍後再試。" };

    const draft = payload.draftOrder;
    const { error: saveError } = await supabase
      .from("deposit_bookings")
      .update({ payment_link: draft.invoiceUrl, payment_link_at: new Date().toISOString(), payment_draft_id: draft.id })
      .eq("id", id);
    await logAudit("create_deposit_payment_link", "deposit_bookings", id, draft.name);
    revalidateFollowUp();
    if (saveError) return { link: draft.invoiceUrl, error: followUpColumnMissing(saveError.message) ? FOLLOW_UP_MISSING : "付款連結已產生，但未能儲存。" };
    return { link: draft.invoiceUrl };
  } catch (e) {
    console.error("[deposit_payment_link]", e instanceof Error ? e.message : "unknown error");
    return { error: "產生付款連結失敗，請確認 Shopify 連線後重試。" };
  }
}

export async function markDepositReminded(id: string): Promise<{ error?: string }> {
  await requireModule("deposits");
  if (!id) return { error: "記錄無效。" };
  const supabase = createAdminClient();
  const { data: row, error } = await supabase.from("deposit_bookings").select("reminder_count").eq("id", id).maybeSingle();
  if (error) return { error: followUpColumnMissing(error.message) ? FOLLOW_UP_MISSING : "讀取記錄失敗，請稍後再試。" };
  if (!row) return { error: "找不到此記錄。" };
  const count = Number(row.reminder_count || 0) + 1;
  const { error: saveError } = await supabase
    .from("deposit_bookings")
    .update({ reminded_at: new Date().toISOString(), reminder_count: count })
    .eq("id", id);
  if (saveError) return { error: "未能儲存，請稍後再試。" };
  await logAudit("mark_deposit_reminded", "deposit_bookings", id, `第 ${count} 次`);
  revalidateFollowUp();
  return {};
}

// 「已付款、未排期」：聯絡客人後標記為已聯絡，之後按現有流程排期。
export async function markDepositContacted(id: string): Promise<{ error?: string }> {
  await requireModule("deposits");
  if (!id) return { error: "記錄無效。" };
  const { error } = await createAdminClient().from("deposit_bookings").update({ status: "contacted" }).eq("id", id).eq("status", "new");
  if (error) return { error: "未能儲存，請稍後再試。" };
  await logAudit("update_deposit", "deposit_bookings", id, "狀態=contacted（訂金跟進）");
  revalidateFollowUp();
  return {};
}

export async function closeDepositFollowUp(id: string): Promise<{ error?: string }> {
  await requireModule("deposits");
  if (!id) return { error: "記錄無效。" };
  const { error } = await createAdminClient()
    .from("deposit_bookings")
    .update({ follow_up_closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: followUpColumnMissing(error.message) ? FOLLOW_UP_MISSING : "未能儲存，請稍後再試。" };
  await logAudit("close_deposit_follow_up", "deposit_bookings", id);
  revalidateFollowUp();
  return {};
}
