"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const VALID = [
  "new",
  "scheduled",
  "pickup",
  "cremating",
  "completed",
  "cancelled",
];

function revalidate() {
  revalidatePath("/bookings");
  revalidatePath("/vet-assessments");
  revalidatePath("/");
}

export async function updateBooking(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;

  const g = (k: string) => {
    const v = String(formData.get(k) || "").trim();
    return v || null;
  };
  const rawStatus = String(formData.get("status") || "new");
  const status = VALID.includes(rawStatus) ? rawStatus : "new";
  const plan = g("plan");

  const supabase = await createClient();

  const update: Record<string, unknown> = {
    owner_name: g("owner_name"),
    contact: g("contact"),
    pet_name: g("pet_name"),
    pet_type: g("pet_type"),
    plan,
    service_date: g("service_date"),
    service_time: g("service_time"),
    pickup_address: g("pickup_address"),
    status,
    notes: g("notes"),
  };
  // 專案編號用 Shopify 訂單名（#RESOUL-####）為單一真相，不再自動產生 RS-YYYYMM。
  // 只有管理員手動填寫內部 case_no 時才寫入；留空不覆蓋原值。
  const providedCaseNo = g("case_no");
  if (providedCaseNo) update.case_no = providedCaseNo;

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
  await logAudit("update_booking", "cremation_bookings", id, `狀態=${status}`);
  revalidate();
}
