"use server";

// 對帳：執行檢查及一鍵修正（只改後台，按 Shopify 實際資料；不會修改 Shopify）
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { applyFix } from "@/lib/reconcile-fix";
import { reconcile, type Issue, type ReconcileResult } from "@/lib/reconcile";

async function guard() {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["sync"])) return null;
  return staff;
}

export async function runReconcile(includeTest = false): Promise<{ result?: ReconcileResult; error?: string }> {
  if (!(await guard())) return { error: "沒有此功能的使用權限。" };
  try {
    return { result: await reconcile({ includeTest: !!includeTest }) };
  } catch (e) {
    console.error("[reconcile]", e instanceof Error ? e.message : "unknown");
    return { error: "未能連接 Shopify 或資料庫，請稍後再試。" };
  }
}

export async function fixIssue(fix: NonNullable<Issue["fix"]>): Promise<{ error?: string; done?: string }> {
  const staff = await guard();
  if (!staff) return { error: "沒有此功能的使用權限。" };
  return applyFix(fix, staff.name || staff.email, logAudit);
}
