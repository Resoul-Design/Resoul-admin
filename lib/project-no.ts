import type { SupabaseClient } from "@supabase/supabase-js";
import { TEST_INVOICE_BASE, testInvoiceLabel } from "@/lib/invoice-label";

// 新專案的專案編號＝公司單號（例如 290）：由資料庫一次過配號，專案編號與單號相同。
// 舊專案（RSL-YYMMDD-xxxxxxxx 或同事自訂編號）維持不變。需 db/migration_20261108_company_invoice_no.sql。
// 測試訂單：取下一個測試單號（900001 起），專案編號為 TEST-01 等；直接寫入 company_invoices，不影響正式單號
export async function newTestProjectNo(admin: SupabaseClient): Promise<string | null> {
  for (let tries = 0; tries < 5; tries++) {
    const { data } = await admin.from("company_invoices").select("invoice_no").gt("invoice_no", TEST_INVOICE_BASE).order("invoice_no", { ascending: false }).limit(1);
    const next = Number(data?.[0]?.invoice_no ?? TEST_INVOICE_BASE) + 1;
    const label = testInvoiceLabel(next);
    const { error } = await admin.from("company_invoices").insert({ invoice_no: next, project_no: label, manual: true, note: "測試訂單" });
    if (!error) return label;
    console.error("[new_test_project]", error.message);
  }
  return null;
}

export async function newCompanyProjectNo(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.rpc("new_company_project");
  if (error || data == null) {
    console.error("[new_company_project]", error?.message || "no number");
    return null;
  }
  return String(data);
}
