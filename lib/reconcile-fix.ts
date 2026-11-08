// 對帳修正（只改後台，按 Shopify 實際資料；不會修改 Shopify）。員工按掣及系統自動對帳共用。
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { appendNote } from "@/lib/payment-check";
import type { Issue } from "@/lib/reconcile";

// 背景（自動對帳）執行時 revalidatePath 可能不可用：忽略錯誤（頁面本身為即時讀取）
function rv(path: string) { try { revalidatePath(path); } catch {} }

export type AuditFn = (action: string, entity: string, entityId?: string | null, detail?: string | null) => Promise<void>;
type ShopOrder = { id: string; name: string; processedAt: string | null; createdAt: string; displayFinancialStatus: string; displayFulfillmentStatus: string | null; cancelledAt: string | null; currencyCode: string; totalPriceSet: { shopMoney: { amount: string } } };
const ORDER = `query ReconOrder($id: ID!) { order(id: $id) { id name processedAt createdAt displayFinancialStatus displayFulfillmentStatus cancelledAt currencyCode totalPriceSet { shopMoney { amount } } } }`;

export async function applyFix(fix: NonNullable<Issue["fix"]>, who: string, audit: AuditFn): Promise<{ error?: string; done?: string }> {
  const admin = createAdminClient();
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    if (fix.kind === "company-paid") {
      const { error } = await admin.from("company_orders").update({ status: "paid", ...(fix.orderId ? { shopify_order_id: fix.orderId } : {}), updated_at: new Date().toISOString() }).eq("id", fix.id).neq("status", "cancelled");
      if (error) return { error: "未能更新開單記錄。" };
      await audit("reconcile_fix", "company_orders", fix.id, "對帳：開單記錄標記已付款（按 Shopify）");
      rv("/services");
      return { done: "已標記已付款。" };
    }
    if (!fix.orderId) return { error: "缺少 Shopify 訂單。" };
    const { order: o } = await shopifyGraphQL<{ order: ShopOrder | null }>(ORDER, { id: fix.orderId });
    if (!o) return { error: "Shopify 找不到此訂單。" };
    const total = Number(o.totalPriceSet.shopMoney.amount);

    if (fix.kind === "product-refresh") {
      const { error } = await admin.from("product_orders").update({
        financial_status: o.displayFinancialStatus, fulfillment_status: o.displayFulfillmentStatus, cancelled_at: o.cancelledAt,
        total_amount: total, currency: o.currencyCode, synced_at: new Date().toISOString(),
      }).eq("shopify_order_id", o.id);
      if (error) return { error: "未能更新紀念品訂單。" };
      await audit("reconcile_fix", "product_orders", o.id, `對帳：按 Shopify 更新 ${o.name}`);
      rv("/orders");
      rv("/services");
      return { done: `已按 Shopify 更新 ${o.name}。` };
    }

    // booking-cancel：Shopify 已取消／退款，後台跟隨（與取消通知相同）
    if (fix.kind === "booking-cancel") {
      if (!fix.table) return { error: "記錄無效。" };
      const refunded = /REFUND|VOID/.test(o.displayFinancialStatus);
      const patch: Record<string, string> = {};
      if (o.cancelledAt) patch.status = "cancelled";
      if (refunded) patch.payment_status = "refunded";
      if (!Object.keys(patch).length) return { error: "Shopify 此訂單未取消或退款。" };
      const { data: row } = await admin.from(fix.table).select("notes").eq("id", fix.id).maybeSingle();
      const { error } = await admin.from(fix.table).update({ ...patch, notes: appendNote(row?.notes, `🔄 對帳跟隨 Shopify ${o.name}：${o.cancelledAt ? "已取消" : ""}${refunded ? "已退款" : ""} ${today}（${who}）`) }).eq("id", fix.id);
      if (error) return { error: "未能更新後台記錄。" };
      if (o.cancelledAt) await admin.from("company_orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("linked_id", fix.id);
      await audit("reconcile_fix", fix.table, fix.id, `對帳：按 Shopify ${o.name} 標記${o.cancelledAt ? "取消" : ""}${refunded ? "退款" : ""}`);
      for (const p of ["/deposits", "/bookings", "/vet-assessments", "/services"]) rv(p);
      return { done: `已按 Shopify ${o.name} 更新。` };
    }

    // booking-paid：Shopify 已付款，後台補記已付款（與付款通知相同）
    if (!fix.table || !["PAID", "PARTIALLY_REFUNDED"].includes(o.displayFinancialStatus)) return { error: "Shopify 此訂單未付款，不能標記。" };
    const { data: row } = await admin.from(fix.table).select("*").eq("id", fix.id).maybeSingle();
    if (!row) return { error: "找不到後台記錄。" };
    if (row.payment_status === "paid") return { done: "後台已是已付款。" };
    const credit = fix.table === "cremation_bookings" ? Number(row.deposit_credit || 0) : 0;
    const { error } = await admin.from(fix.table).update({
      payment_status: "paid", payment_amount: total + credit, payment_currency: o.currencyCode,
      shopify_order_id: o.id, shopify_order_name: o.name, paid_at: o.processedAt || o.createdAt,
      notes: appendNote(row.notes, `🔄 對帳補記已付款 ${today}：${o.name} HK$${total.toLocaleString("en-US")}（${who}）`),
    }).eq("id", fix.id);
    if (error) return { error: "未能更新後台記錄。" };
    await admin.from("company_orders").update({ status: "paid", shopify_order_id: o.id, updated_at: new Date().toISOString() }).eq("linked_id", fix.id).eq("status", "awaiting_payment");
    await audit("reconcile_fix", fix.table, fix.id, `對帳：按 Shopify ${o.name} 標記已付款`);
    for (const p of ["/deposits", "/bookings", "/vet-assessments", "/services"]) rv(p);
    return { done: `已按 Shopify ${o.name} 標記已付款。` };
  } catch (e) {
    console.error("[reconcile_fix]", e instanceof Error ? e.message : "unknown");
    return { error: "未能連接 Shopify，請稍後再試。" };
  }
}
