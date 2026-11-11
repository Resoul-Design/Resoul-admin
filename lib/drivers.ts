// 司機名單：來源為 Drive 試算表「Customers Record & Logistic」→「Basic Info Logistic」的 Driver 欄（2026-11-11 盤點），
// 另加由該試算表匯入後台的客戶資料（source = basic_info_logistic）中出現的司機。
// 新司機：先在試算表填寫，再經「由 Excel 同步」匯入，便會出現在選單；後台不會寫回試算表。
import { createAdminClient } from "@/lib/supabase/admin";

export const EXCEL_DRIVERS = ["Ricky", "Joe", "豪仔", "Vivian", "Yeah O2", "V's Dad", "豪仔 / Ho Jai", "Ho Jai", "Gary", "JH", "Tony", "Jason", "Louis", "O2 Team", "Vivian's dad"];
const SKIP = /^(n\/?a|na|-|—|pending)$/i;

export async function driverOptions(): Promise<string[]> {
  const { data } = await createAdminClient().from("logistics_orders").select("driver").eq("source", "basic_info_logistic").not("driver", "is", null).limit(5000);
  const seen = new Map<string, string>();
  for (const name of [...EXCEL_DRIVERS, ...(data || []).map((r) => String(r.driver || "").trim())]) {
    if (!name || SKIP.test(name)) continue;
    const key = name.toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
}
