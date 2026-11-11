// 司機名單：試算表歷史名稱，加上由該試算表匯入的客戶資料（source = basic_info_logistic）。
// 新司機先在試算表填寫，再經「由 Excel 同步」匯入。後台不會寫回試算表，也不會由歷史車費自動填司機費用。
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalDriver, driverChoices, EXCEL_DRIVERS } from "@/lib/driver-names";

export { canonicalDriver, EXCEL_DRIVERS };

export async function driverOptions(): Promise<string[]> {
  const { data } = await createAdminClient().from("logistics_orders").select("driver").eq("source", "basic_info_logistic").not("driver", "is", null).limit(5000);
  return driverChoices((data || []).map((row) => String(row.driver || "")));
}
