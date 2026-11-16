"use server";

// 優惠碼管理：建立、啟用／停用（直接寫入 Shopify）
import { revalidatePath, revalidateTag } from "next/cache";
import { requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { DISCOUNTS_TAG, createDiscount, setDiscountActive, type NewDiscount } from "@/lib/discounts";

export async function addDiscount(d: NewDiscount): Promise<{ error?: string }> {
  await requireModule("discounts");
  const code = String(d.code || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return { error: "優惠碼須為 3–40 個英文字母、數字、- 或 _。" };
  const value = Number(d.value);
  if (!Number.isFinite(value) || value <= 0 || (d.kind === "percent" && value > 100)) return { error: d.kind === "percent" ? "折扣百分比須為 1–100。" : "折扣金額須大於 0。" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.startsAt || ""))) return { error: "請填寫開始日期。" };
  if (d.endsAt && !/^\d{4}-\d{2}-\d{2}$/.test(d.endsAt)) return { error: "結束日期格式無效。" };
  if (d.endsAt && d.endsAt < d.startsAt) return { error: "結束日期不可早於開始日期。" };
  const toIso = (day: string, end = false) => `${day}T${end ? "23:59:59" : "00:00:00"}+08:00`;
  const r = await createDiscount({
    ...d, code, value, startsAt: toIso(d.startsAt), endsAt: d.endsAt ? toIso(d.endsAt, true) : null,
    usageLimit: d.usageLimit && d.usageLimit > 0 ? Math.floor(d.usageLimit) : null, minSubtotal: d.minSubtotal && d.minSubtotal > 0 ? d.minSubtotal : null,
  });
  if (r.error) return r;
  await logAudit("create_discount", "shopify_discounts", code, `${d.kind === "percent" ? `${value}%` : `HK$${value}`}｜${d.startsAt}${d.endsAt ? `–${d.endsAt}` : ""}`);
  revalidateTag(DISCOUNTS_TAG);
  revalidatePath("/discounts");
  return {};
}

export async function toggleDiscount(id: string, code: string, active: boolean): Promise<{ error?: string }> {
  await requireModule("discounts");
  if (!/^gid:\/\/shopify\/DiscountCodeNode\/\d+$/.test(id)) return { error: "優惠碼無效。" };
  const r = await setDiscountActive(id, active);
  if (r.error) return r;
  await logAudit(active ? "activate_discount" : "deactivate_discount", "shopify_discounts", code, active ? "啟用" : "停用");
  revalidateTag(DISCOUNTS_TAG);
  revalidatePath("/discounts");
  return {};
}
