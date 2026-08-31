"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextCaseNo } from "@/lib/caseno";

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
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function updateBookingStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !VALID.includes(status)) return;

  const supabase = await createClient();
  await supabase.from("cremation_bookings").update({ status }).eq("id", id);
  revalidate();
}

export async function updateBooking(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;

  const g = (k: string) => {
    const v = String(formData.get(k) || "").trim();
    return v || null;
  };
  const status = String(formData.get("status") || "new");

  const supabase = await createClient();
  const case_no = g("case_no") || (await nextCaseNo(supabase));
  await supabase
    .from("cremation_bookings")
    .update({
      case_no,
      owner_name: g("owner_name"),
      contact: g("contact"),
      pet_name: g("pet_name"),
      pet_type: g("pet_type"),
      plan: g("plan"),
      service_date: g("service_date"),
      service_time: g("service_time"),
      pickup_address: g("pickup_address"),
      status: VALID.includes(status) ? status : "new",
      notes: g("notes"),
    })
    .eq("id", id);
  revalidate();
}
