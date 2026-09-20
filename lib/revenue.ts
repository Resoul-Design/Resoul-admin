import { unstable_cache } from "next/cache";
import { fetchOrdersSince, shopifyGraphQL, type OrderLite } from "@/lib/shopify";

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
  ["shopify-orders-since"],
  { revalidate: 300, tags: ["shopify-orders"] }
);

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
