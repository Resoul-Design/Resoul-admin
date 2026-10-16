"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasModule, requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isRslProjectNo } from "@/lib/order-label";

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
    plan,
    service_date: g("service_date"),
    service_time: g("service_time"),
    pickup_address: g("pickup_address"),
    notes: g("notes"),
    ...(status ? { status } : {}),
  };
  // 收費金額（確認方案後填寫；已付款不可修改；獸醫評估不收費）
  const rawAmount = formData.get("payment_amount");
  if (rawAmount !== null && key === "bookings") {
    const { data: payRow } = await supabase.from("cremation_bookings").select("payment_status").eq("id", id).maybeSingle();
    if (payRow?.payment_status !== "paid") {
      const text = String(rawAmount).replace(/[,\s]/g, "");
      const n = text === "" ? null : Number(text);
      if (n === null || (Number.isInteger(n) && n >= 0 && n <= 1_000_000)) update.payment_amount = n;
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
