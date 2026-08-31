import { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

// 產生下一個專案編號：RS-YYYYMM-NNN（按當月流水號）
export async function nextCaseNo(supabase: DB): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `RS-${ym}-`;
  const { count } = await supabase
    .from("cremation_bookings")
    .select("*", { count: "exact", head: true })
    .like("case_no", `${prefix}%`);
  return prefix + String((count || 0) + 1).padStart(3, "0");
}
