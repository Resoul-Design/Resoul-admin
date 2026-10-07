import { createAdminClient } from "@/lib/supabase/admin";

// Shopify 測試付款（test: true）的訂單：標記接送、預約及紀念品訂單為測試記錄。
// 只會設為 true，不會把同事手動標記的測試記錄改回 false；欄位未建立時略過。
export async function markShopifyTestOrders(orders: { id?: string | null; name?: string | null }[]) {
  const ids = orders.map((o) => o.id).filter((v): v is string => !!v);
  const names = orders.map((o) => o.name).filter((v): v is string => !!v);
  if (!ids.length && !names.length) return;
  const admin = createAdminClient();
  for (let i = 0; i < Math.max(ids.length, names.length); i += 100) {
    const idPart = ids.slice(i, i + 100);
    const namePart = names.slice(i, i + 100);
    await Promise.all([
      idPart.length ? admin.from("product_orders").update({ is_test: true }).in("shopify_order_id", idPart) : null,
      namePart.length ? admin.from("deposit_bookings").update({ is_test: true }).in("shopify_order_name", namePart) : null,
      namePart.length ? admin.from("cremation_bookings").update({ is_test: true }).in("shopify_order_name", namePart) : null,
    ]);
  }
}
