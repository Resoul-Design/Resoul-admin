import { createAdminClient } from "@/lib/supabase/admin";
import { isRslProjectNo, projectNoFromItems } from "@/lib/order-label";
import { makeProjectNo } from "@/lib/project-no";
import type { ProductLineItem } from "@/lib/product-orders";

// 為未有專案編號的紀念品訂單補上編號（只補一次，已有的不會改）：
// 訂單屬性已帶 RSL 編號（客人或同事連結原有專案）就沿用，否則按訂單日期產生新編號。
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
    const projectNo = isRslProjectNo(fromOrder) ? fromOrder : makeProjectNo(row.shopify_created_at);
    const { error: updateError } = await admin
      .from("product_orders")
      .update({ project_no: projectNo })
      .eq("shopify_order_id", row.shopify_order_id)
      .is("project_no", null);
    if (!updateError) assigned.set(row.shopify_order_id, projectNo);
  }
  return assigned;
}
