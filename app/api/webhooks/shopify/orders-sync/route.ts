import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isCremationWebhookOrder,
  productOrderFromWebhook,
  type ShopifyWebhookOrder,
} from "@/lib/product-orders";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyShopifyWebhook(rawBody, request.headers.get("x-shopify-hmac-sha256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let order: ShopifyWebhookOrder;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = order.admin_graphql_api_id || (order.id ? `gid://shopify/Order/${order.id}` : "");
  if (!orderId) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

  const supabase = createAdminClient();
  if (isCremationWebhookOrder(order)) {
    const { error } = await supabase.from("product_orders").delete().eq("shopify_order_id", orderId);
    if (error) return NextResponse.json({ error: "Supabase delete failed" }, { status: 500 });
    revalidateTag("shopify-orders");
    return NextResponse.json({ ok: true, productOrder: false });
  }

  const { error } = await supabase
    .from("product_orders")
    .upsert(productOrderFromWebhook(order), { onConflict: "shopify_order_id" });
  if (error) {
    console.error("[Resoul] Product order sync failed", error);
    return NextResponse.json({ error: "Supabase upsert failed" }, { status: 500 });
  }

  revalidateTag("shopify-orders");
  return NextResponse.json({ ok: true, productOrder: true });
}
