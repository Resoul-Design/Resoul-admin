"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isRslProjectNo } from "@/lib/order-label";

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
  await requireModule("bookings");
  const id = String(formData.get("id") || "");
  if (!id) return;

  const g = (k: string) => {
    const v = String(formData.get(k) || "").trim();
    return v || null;
  };
  const rawStatus = String(formData.get("status") || "new");
  const status = VALID.includes(rawStatus) ? rawStatus : "new";
  const plan = g("plan");

  const supabase = createAdminClient();

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
  await logAudit("update_booking", "cremation_bookings", id, `狀態=${status}`);
  revalidate();
}
