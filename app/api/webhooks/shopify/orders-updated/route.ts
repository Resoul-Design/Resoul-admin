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

// orders/updated（涵蓋取消與退款）：Shopify 訂單狀態變動時同步回 Admin。
// - 火化訂單（帶 payment_ref）：只在「已取消／已退款」時更新預約，避免干擾員工手動改的狀態。
// - 產品訂單：以最新狀態 upsert 回 product_orders（含退款／取消）。
type Payload = ShopifyWebhookOrder & {
  financial_status?: string | null;
  cancelled_at?: string | null;
};

function findPaymentRef(order: Payload) {
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

  let order: Payload;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fin = String(order.financial_status || "").toLowerCase();
  const isCancelled = !!order.cancelled_at;
  const isRefunded = fin === "refunded" || fin === "partially_refunded" || fin === "voided";
  const paymentRef = findPaymentRef(order);

  // 略過殘缺 payload（例如 orders/delete 只帶 {id}），避免寫入空白訂單
  const incomplete = !order.name && !(order.line_items && order.line_items.length);
  if (incomplete) {
    return NextResponse.json({ ok: true, skipped: "incomplete_payload" });
  }

  // 產品訂單：同步最新狀態（包含取消／退款）
  if (!paymentRef) {
    if (isCremationWebhookOrder(order)) {
      return NextResponse.json({ ok: true, matched: false });
    }
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("product_orders")
      .upsert(productOrderFromWebhook(order), { onConflict: "shopify_order_id" });
    if (error) {
      console.error("[Resoul] orders/updated product sync failed", error);
      return NextResponse.json({ error: "Supabase upsert failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, matched: false, productOrder: true });
  }

  // 火化訂單：只在取消／退款時更新，其餘變動不動（保留員工手動狀態）
  if (!isCancelled && !isRefunded) {
    return NextResponse.json({ ok: true, matched: true, changed: false });
  }

  const patch: Record<string, unknown> = {};
  if (isCancelled) patch.status = "cancelled";
  if (isRefunded) patch.payment_status = "refunded";

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("cremation_bookings")
    .update(patch)
    .eq("payment_ref", paymentRef)
    .select("id");

  if (error) {
    console.error("[Resoul] orders/updated cremation sync failed", error);
    return NextResponse.json({ error: "Supabase update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, matched: (data || []).length > 0, patch });
}
