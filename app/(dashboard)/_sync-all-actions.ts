"use server";

// 頁頂「全部同步」：由 Shopify 拉取最新訂單入 Supabase，再對帳並自動修正跟隨 Shopify 的項目（只改後台）
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { syncProductOrdersCore } from "@/lib/product-order-sync";
import { reconcile } from "@/lib/reconcile";
import { applyFix } from "@/lib/reconcile-fix";

export async function syncAll(): Promise<{ error?: string; summary?: string; manual?: number }> {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["sync"])) return { error: "沒有此功能的使用權限。" };
  const who = staff.name || staff.email;
  try {
    const synced = await syncProductOrdersCore();
    const result = await reconcile({ includeTest: true });
    let fixed = 0;
    const failed: string[] = [];
    for (const issue of result.issues) {
      if (!issue.fix) continue;
      const r = await applyFix(issue.fix, who, logAudit);
      if (r.error) failed.push(`單號 ${issue.invoiceNo}`);
      else fixed++;
    }
    const manual = result.issues.filter((i) => !i.fix).length + failed.length;
    const summary = `已同步 ${synced} 張網店訂單；修正 ${fixed} 項不一致${manual ? `；另有 ${manual} 項需人手處理（見「同步狀態 → 對帳」）` : "；後台與 Shopify 一致"}。`;
    await logAudit("sync_all", "shopify", null, summary);
    for (const p of ["/", "/services", "/deposits", "/bookings", "/vet-assessments", "/orders", "/crm", "/sync"]) revalidatePath(p);
    return { summary, manual };
  } catch (e) {
    console.error("[sync_all]", e instanceof Error ? e.message : "unknown");
    return { error: "同步失敗：未能連接 Shopify 或資料庫，請稍後再試。" };
  }
}
