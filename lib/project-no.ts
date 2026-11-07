import type { SupabaseClient } from "@supabase/supabase-js";

// 新專案的專案編號＝公司單號（例如 290）：由資料庫一次過配號，專案編號與單號相同。
// 舊專案（RSL-YYMMDD-xxxxxxxx 或同事自訂編號）維持不變。需 db/migration_20261108_company_invoice_no.sql。
export async function newCompanyProjectNo(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.rpc("new_company_project");
  if (error || data == null) {
    console.error("[new_company_project]", error?.message || "no number");
    return null;
  }
  return String(data);
}
