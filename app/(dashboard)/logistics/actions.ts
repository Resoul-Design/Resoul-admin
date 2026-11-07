"use server";
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export async function updateCustomerData(invoice: string, formData: FormData) {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) throw new Error("沒有權限");
  const editable = ["owner_name", "phone", "email", "pet_name", "arrival_date", "arrival_time", "package_name", "driver", "pickup_type", "pickup_from", "pickup_fee", "pickup_surcharge", "delivery_cost_to_customer", "driver_or_gogovan_cost", "commission", "invoice_amount", "deposit_received", "balance_settled", "package_price", "memorial_cost", "endup_profit", "memorial_remarks", "memorial_supplier", "product_pickup_or_delivery_on"];
  // 只更新表格內有的欄位（其他欄位保持不變，避免被清空）
  const values = Object.fromEntries(editable.filter((key) => formData.has(key)).map((key) => [key, String(formData.get(key) || "").trim() || null]));
  if (values.phone && !/^[+\d\s()-]{8,20}$/.test(values.phone)) throw new Error("電話格式不正確");
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error("電郵格式不正確");
  if (values.arrival_date && !/^\d{4}-\d{2}-\d{2}$/.test(values.arrival_date)) throw new Error("日期格式不正確");
  await createAdminClient().from("logistics_orders").update(values).eq("invoice_no", invoice);
  await logAudit("update_customer_data", "logistics_orders", invoice, `更新客戶資料：${Object.keys(values).filter((key) => values[key]).join("、")}`);
  revalidatePath(`/logistics/${encodeURIComponent(invoice)}`);
  revalidatePath("/logistics");
}