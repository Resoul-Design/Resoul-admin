"use server";
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { deriveLogisticsCosts, expandedLogisticsRow } from "@/lib/logistics-auto-costs";

type UpdateResult = { error?: string; warning?: string };
type CustomerDataInput = FormData | Record<string, string>;

function hasInputValue(input: CustomerDataInput, key: string) {
  return input instanceof FormData ? input.has(key) : Object.prototype.hasOwnProperty.call(input, key);
}

function inputValue(input: CustomerDataInput, key: string) {
  return input instanceof FormData ? input.get(key) : input[key];
}

export function updateCustomerData(invoice: string, formData: FormData): Promise<void>;
export function updateCustomerData(invoice: string, formData: Record<string, string>): Promise<UpdateResult>;
export async function updateCustomerData(invoice: string, formData: CustomerDataInput): Promise<void | UpdateResult> {
  const fromForm = formData instanceof FormData;
  const fail = (message: string): UpdateResult => ({ error: message });
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) {
    if (fromForm) throw new Error("沒有權限");
    return fail("沒有權限");
  }
  const editable = ["owner_name", "phone", "email", "pet_name", "arrival_date", "arrival_time", "plan", "driver", "pickup_type", "pickup_from", "pickup_surcharge", "delivery_cost_to_customer", "commission", "invoice_amount", "deposit_received", "balance_settled", "package_price", "urn", "endup_profit", "memorial_remarks", "memorial_supplier", "product_pickup_or_delivery_on"];
  const values: Record<string, string | null> = Object.fromEntries(
    editable
      .filter((key) => hasInputValue(formData, key))
      .map((key) => [key, String(inputValue(formData, key) || "").trim() || null]),
  );
  const validationError =
    values.phone && !/^[+\d\s()-]{8,20}$/.test(values.phone) ? "電話格式不正確"
      : values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) ? "電郵格式不正確"
        : values.arrival_date && !/^\d{4}-\d{2}-\d{2}$/.test(values.arrival_date) ? "日期格式不正確"
          : "";
  if (validationError) {
    if (fromForm) throw new Error(validationError);
    return fail(validationError);
  }
  const admin = createAdminClient();
  const invoiceValue = Number(invoice) || invoice;
  const [{ data: current }, { data: logisticsRows }, { data: productOrders }, { data: companyOrders }] = await Promise.all([
    admin.from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle(),
    admin.from("logistics_orders").select("*").order("updated_at", { ascending: false }).limit(1000),
    admin.from("product_orders").select("*").eq("invoice_no", invoiceValue),
    admin.from("company_orders").select("*").eq("invoice_no", invoiceValue),
  ]);
  if (!current) {
    if (fromForm) throw new Error("找不到客戶物流記錄");
    return fail("找不到客戶物流記錄");
  }
  const automatic = deriveLogisticsCosts({ ...expandedLogisticsRow(current as Record<string, unknown>), ...values }, (logisticsRows || []) as Record<string, unknown>[], (productOrders || []) as Record<string, unknown>[], (companyOrders || []) as Record<string, unknown>[]);
  const payload = { ...values, memorial_addon_price: automatic.memorial_addon_price, driver_or_gogovan_cost: automatic.driver_or_gogovan_cost, urn_cost: automatic.urn_cost };
  const { error } = await admin.from("logistics_orders").update(payload).eq("invoice_no", invoice);
  if (error) {
    const message = `儲存失敗：${error.message}`;
    if (fromForm) throw new Error(message);
    return fail(message);
  }
  await logAudit("update_customer_data", "logistics_orders", invoice, `更新客戶資料：${Object.keys(payload).filter((key) => payload[key as keyof typeof payload] !== null).join("、")}`);
  revalidatePath(`/logistics/${encodeURIComponent(invoice)}`);
  revalidatePath(`/logistics/${encodeURIComponent(invoice)}/edit`);
  revalidatePath("/logistics");
  if (!fromForm) return {};
}