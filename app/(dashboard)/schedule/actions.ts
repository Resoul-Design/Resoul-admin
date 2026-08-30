"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
