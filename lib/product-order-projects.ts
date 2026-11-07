import { createAdminClient } from "@/lib/supabase/admin";
import { isProjectNo, projectNoFromItems } from "@/lib/order-label";
import type { ProductLineItem } from "@/lib/product-orders";

// 為未有專案編號的紀念品訂單補上編號（只補一次，已有的不會改）：
// 訂單屬性已帶專案編號（客人或同事連結原有專案）就沿用，否則開新專案：專案編號＝新單號（例如 290）。
// 未執行 db/migration_product_order_project_no.sql 時直接略過。回傳 訂單 ID → 編號。
export async function assignMissingProjectNos(): Promise<Map<string, string>> {
  const assigned = new Map<string, string>();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_orders")
    .select("shopify_order_id, shopify_created_at, line_items")
    .is("project_no", null)
    .limit(500);
  if (error || !data) return assigned;
  for (const row of data as { shopify_order_id: string; shopify_created_at: string; line_items: ProductLineItem[] | null }[]) {
    const fromOrder = projectNoFromItems(row.line_items || undefined);
    if (isProjectNo(fromOrder)) {
      const { error: updateError } = await admin
        .from("product_orders")
        .update({ project_no: fromOrder })
        .eq("shopify_order_id", row.shopify_order_id)
        .is("project_no", null);
      if (!updateError) assigned.set(row.shopify_order_id, fromOrder);
      continue;
    }
    // 同一訂單同時收到多個 Shopify 通知亦只會配一次號（資料庫鎖定該訂單）
    const { data: projectNo, error: rpcError } = await admin.rpc("assign_new_project_to_product_order", { p_order_id: String(row.shopify_order_id) });
    if (!rpcError && projectNo) assigned.set(row.shopify_order_id, String(projectNo));
  }
  return assigned;
}
