"use server";
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateCustomerData(invoice: string, formData: FormData) {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) throw new Error("沒有權限");
  const values = Object.fromEntries(["owner_name", "phone", "pet_name", "arrival_date", "plan", "memorial_remarks"].map((key) => [key, String(formData.get(key) || "").trim() || null]));
  await createAdminClient().from("logistics_orders").update(values).eq("invoice_no", invoice);
  revalidatePath(`/logistics/${encodeURIComponent(invoice)}`);
  revalidatePath("/logistics");
}

