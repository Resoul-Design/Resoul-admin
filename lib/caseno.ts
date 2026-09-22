import { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;

/**
 * @deprecated 專案編號已改用 Shopify 訂單名（#RESOUL-####）為單一真相，
 * 不再自動產生 RS-YYYYMM-NNN。此函式僅保留供必要時人手產生內部編號。
 *
 * 安全性：不再用 count(*)+1（會與已刪除記錄／並發產生撞號），改用當月「最大流水號 +1」。
 * 若同時仍需自動產生，請配合 db/migration_case_no_unique.sql 的 UNIQUE 約束，
 * 於寫入時捕捉 23505（unique_violation）後重試（insert … on conflict retry）。
 */
export async function nextCaseNo(supabase: DB): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `RS-${ym}-`;
  const { data } = await supabase
    .from("cremation_bookings")
    .select("case_no")
    .like("case_no", `${prefix}%`)
    .order("case_no", { ascending: false })
    .limit(1);
  const last = (data?.[0]?.case_no as string | undefined) || "";
  const lastNum = last ? parseInt(last.slice(prefix.length).replace(/\D/g, ""), 10) || 0 : 0;
  return prefix + String(lastNum + 1).padStart(3, "0");
}
