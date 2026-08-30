"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createBooking(formData: FormData) {
  const g = (k: string) => {
    const v = String(formData.get(k) || "").trim();
    return v || null;
  };
  const service_date = g("service_date");
  const supabase = await createClient();
  await supabase.from("cremation_bookings").insert({
    owner_name: g("owner_name"),
    contact: g("contact"),
    pet_name: g("pet_name"),
    pet_type: g("pet_type"),
    plan: g("plan"),
    pickup_address: g("pickup_address"),
    service_date,
    service_time: g("service_time"),
    notes: g("notes"),
    status: service_date ? "scheduled" : "new",
    source: "admin",
  });

  revalidatePath("/schedule");
  revalidatePath("/bookings");
  revalidatePath("/");
}

export async function scheduleBooking(formData: FormData) {
  const id = String(formData.get("id") || "");
  const date = String(formData.get("service_date") || "");
  const time = String(formData.get("service_time") || "");
  if (!id || !date) return;

  const supabase = await createClient();
  await supabase
    .from("cremation_bookings")
    .update({
      service_date: date,
      service_time: time || null,
      status: "scheduled",
    })
    .eq("id", id);

  revalidatePath("/schedule");
  revalidatePath("/bookings");
  revalidatePath("/");
}
