// 由 Shopify 拉取所有訂單，紀念品訂單寫入 product_orders；補專案編號及標記 Shopify 測試訂單。回傳同步數目。
// 「紀念品訂單 → 同步」及頁頂「全部同步」共用。
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { assignMissingProjectNos } from "@/lib/product-order-projects";
import { markShopifyTestOrders } from "@/lib/test-orders";
import { isCremationGraphQLOrder, productOrderFromGraphQL, type ShopifyGraphQLOrder } from "@/lib/product-orders";

type OrdersPage = {
  orders: {
    edges: { cursor: string; node: ShopifyGraphQLOrder }[];
    pageInfo: { hasNextPage: boolean };
  };
};

const SYNC_QUERY = `query ProductOrders($after: String) {
  orders(first: 250, after: $after, sortKey: CREATED_AT, reverse: true) {
    edges { cursor node {
      id name test createdAt updatedAt cancelledAt email phone
      displayFinancialStatus displayFulfillmentStatus
      customAttributes { key value }
      customer {
        displayName
        defaultEmailAddress { emailAddress }
        defaultPhoneNumber { phoneNumber }
        defaultAddress { phone }
      }
      shippingAddress { phone }
      billingAddress { phone }
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 100) { edges { node { title quantity sku variantTitle originalUnitPriceSet { shopMoney { amount } } customAttributes { key value } } } }
    } }
    pageInfo { hasNextPage }
  }
}`;

export async function syncProductOrdersCore(): Promise<number> {
  let synced = 0;
  const supabase = createAdminClient();
  let after: string | null = null;
  const testOrders: { id: string; name: string }[] = [];

  do {
    const result: OrdersPage = await shopifyGraphQL<OrdersPage>(SYNC_QUERY, { after });
    const edges = result.orders.edges;
    // Shopify 測試付款（包括接送訂金及火化訂單）
    testOrders.push(...edges.filter(({ node }) => node.test).map(({ node }) => ({ id: node.id, name: node.name })));
    const productRows = edges
      .map(({ node }) => node)
      .filter((order) => !isCremationGraphQLOrder(order))
      .map(productOrderFromGraphQL);

    if (productRows.length) {
      const { error } = await supabase
        .from("product_orders")
        .upsert(productRows, { onConflict: "shopify_order_id" });
      if (error) throw error;
    }

    synced += productRows.length;
    after = result.orders.pageInfo.hasNextPage ? edges.at(-1)?.cursor || null : null;
  } while (after);

  await assignMissingProjectNos();
  await markShopifyTestOrders(testOrders);
  return synced;
}
