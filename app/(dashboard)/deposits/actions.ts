"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { requireModule } from "@/lib/auth";

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
