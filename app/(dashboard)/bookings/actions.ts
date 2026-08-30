"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const VALID = [
  "new",
  "scheduled",
  "pickup",
  "cremating",
  "completed",
  "cancelled",
];

export async function updateBookingStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!id || !VALID.includes(status)) return;

  const supabase = await createClient();
  await supabase.from("cremation_bookings").update({ status }).eq("id", id);
  revalidatePath("/bookings");
  revalidatePath("/");
}

export async function updateBookingNotes(formData: FormData) {
  const id = String(formData.get("id") || "");
  const notes = String(formData.get("notes") || "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("cremation_bookings").update({ notes }).eq("id", id);
  revalidatePath("/bookings");
}
