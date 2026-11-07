"use server";
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateCustomerData(invoice: string, formData: FormData) {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) throw new Error("沒有權限");
  const editable = ["owner_name", "phone", "email", "pet_name", "arrival_date", "arrival_time", "plan", "driver", "pickup_type", "pickup_from", "pickup_fee", "pickup_surcharge", "delivery_cost_to_customer", "driver_or_gogovan_cost", "commission", "memorial_cost", "endup_profit", "memorial_remarks", "memorial_supplier", "product_pickup_or_delivery_on"];
  const values = Object.fromEntries(editable.map((key) => [key, String(formData.get(key) || "").trim() || null]));
  await createAdminClient().from("logistics_orders").update(values).eq("invoice_no", invoice);
  revalidatePath(`/logistics/${encodeURIComponent(invoice)}`);
  revalidatePath("/logistics");
}

