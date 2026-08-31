"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateFinance(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) return;
  const num = (k: string) => {
    const v = String(formData.get(k) || "").trim();
    return v === "" ? null : Number(v);
  };
  const supabase = await createClient();
  await supabase
    .from("cremation_bookings")
    .update({ amount: num("amount"), cost: num("cost") })
    .eq("id", id);
  revalidatePath("/finance");
  revalidatePath("/");
}
