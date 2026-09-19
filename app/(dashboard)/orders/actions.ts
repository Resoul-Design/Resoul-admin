"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import {
  isCremationGraphQLOrder,
  productOrderFromGraphQL,
  type ShopifyGraphQLOrder,
} from "@/lib/product-orders";

type OrdersPage = {
  orders: {
    edges: { cursor: string; node: ShopifyGraphQLOrder }[];
    pageInfo: { hasNextPage: boolean };
  };
};

const SYNC_QUERY = `query ProductOrders($after: String) {
  orders(first: 250, after: $after, sortKey: CREATED_AT, reverse: true) {
    edges { cursor node {
      id name createdAt updatedAt cancelledAt email phone
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
      lineItems(first: 100) { edges { node { title quantity } } }
    } }
    pageInfo { hasNextPage }
  }
}`;

export async function syncProductOrders() {
  if (!(await getStaff())) redirect("/login");

  let synced = 0;
  try {
    const supabase = createAdminClient();
    let after: string | null = null;

    do {
      const result: OrdersPage = await shopifyGraphQL<OrdersPage>(SYNC_QUERY, { after });
      const edges = result.orders.edges;
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

    revalidatePath("/orders");
    revalidatePath("/crm");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/orders?sync_error=${encodeURIComponent(message.slice(0, 180))}`);
  }
  redirect(`/orders?synced=${synced}`);
}
