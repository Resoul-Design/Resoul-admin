// 對帳修正（按 Shopify 實際資料改後台；唯一例外：接送訂金折扣會按後台抵扣記錄重新套用到 Shopify）。員工按掣及系統自動對帳共用。
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { appendNote } from "@/lib/payment-check";
import type { Issue } from "@/lib/reconcile";
import { reapplyDepositCredit } from "@/lib/deposit-credit-repair";

// 背景（自動對帳）執行時 revalidatePath 可能不可用：忽略錯誤（頁面本身為即時讀取）
function rv(path: string) { try { revalidatePath(path); } catch {} }

type LineNode = { title: string; variantTitle: string | null; quantity: number; currentQuantity?: number; originalUnitPriceSet: { shopMoney: { amount: string } } | null };
const DRAFT_LINES = `query DraftLines($id: ID!) { draftOrder(id: $id) { name lineItems(first: 100) { nodes { title variantTitle quantity originalUnitPriceSet { shopMoney { amount } } } } } }`;
const ORDER_LINES = `query OrderLines($id: ID!) { order(id: $id) { name lineItems(first: 100) { nodes { title variantTitle quantity currentQuantity originalUnitPriceSet { shopMoney { amount } } } } } }`;

// 按 Shopify 訂單或付款連結草稿更新後台的項目及金額（未扣訂金前的收費）
async function refreshLines(fix: NonNullable<Issue["fix"]>, who: string, audit: AuditFn, today: string): Promise<{ error?: string; done?: string }> {
  const admin = createAdminClient();
  let name = "";
  let nodes: LineNode[] = [];
  if (fix.draftId) {
    const r = await shopifyGraphQL<{ draftOrder: { name: string; lineItems: { nodes: LineNode[] } } | null }>(DRAFT_LINES, { id: fix.draftId });
    if (!r.draftOrder) return { error: "Shopify 付款連結已刪除。" };
    name = r.draftOrder.name; nodes = r.draftOrder.lineItems.nodes;
  } else if (fix.orderId) {
    const r = await shopifyGraphQL<{ order: { name: string; lineItems: { nodes: LineNode[] } } | null }>(ORDER_LINES, { id: fix.orderId });
    if (!r.order) return { error: "Shopify 找不到此訂單。" };
    name = r.order.name; nodes = r.order.lineItems.nodes;
  } else return { error: "缺少 Shopify 訂單。" };
  const lines = nodes
    .map((l) => ({ label: `${l.title}${l.variantTitle && l.variantTitle !== "Default Title" ? `（${l.variantTitle}）` : ""}`, price: Number(l.originalUnitPriceSet?.shopMoney.amount || 0), quantity: l.currentQuantity ?? l.quantity }))
    .filter((l) => l.quantity > 0);
  const gross = lines.reduce((n, l) => n + l.price * l.quantity, 0);
  const summary = lines.map((l) => `${l.label}×${l.quantity}`).join("、");
  // 開單記錄（項目明細及金額）
  const companyQuery = fix.companyId ? admin.from("company_orders").select("id, details").eq("id", fix.companyId) : fix.table ? admin.from("company_orders").select("id, details").eq("linked_id", fix.id) : null;
  if (companyQuery) {
    const { data: rows } = await companyQuery;
    for (const c of rows || []) {
      await admin.from("company_orders").update({ amount: gross, details: { ...((c.details as Record<string, unknown>) || {}), lines }, updated_at: new Date().toISOString() }).eq("id", c.id);
    }
  }
  // 服務記錄（收費金額；接送訂金抵扣另計）
  if (fix.table) {
    const { data: row } = await admin.from(fix.table).select("notes, payment_amount").eq("id", fix.id).maybeSingle();
    if (row && Math.abs(Number(row.payment_amount || 0) - gross) > 0.005) {
      const { error } = await admin.from(fix.table).update({ payment_amount: gross, notes: appendNote(row.notes, `🔄 跟隨 Shopify ${name} 更新項目 ${today}：${summary}（HK$${gross.toLocaleString("en-US")}，${who}）`) }).eq("id", fix.id);
      if (error) return { error: "未能更新後台記錄。" };
    }
  }
  await audit("reconcile_fix", fix.table || "company_orders", fix.id, `按 Shopify ${name} 更新項目：${summary}（HK$${gross}）`);
  for (const p of ["/deposits", "/bookings", "/vet-assessments", "/orders", "/services"]) rv(p);
  return { done: `已按 Shopify ${name} 更新項目（HK$${gross.toLocaleString("en-US")}）。` };
}

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
    if (fix.kind === "refresh-lines") return refreshLines(fix, who, audit, today);
    // 接送訂金折扣：按後台抵扣記錄重新套用到 Shopify 付款連結（唯一會寫入 Shopify 的修正）
    if (fix.kind === "credit-reapply") {
      const r = await reapplyDepositCredit(fix.id, who);
      if (r.done) {
        await audit("reconcile_fix", "deposit_bookings", fix.id, r.done);
        for (const p of ["/deposits", "/bookings", "/orders", "/services"]) rv(p);
      }
      return r;
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
