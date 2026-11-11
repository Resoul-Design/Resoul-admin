"use server";
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { deriveLogisticsCosts, expandedLogisticsRow } from "@/lib/logistics-auto-costs";

export async function updateCustomerData(invoice: string, formData: FormData) {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) throw new Error("沒有權限");
  const editable = ["owner_name", "phone", "email", "pet_name", "arrival_date", "arrival_time", "plan", "driver", "pickup_type", "pickup_from", "pickup_surcharge", "delivery_cost_to_customer", "commission", "invoice_amount", "deposit_received", "balance_settled", "package_price", "urn", "endup_profit", "memorial_remarks", "memorial_supplier", "product_pickup_or_delivery_on"];
  const values = Object.fromEntries(editable.map((key) => [key, String(formData.get(key) || "").trim() || null]));
  if (values.phone && !/^[+\d\s()-]{8,20}$/.test(values.phone)) throw new Error("電話格式不正確");
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error("電郵格式不正確");
  if (values.arrival_date && !/^\d{4}-\d{2}-\d{2}$/.test(values.arrival_date)) throw new Error("日期格式不正確");
  const admin = createAdminClient();
  const invoiceValue = Number(invoice) || invoice;
  const [{ data: current }, { data: logisticsRows }, { data: productOrders }, { data: companyOrders }] = await Promise.all([
    admin.from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle(),
    admin.from("logistics_orders").select("*").order("updated_at", { ascending: false }).limit(1000),
    admin.from("product_orders").select("*").eq("invoice_no", invoiceValue),
    admin.from("company_orders").select("*").eq("invoice_no", invoiceValue),
  ]);
  if (!current) throw new Error("找不到客戶物流記錄");
  const automatic = deriveLogisticsCosts({ ...expandedLogisticsRow(current as Record<string, unknown>), ...values }, (logisticsRows || []) as Record<string, unknown>[], (productOrders || []) as Record<string, unknown>[], (companyOrders || []) as Record<string, unknown>[]);
  const payload = { ...values, memorial_addon_price: automatic.memorial_addon_price, driver_or_gogovan_cost: automatic.driver_or_gogovan_cost, memorial_cost: automatic.memorial_cost };
  const { error } = await admin.from("logistics_orders").update(payload).eq("invoice_no", invoice);
  if (error) throw new Error(`儲存失敗：${error.message}`);
  await logAudit("update_customer_data", "logistics_orders", invoice, `更新客戶資料：${Object.keys(payload).filter((key) => payload[key as keyof typeof payload] !== null).join("、")}`);
  revalidatePath(`/logistics/${encodeURIComponent(invoice)}`);
  revalidatePath(`/logistics/${encodeURIComponent(invoice)}/edit`);
  revalidatePath("/logistics");
}