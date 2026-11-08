"use server";

// 對帳：執行檢查及一鍵修正（只改後台，按 Shopify 實際資料；不會修改 Shopify）
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { appendNote } from "@/lib/payment-check";
import { reconcile, type Issue, type ReconcileResult } from "@/lib/reconcile";

type ShopOrder = { id: string; name: string; processedAt: string | null; createdAt: string; displayFinancialStatus: string; displayFulfillmentStatus: string | null; cancelledAt: string | null; currencyCode: string; totalPriceSet: { shopMoney: { amount: string } } };
const ORDER = `query ReconOrder($id: ID!) { order(id: $id) { id name processedAt createdAt displayFinancialStatus displayFulfillmentStatus cancelledAt currencyCode totalPriceSet { shopMoney { amount } } } }`;

async function guard() {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["sync"])) return null;
  return staff;
}

export async function runReconcile(): Promise<{ result?: ReconcileResult; error?: string }> {
  if (!(await guard())) return { error: "沒有此功能的使用權限。" };
  try {
    return { result: await reconcile() };
  } catch (e) {
    console.error("[reconcile]", e instanceof Error ? e.message : "unknown");
    return { error: "未能連接 Shopify 或資料庫，請稍後再試。" };
  }
}

export async function fixIssue(fix: NonNullable<Issue["fix"]>): Promise<{ error?: string; done?: string }> {
  const staff = await guard();
  if (!staff) return { error: "沒有此功能的使用權限。" };
  const admin = createAdminClient();
  const who = staff.name || staff.email;
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    if (fix.kind === "company-paid") {
      const { error } = await admin.from("company_orders").update({ status: "paid", ...(fix.orderId ? { shopify_order_id: fix.orderId } : {}), updated_at: new Date().toISOString() }).eq("id", fix.id).neq("status", "cancelled");
      if (error) return { error: "未能更新開單記錄。" };
      await logAudit("reconcile_fix", "company_orders", fix.id, "對帳：開單記錄標記已付款（按 Shopify）");
      revalidatePath("/services");
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
      await logAudit("reconcile_fix", "product_orders", o.id, `對帳：按 Shopify 更新 ${o.name}`);
      revalidatePath("/orders");
      revalidatePath("/services");
      return { done: `已按 Shopify 更新 ${o.name}。` };
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
    await logAudit("reconcile_fix", fix.table, fix.id, `對帳：按 Shopify ${o.name} 標記已付款`);
    for (const p of ["/deposits", "/bookings", "/vet-assessments", "/services"]) revalidatePath(p);
    return { done: `已按 Shopify ${o.name} 標記已付款。` };
  } catch (e) {
    console.error("[reconcile_fix]", e instanceof Error ? e.message : "unknown");
    return { error: "未能連接 Shopify，請稍後再試。" };
  }
}
