// 司機名單：來源為 Drive 試算表「Customers Record & Logistic」→「Basic Info Logistic」的 Driver 欄（2026-11-11 盤點），
// 另加由該試算表匯入後台的客戶資料（source = basic_info_logistic）中出現的司機。
// 新司機：先在試算表填寫，再經「由 Excel 同步」匯入，便會出現在選單；後台不會寫回試算表。
import { createAdminClient } from "@/lib/supabase/admin";
import { EXCEL_DRIVERS, canonicalDriver } from "@/lib/driver-names";
export { EXCEL_DRIVERS, canonicalDriver };

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

// 每位司機的標準司機費：按試算表匯入記錄最常見的「司機／GoGoVan 費用」（同一司機以往收費一致，例如 Ricky 320）
export async function driverFees(): Promise<Record<string, number>> {
  const { data } = await createAdminClient().from("logistics_orders").select("driver, driver_or_gogovan_cost").eq("source", "basic_info_logistic").not("driver", "is", null).not("driver_or_gogovan_cost", "is", null).limit(5000);
  const count = new Map<string, Map<number, number>>();
  for (const r of data || []) {
    const d = canonicalDriver(String(r.driver || ""));
    if (!d || SKIP.test(d)) continue;
    const m = count.get(d) || new Map<number, number>();
    const fee = Number(r.driver_or_gogovan_cost);
    m.set(fee, (m.get(fee) || 0) + 1);
    count.set(d, m);
  }
  return Object.fromEntries([...count].map(([d, m]) => [d, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
}
