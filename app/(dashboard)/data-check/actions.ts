"use server";

// 資料核對：執行檢查及修正套餐代碼（只改後台客戶資料，按 Shopify；不會修改 Shopify）
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { dataCheck, fixPackageCode, type DataCheckResult, type DataFix } from "@/lib/data-check";

async function guard() {
  const staff = await getStaff();
  return staff && hasModule(staff, ["sync"]) ? staff : null;
}

export async function runDataCheck(): Promise<{ result?: DataCheckResult; error?: string }> {
  if (!(await guard())) return { error: "沒有此功能的使用權限。" };
  try {
    return { result: await dataCheck() };
  } catch (e) {
    console.error("[data_check]", e instanceof Error ? e.message : "unknown");
    return { error: "未能連接 Shopify 或資料庫，請稍後再試。" };
  }
}

export async function applyDataFix(fix: DataFix): Promise<{ error?: string; done?: string }> {
  if (!(await guard())) return { error: "沒有此功能的使用權限。" };
  const r = await fixPackageCode(fix);
  if (r.done) {
    await logAudit("fix_package_code", "logistics_orders", String(fix.invoiceNo), `${fix.from || "（未有）"} → ${fix.to}（資料核對，按 Shopify）`);
    revalidatePath(`/logistics/${fix.invoiceNo}`);
  }
  return r;
}
