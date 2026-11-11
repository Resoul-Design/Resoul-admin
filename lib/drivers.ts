// 司機名單：來源為 Drive 試算表「Customers Record & Logistic」→「Basic Info Logistic」的 Driver 欄（2026-11-11 盤點），
// 另加由該試算表匯入後台的客戶資料（source = basic_info_logistic）中出現的司機。
// 新司機：先在試算表填寫，再經「由 Excel 同步」匯入，便會出現在選單；後台不會寫回試算表。
import { createAdminClient } from "@/lib/supabase/admin";

export const EXCEL_DRIVERS = ["Ricky", "Joe", "豪仔 / Ho Jai", "Vivian", "Yeah O2", "V's Dad", "Gary", "JH", "Tony", "Jason", "Louis", "O2 Team"];

// 同一司機的不同寫法合併為一個選項（2026-11-11 用戶確認）；試算表及資料庫原有文字不變，只在選單及表格顯示時合併
const ALIASES: Record<string, string> = {
  "豪仔": "豪仔 / Ho Jai", "ho jai": "豪仔 / Ho Jai", "豪仔 / ho jai": "豪仔 / Ho Jai", "豪仔/ho jai": "豪仔 / Ho Jai",
  "v's dad": "V's Dad", "vivian's dad": "V's Dad", "yeah o2": "Yeah O2",
};
export function canonicalDriver(name: string | null | undefined): string {
  const s = String(name || "").trim();
  return ALIASES[s.toLowerCase().replace(/\s+/g, " ")] || ALIASES[s] || s;
}
const SKIP = /^(n\/?a|na|-|—|pending)$/i;

export async function driverOptions(): Promise<string[]> {
  const { data } = await createAdminClient().from("logistics_orders").select("driver").eq("source", "basic_info_logistic").not("driver", "is", null).limit(5000);
  const seen = new Map<string, string>();
  for (const name of [...EXCEL_DRIVERS, ...(data || []).map((r) => canonicalDriver(String(r.driver || "")))]) {
    if (!name || SKIP.test(name)) continue;
    const key = name.toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
}
