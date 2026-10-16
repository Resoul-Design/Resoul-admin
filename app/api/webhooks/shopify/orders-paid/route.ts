import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assignMissingProjectNos } from "@/lib/product-order-projects";
import { markShopifyTestOrders } from "@/lib/test-orders";
import {
  isCremationWebhookOrder,
  productOrderFromWebhook,
  type ShopifyWebhookOrder,
} from "@/lib/product-orders";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";
import { appendNote, checkPaidAmount } from "@/lib/payment-check";

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
      revalidateTag("shopify-orders");
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
    await assignMissingProjectNos();
    if (order.test) await markShopifyTestOrders([{ id: order.admin_graphql_api_id || (order.id ? `gid://shopify/Order/${order.id}` : null), name: order.name || null }]);
    revalidateTag("shopify-orders");
    return NextResponse.json({ ok: true, matched: false, productOrder: true });
  }

  const supabase = createAdminClient();
  const orderName = order.name || (order.order_number ? `#${order.order_number}` : null);

  // 核對金額：實付少於預約收費金額（或未設定金額）時不標記已付款，改為付款失敗並記錄於備註
  const { data: current } = await supabase
    .from("cremation_bookings")
    .select("id, payment_amount, payment_status, notes")
    .eq("payment_ref", paymentRef);
  const pendingRows = (current || []).filter((row) => row.payment_status !== "paid");
  if (pendingRows.length) {
    const check = checkPaidAmount(pendingRows[0].payment_amount, order.total_price != null ? Number(order.total_price) : null, order.currency, orderName);
    if (!check.ok) {
      for (const row of pendingRows) {
        await supabase.from("cremation_bookings").update({ payment_status: "failed", notes: appendNote(row.notes, check.note) }).eq("id", row.id);
      }
      console.error("[Resoul] Shopify paid webhook amount mismatch", paymentRef);
      revalidateTag("shopify-orders");
      return NextResponse.json({ ok: true, matched: true, amountMismatch: true });
    }
  } else if ((current || []).length) {
    // 已標記已付款：不重複處理
    return NextResponse.json({ ok: true, matched: true, alreadyPaid: true });
  }

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
  if (order.test) await markShopifyTestOrders([{ name: order.name || (order.order_number ? `#${order.order_number}` : null) }]);

  revalidateTag("shopify-orders");
  return NextResponse.json({ ok: true, matched: (data || []).length > 0 });
}
