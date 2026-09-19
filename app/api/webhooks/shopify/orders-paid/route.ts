import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isCremationWebhookOrder,
  productOrderFromWebhook,
  type ShopifyWebhookOrder,
} from "@/lib/product-orders";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShopifyOrderPaidPayload = ShopifyWebhookOrder & { processed_at?: string };

function findPaymentRef(order: ShopifyOrderPaidPayload) {
  const attrs = [
    ...(order.note_attributes || []),
    ...((order.line_items || []).flatMap((item) => item.properties || [])),
  ];

  for (const attr of attrs) {
    const key = String(attr.name || attr.key || "").trim().toLowerCase();
    if (key === "payment_ref" || key === "booking_ref" || key === "預約編號") {
      const value = String(attr.value || "").trim();
      if (value) return value;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyWebhook(rawBody, hmac)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let order: ShopifyOrderPaidPayload;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paymentRef = findPaymentRef(order);
  if (!paymentRef) {
    if (isCremationWebhookOrder(order)) {
      return NextResponse.json({ ok: true, matched: false }, { status: 202 });
    }
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("product_orders")
      .upsert(productOrderFromWebhook(order), { onConflict: "shopify_order_id" });
    if (error) {
      console.error("[Resoul] Paid product order sync failed", error);
      return NextResponse.json({ error: "Supabase upsert failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, matched: false, productOrder: true });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("cremation_bookings")
    .update({
      payment_status: "paid",
      payment_amount: order.total_price ? Number(order.total_price) : null,
      payment_currency: order.currency || null,
      shopify_order_id: order.admin_graphql_api_id || (order.id ? String(order.id) : null),
      shopify_order_name: order.name || (order.order_number ? `#${order.order_number}` : null),
      paid_at: order.processed_at || order.created_at || new Date().toISOString(),
    })
    .eq("payment_ref", paymentRef)
    .select("id");

  if (error) {
    console.error("[Resoul] Shopify paid webhook Supabase update failed", error);
    return NextResponse.json({ error: "Supabase update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matched: (data || []).length > 0 });
}
