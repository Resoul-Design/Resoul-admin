import crypto from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShopifyAttribute = {
  name?: string;
  key?: string;
  value?: string;
};

type ShopifyOrderPaidPayload = {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  order_number?: number;
  total_price?: string;
  currency?: string;
  processed_at?: string;
  created_at?: string;
  note_attributes?: ShopifyAttribute[];
  line_items?: {
    properties?: ShopifyAttribute[];
  }[];
};

function timingSafeEqualText(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function verifyShopifyWebhook(rawBody: string, hmac: string | null) {
  const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_WEBHOOK_SECRET || "";
  if (!secret || !hmac) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return timingSafeEqualText(digest, hmac);
}

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
    console.warn("[Resoul] Shopify paid webhook missing payment_ref", {
      orderId: order.id,
      orderName: order.name,
    });
    return NextResponse.json({ ok: true, matched: false }, { status: 202 });
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
