"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModule, requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isRslProjectNo } from "@/lib/order-label";
import { loadCatalog } from "@/lib/catalog";
import { shopifyGraphQL } from "@/lib/shopify";

const VALID = [
  "new",
  "scheduled",
  "pickup",
  "cremating",
  "ready",
  "completed",
  "cancelled",
];

function revalidate() {
  revalidatePath("/bookings");
  revalidatePath("/vet-assessments");
  revalidatePath("/");
}

export async function updateBooking(formData: FormData) {
  const staff = await requireModule("bookings", "vet_assessments");
  const id = String(formData.get("id") || "");
  if (!id) return;
  const supabase = createAdminClient();
  // 獸醫評估（來源含 euthanasia）與火化預約分開權限
  const { data: current } = await supabase.from("cremation_bookings").select("source").eq("id", id).maybeSingle();
  if (!current) return;
  const key = String(current.source || "").includes("euthanasia") ? "vet_assessments" : "bookings";
  if (!hasModule(staff, [key])) throw new Error("沒有此功能的使用權限。");

  const g = (k: string) => {
    const v = String(formData.get(k) || "").trim();
    return v || null;
  };
  // 狀態由「更新進度」處理；舊表格如仍附帶狀態才更新
  const rawStatus = formData.get("status");
  const status = rawStatus !== null && VALID.includes(String(rawStatus)) ? String(rawStatus) : null;
  const plan = g("plan");

  const update: Record<string, unknown> = {
    owner_name: g("owner_name"),
    contact: g("contact"),
    pet_name: g("pet_name"),
    pet_type: g("pet_type"),
    // 獸醫評估表格沒有方案欄，不改動
    ...(formData.has("plan") ? { plan } : {}),
    service_date: g("service_date"),
    service_time: g("service_time"),
    pickup_address: g("pickup_address"),
    notes: g("notes"),
    ...(status ? { status } : {}),
  };
  // 收費金額（確認方案後填寫；已付款不可修改；獸醫評估不收費）
  const rawAmount = formData.get("payment_amount");
  let unpaid = false;
  let priceChanged = false;
  if (rawAmount !== null && key === "bookings") {
    const { data: payRow } = await supabase.from("cremation_bookings").select("payment_status, payment_amount").eq("id", id).maybeSingle();
    unpaid = payRow?.payment_status !== "paid";
    if (unpaid) {
      const text = String(rawAmount).replace(/[,\s]/g, "");
      const n = text === "" ? null : Number(text);
      if (n === null || (Number.isInteger(n) && n >= 0 && n <= 1_000_000)) {
        update.payment_amount = n;
        priceChanged = n !== (payRow?.payment_amount != null ? Number(payRow.payment_amount) : null);
      }
    }
  }
  // 揀了體重款式：備註記錄產品（付款連結及發票據此配對 Shopify 款式及產品代碼），並移除「待確認」字句
  const variantId = g("variant_id");
  if (variantId && key === "bookings") {
    const { products } = await loadCatalog("cremation");
    const product = products.find((p) => (!plan || p.title.includes(plan)) && p.variants.some((v) => v.id === variantId));
    const variant = product?.variants.find((v) => v.id === variantId);
    if (product && variant) {
      const label = variant.title === "Default Title" ? product.title : `${product.title}（${variant.title}）`;
      const before = String(update.notes || "");
      const kept = before.split(/\s*[|｜]\s*/).filter((part) => part && !/^(產品|體重)[:：]/.test(part) && !part.startsWith("方案及收費：待與客人確認"));
      const at = kept.findIndex((part) => part.startsWith("專案編號"));
      kept.splice(at + 1, 0, `產品: ${label}`);
      update.notes = kept.join(" | ");
      if (unpaid && !before.includes(`產品: ${label}`)) priceChanged = true;
    }
  }
  // 收費或款式改變：作廢舊付款連結，避免客人以舊價錢付款；下次產生連結時按新資料建立
  if (priceChanged) {
    const { data: mark } = await supabase.from("follow_up_marks").select("payment_draft_id").eq("entity", "cremation").eq("ref", id).maybeSingle();
    if (mark?.payment_draft_id) {
      try {
        await shopifyGraphQL(`mutation DeleteStaleDraft($input: DraftOrderDeleteInput!) { draftOrderDelete(input: $input) { deletedId userErrors { message } } }`, { input: { id: mark.payment_draft_id } });
      } catch (e) {
        console.error("[booking_stale_draft]", e instanceof Error ? e.message : "unknown");
      }
      await supabase.from("follow_up_marks").update({ payment_link: null, payment_link_at: null, payment_draft_id: null }).eq("entity", "cremation").eq("ref", id);
    }
  }
  // 只有跨服務沿用的 RSL 編號可以寫入 case_no。
  const providedCaseNo = g("case_no");
  if (providedCaseNo && isRslProjectNo(providedCaseNo)) {
    update.case_no = providedCaseNo.toUpperCase();
  }

  // 完成火化時，若未手動填收入/成本，按方案定價自動填入
  if (status === "completed" && plan) {
    const [{ data: cur }, { data: pp }] = await Promise.all([
      supabase.from("cremation_bookings").select("amount, cost").eq("id", id).maybeSingle(),
      supabase.from("plan_prices").select("price, cost").eq("plan", plan).maybeSingle(),
    ]);
    if (pp) {
      if (cur?.amount == null) update.amount = pp.price;
      if (cur?.cost == null) update.cost = pp.cost;
    }
  }

  await supabase.from("cremation_bookings").update(update).eq("id", id);
  await logAudit("update_booking", "cremation_bookings", id, status ? `狀態=${status}` : "編輯資料");
  revalidate();
}
