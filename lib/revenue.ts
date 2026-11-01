import { unstable_cache } from "next/cache";
import { fetchOrdersSince, shopifyGraphQL, type OrderLite } from "@/lib/shopify";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrdersResult = { ok: boolean; rows: OrderLite[]; error?: string };

// 快取近 N 個月訂單（游標分頁，避免漏單），每 5 分鐘更新一次，減輕每次載入的 Shopify 查詢。
export const getOrdersSinceCached = unstable_cache(
  async (sinceDate: string): Promise<OrdersResult> => {
    try {
      return { ok: true, rows: await fetchOrdersSince(sinceDate) };
    } catch (e) {
      return { ok: false, rows: [], error: e instanceof Error ? e.message : String(e) };
    }
  },
  ["shopify-orders-since-v2"],
  { revalidate: 300, tags: ["shopify-orders"] }
);

// 計入收入的訂單：後台有對應記錄（紀念品訂單、接送、火化預約）時以後台「測試記錄」標記為準，
// 同事取消測試標記即計入；後台未有記錄時，Shopify 測試付款不計。此步不快取，標記改動即時反映。
export async function countableOrders(rows: OrderLite[]): Promise<OrderLite[]> {
  if (!rows.length) return rows;
  const admin = createAdminClient();
  const flags = new Map<string, boolean>();
  const ids = rows.map((o) => o.id);
  const names = rows.map((o) => o.name).filter(Boolean);
  for (let i = 0; i < Math.max(ids.length, names.length); i += 200) {
    const idPart = ids.slice(i, i + 200);
    const namePart = names.slice(i, i + 200);
    const [po, dep, crem] = await Promise.all([
      idPart.length ? admin.from("product_orders").select("shopify_order_id, is_test").in("shopify_order_id", idPart) : null,
      namePart.length ? admin.from("deposit_bookings").select("shopify_order_name, is_test").in("shopify_order_name", namePart) : null,
      namePart.length ? admin.from("cremation_bookings").select("shopify_order_name, is_test").in("shopify_order_name", namePart) : null,
    ]);
    for (const r of po?.data || []) flags.set(r.shopify_order_id, !!r.is_test);
    for (const r of [...(dep?.data || []), ...(crem?.data || [])]) {
      if (!r.shopify_order_name) continue;
      // 同一 Shopify 訂單有多筆記錄時，任何一筆未標記測試即計入
      const prev = flags.get("name:" + r.shopify_order_name);
      flags.set("name:" + r.shopify_order_name, prev === false ? false : !!r.is_test);
    }
  }
  return rows.filter((o) => {
    const flag = flags.get(o.id) ?? flags.get("name:" + o.name);
    return flag === undefined ? !o.test : !flag;
  });
}

export const getProductsCountCached = unstable_cache(
  async (): Promise<number> => {
    try {
      const d = await shopifyGraphQL<{ productsCount: { count: number } }>(`{ productsCount { count } }`);
      return d.productsCount.count;
    } catch {
      return 0;
    }
  },
  ["shopify-products-count"],
  { revalidate: 900 }
);
