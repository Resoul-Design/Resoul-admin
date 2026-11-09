"use server";

// 服務工作台「取消」：後台及 Shopify 一併取消。不刪除後台記錄（狀態改為已取消，留取消及退款記錄）。
// 次序：先處理 Shopify（刪除未付款草稿／取消訂單）；Shopify 失敗就不改後台，避免假成功。
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { appendNote } from "@/lib/payment-check";

export type CancelKind = "deposit" | "cremation" | "product" | "company";
export type RefundMode = "none" | "manual" | "shopify";
export type CancelInfo = { error?: string; paid?: boolean; amount?: number; canShopifyRefund?: boolean; invoiceNo?: number | null; note?: string; label?: string };

const NOT_READY = "未啟用取消功能：請先於 Supabase 執行 db/migration_20261109_memorial_lines_cancel.sql。";
const DRAFT_STATE = `query CancelDraft($id: ID!) { draftOrder(id: $id) { id status order { id } } }`;
const DRAFT_DELETE = `mutation CancelDraftDelete($input: DraftOrderDeleteInput!) { draftOrderDelete(input: $input) { deletedId userErrors { message } } }`;
const ORDER_STATE = `query CancelOrderState($id: ID!) { order(id: $id) { id name cancelledAt displayFinancialStatus paymentGatewayNames totalReceivedSet { shopMoney { amount } } } }`;
type ShopOrder = { name: string; cancelledAt: string | null; displayFinancialStatus: string; paymentGatewayNames: string[]; totalReceivedSet: { shopMoney: { amount: string } } };
// 可經 Shopify 原路退款：未取消，而且是網上付款（人手標記的現金、FPS 等不適用）
const onlineRefundable = (o: ShopOrder) => !o.cancelledAt && Number(o.totalReceivedSet.shopMoney.amount) > 0 && o.paymentGatewayNames.some((g) => !/manual|cash|bank|fps|payme|money.?order|custom/i.test(g));
const ORDER_CANCEL = `mutation CancelOrder($orderId: ID!, $refundMethod: OrderCancelRefundMethodInput, $restock: Boolean!, $reason: OrderCancelReason!, $notifyCustomer: Boolean, $staffNote: String) {
  orderCancel(orderId: $orderId, refundMethod: $refundMethod, restock: $restock, reason: $reason, notifyCustomer: $notifyCustomer, staffNote: $staffNote) { job { id } orderCancelUserErrors { message } }
}`;

const today = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const orderGid = (id: string | null | undefined) => (!id ? "" : String(id).startsWith("gid://") ? String(id) : /^\d+$/.test(String(id)) ? `gid://shopify/Order/${id}` : "");
const isDraftGid = (id: unknown) => /^gid:\/\/shopify\/DraftOrder\/\d+$/.test(String(id || ""));

function rv() {
  for (const p of ["/services", "/deposits", "/bookings", "/vet-assessments", "/orders", "/logistics", "/projects", "/"]) revalidatePath(p);
}

type Loaded = {
  invoiceNo: number | null; amount: number; label: string; alreadyCancelled: boolean; paid: boolean;
  orderId: string; draftIds: string[]; notes: string | null; table: "deposit_bookings" | "cremation_bookings" | null;
  rowId: string; company: { id: string; details: Record<string, unknown> | null }[]; creditTargets: string[]; usedDepositTarget: string | null;
};

// 載入要取消的記錄：只接受工作台列出的四類，並按類別檢查權限
async function load(kind: CancelKind, id: string): Promise<{ error: string } | { row: Loaded; module: string }> {
  const admin = createAdminClient();
  if (kind === "product") {
    if (!/^gid:\/\/shopify\/Order\/\d+$/.test(id)) return { error: "記錄無效。" };
    const { data: o } = await admin.from("product_orders").select("shopify_order_id, invoice_no, total_amount, financial_status, cancelled_at, order_name").eq("shopify_order_id", id).maybeSingle();
    if (!o) return { error: "找不到此訂單。" };
    const { data: co } = await admin.from("company_orders").select("id, details, shopify_draft_id").eq("shopify_order_id", id);
    return { module: "orders", row: { invoiceNo: o.invoice_no ?? null, amount: Number(o.total_amount || 0), label: `紀念品訂單 ${o.order_name || ""}`.trim(), alreadyCancelled: !!o.cancelled_at, paid: ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"].includes(String(o.financial_status || "").toUpperCase()), orderId: id, draftIds: [], notes: null, table: null, rowId: id, company: (co || []).map((c) => ({ id: c.id, details: c.details as Record<string, unknown> | null })), creditTargets: (co || []).map((c) => `company:${c.id}`), usedDepositTarget: null } };
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "記錄無效。" };
  if (kind === "company") {
    const { data: o } = await admin.from("company_orders").select("id, invoice_no, order_type, amount, status, shopify_order_id, shopify_draft_id, details, linked_id").eq("id", id).maybeSingle();
    if (!o) return { error: "找不到此單。" };
    if (o.linked_id) return { error: "此單已連結服務記錄，請取消該服務記錄。" };
    return { module: "orders", row: { invoiceNo: o.invoice_no ?? null, amount: Number(o.amount || 0), label: "開新單記錄", alreadyCancelled: o.status === "cancelled", paid: o.status === "paid", orderId: orderGid(o.shopify_order_id), draftIds: o.shopify_draft_id ? [o.shopify_draft_id] : [], notes: null, table: null, rowId: o.id, company: [{ id: o.id, details: o.details as Record<string, unknown> | null }], creditTargets: [`company:${o.id}`], usedDepositTarget: null } };
  }
  const table = kind === "deposit" ? "deposit_bookings" : "cremation_bookings";
  const columns = kind === "deposit"
    ? "id, invoice_no, status, payment_status, payment_amount, shopify_order_id, notes, payment_draft_id, credit_target"
    : "id, invoice_no, status, payment_status, payment_amount, shopify_order_id, notes, source, deposit_credit";
  const { data, error } = await admin.from(table).select(columns).eq("id", id).maybeSingle();
  const r = data as unknown as { id: string; invoice_no: number | null; status: string; payment_status: string | null; payment_amount: number | null; shopify_order_id: string | null; notes: string | null; payment_draft_id?: string | null; credit_target?: string | null; source?: string | null; deposit_credit?: number | null } | null;
  if (error || !r) return { error: "找不到此記錄。" };
  const [{ data: co }, { data: mark }] = await Promise.all([
    admin.from("company_orders").select("id, details, shopify_draft_id, shopify_order_id").eq("linked_id", id),
    kind === "cremation" ? admin.from("follow_up_marks").select("payment_draft_id").in("entity", ["cremation", "vet"]).eq("ref", id).maybeSingle() : Promise.resolve({ data: null as { payment_draft_id: string | null } | null }),
  ]);
  const vet = String(r.source || "").includes("euthanasia");
  const drafts = [r.payment_draft_id, mark?.payment_draft_id, ...(co || []).map((c) => c.shopify_draft_id)].filter(isDraftGid) as string[];
  return {
    module: kind === "deposit" ? "deposits" : vet ? "vet_assessments" : "bookings",
    row: {
      invoiceNo: r.invoice_no ?? null, amount: Number(r.payment_amount || 0) - Number(r.deposit_credit || 0),
      label: kind === "deposit" ? "接送訂金" : vet ? "獸醫評估" : "火化預約", alreadyCancelled: r.status === "cancelled", paid: r.payment_status === "paid",
      orderId: orderGid(r.shopify_order_id) || orderGid((co || []).find((c) => c.shopify_order_id)?.shopify_order_id), draftIds: [...new Set(drafts)], notes: r.notes, table, rowId: r.id,
      company: (co || []).map((c) => ({ id: c.id, details: c.details as Record<string, unknown> | null })),
      creditTargets: kind === "cremation" ? [`cremation:${r.id}`] : (co || []).map((c) => `company:${c.id}`),
      usedDepositTarget: kind === "deposit" ? r.credit_target || null : null,
    },
  };
}

// 確認視窗所需資料（是否已付款、金額、可否經 Shopify 退款）
export async function getCancelInfo(kind: CancelKind, id: string): Promise<CancelInfo> {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  const res = await load(kind, id);
  if ("error" in res) return { error: res.error };
  if (!hasModule(staff, [res.module])) return { error: "沒有此功能的使用權限。" };
  const r = res.row;
  if (r.alreadyCancelled) return { error: "此單已取消。" };
  if (r.usedDepositTarget) return { error: "此接送訂金已抵扣另一張單。請先取消該單或取消抵扣，再取消訂金。" };
  let paid = r.paid, amount = r.amount, canShopifyRefund = false;
  if (r.orderId) {
    try {
      const { order } = await shopifyGraphQL<{ order: ShopOrder | null }>(ORDER_STATE, { id: r.orderId });
      if (order) {
        const received = Number(order.totalReceivedSet.shopMoney.amount);
        if (/PAID|REFUND/.test(order.displayFinancialStatus) && received > 0) { paid = true; amount = received; canShopifyRefund = onlineRefundable(order); }
      }
    } catch {
      return { error: "未能讀取 Shopify 訂單，請稍後再試。" };
    }
  }
  return { paid, amount, canShopifyRefund, invoiceNo: r.invoiceNo, label: r.label, note: paid ? "" : r.draftIds.length ? "Shopify 付款連結會一併刪除，客人之後不能再用舊連結付款。" : "" };
}

// 取消時放回此單用過的接送訂金（訂金可再用或另行退款）
async function releaseCredit(targets: string[], invoiceNo: number | null, who: string) {
  if (!targets.length) return "";
  const admin = createAdminClient();
  const { data: deps } = await admin.from("deposit_bookings").select("id, notes, credit_amount").in("credit_target", targets);
  let released = 0;
  for (const d of deps || []) {
    released += Number(d.credit_amount || 0);
    await admin.from("deposit_bookings").update({ credit_target: null, credit_amount: null, credit_applied_at: null, notes: appendNote(d.notes, `💰 取消抵扣 ${today()}：單號 ${invoiceNo ?? "—"} 已取消（${who}）`) }).eq("id", d.id);
  }
  return released > 0 ? `已放回接送訂金 ${hk(released)}（未退款，可再用於其他單或另行退款）。` : "";
}

export async function cancelServiceRecord(kind: CancelKind, id: string, refund: RefundMode, reasonText: string): Promise<{ error?: string; done?: string }> {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  const res = await load(kind, id);
  if ("error" in res) return { error: res.error };
  if (!hasModule(staff, [res.module])) return { error: "沒有此功能的使用權限。" };
  const r = res.row;
  if (r.alreadyCancelled) return { error: "此單已取消。" };
  if (r.usedDepositTarget) return { error: "此接送訂金已抵扣另一張單。請先取消該單或取消抵扣，再取消訂金。" };
  const reason = String(reasonText || "").trim().slice(0, 300);
  const who = staff.name || staff.email;
  const admin = createAdminClient();
  const ready = await admin.from("order_cancellations").select("id", { head: true, count: "exact" }).limit(1);
  if (ready.error) return { error: NOT_READY };

  // 1) Shopify：先讀取最新狀態並檢查退款選擇，然後才刪除草稿或取消訂單
  let orderId = r.orderId;
  let paid = r.paid, amount = r.amount, orderName = "";
  const deletable: string[] = [];
  try {
    for (const draftId of r.draftIds) {
      const { draftOrder } = await shopifyGraphQL<{ draftOrder: { id: string; status: string; order: { id: string } | null } | null }>(DRAFT_STATE, { id: draftId });
      if (!draftOrder) continue;
      if (draftOrder.order) orderId = orderId || draftOrder.order.id;
      else deletable.push(draftId);
    }
    let cancelOrder = false;
    if (orderId) {
      const { order } = await shopifyGraphQL<{ order: ShopOrder | null }>(ORDER_STATE, { id: orderId });
      if (order) {
        orderName = order.name;
        const received = Number(order.totalReceivedSet.shopMoney.amount);
        if (/PAID|REFUND/.test(order.displayFinancialStatus) && received > 0) { paid = true; amount = received; }
        if (refund === "shopify" && !onlineRefundable(order)) return { error: `Shopify 訂單 ${order.name} 不能經此功能退款（已取消或非網上付款）。請選「取消，稍後人手退款」。` };
        cancelOrder = !order.cancelledAt;
      }
    }
    if (paid && !["manual", "shopify"].includes(refund)) return { error: "此單已付款，請選擇退款安排。" };
    if (refund === "shopify" && !orderName) return { error: "此單未有 Shopify 訂單，只可選「取消，稍後人手退款」。" };

    for (const draftId of deletable) {
      const del = await shopifyGraphQL<{ draftOrderDelete: { deletedId: string | null; userErrors: { message: string }[] } }>(DRAFT_DELETE, { input: { id: draftId } });
      if (del.draftOrderDelete.userErrors.length) return { error: `未能刪除 Shopify 付款連結：${del.draftOrderDelete.userErrors.map((e) => e.message).join("；")}。此單未有取消，請重試。` };
    }
    if (cancelOrder) {
      const out = await shopifyGraphQL<{ orderCancel: { orderCancelUserErrors: { message: string }[] } }>(ORDER_CANCEL, {
        orderId,
        refundMethod: { originalPaymentMethodsRefund: paid && refund === "shopify" },
        restock: true,
        reason: "CUSTOMER",
        notifyCustomer: false,
        staffNote: `後台取消（${who}）${reason ? `：${reason}` : ""}`.slice(0, 255),
      });
      if (out.orderCancel.orderCancelUserErrors.length) return { error: `Shopify 未能取消訂單：${out.orderCancel.orderCancelUserErrors.map((e) => e.message).join("；")}。此單未有取消，請重試。` };
    }
  } catch (e) {
    console.error("[cancel_shopify]", e instanceof Error ? e.message : "unknown");
    return { error: "未能連接 Shopify，此單未有取消，請稍後重試。" };
  }

  // 2) 後台：狀態改已取消，記錄保留
  const now = new Date().toISOString();
  const refundMode: RefundMode = paid ? refund : "none";
  const refundDone = refundMode === "shopify";
  const line = `❌ 後台取消 ${today()}（${who}）${reason ? `：${reason}` : ""}${paid ? `｜${refundDone ? "已經 Shopify 原路退款" : "待人手退款"} ${hk(amount)}` : ""}`;
  if (r.table) {
    const patch: Record<string, unknown> = { status: "cancelled", notes: appendNote(r.notes, line) };
    if (refundDone) patch.payment_status = "refunded";
    if (r.table === "deposit_bookings") Object.assign(patch, { payment_link: null, payment_link_at: null, payment_draft_id: null });
    const { error } = await admin.from(r.table).update(patch).eq("id", r.rowId);
    if (error) return { error: `Shopify 已取消，但後台未能更新：${error.message}。請按頁頂「⟳ 全部同步」修正。` };
    if (r.table === "cremation_bookings") await admin.from("follow_up_marks").update({ payment_link: null, payment_link_at: null, payment_draft_id: null }).in("entity", ["cremation", "vet"]).eq("ref", r.rowId);
  }
  if (kind === "product") {
    const { error } = await admin.from("product_orders").update({ cancelled_at: now, ...(refundDone ? { financial_status: "REFUNDED" } : {}) }).eq("shopify_order_id", r.rowId);
    if (error) return { error: `Shopify 已取消，但後台未能更新：${error.message}。請按頁頂「⟳ 全部同步」修正。` };
  }
  for (const c of r.company) {
    await admin.from("company_orders").update({ status: "cancelled", shopify_invoice_url: null, updated_at: now, details: { ...(c.details || {}), cancelled: { at: now, by: who, reason: reason || null } } }).eq("id", c.id);
  }
  const creditNote = await releaseCredit(r.creditTargets, r.invoiceNo, who);
  const { error: logError } = await admin.from("order_cancellations").upsert({
    entity: kind, entity_id: r.rowId, invoice_no: r.invoiceNo, amount: paid ? amount : null, reason: reason || null, refund_mode: refundMode,
    refund_status: !paid ? "not_required" : refundDone ? "refunded" : "pending", shopify_order_id: orderId || null, shopify_draft_id: r.draftIds[0] || null,
    created_by: who, refunded_at: refundDone ? now : null, refunded_by: refundDone ? who : null,
  }, { onConflict: "entity,entity_id" });
  if (logError) console.error("[cancel_log]", logError.message);
  await logAudit("cancel_service_record", kind, r.rowId, `${r.label}｜單號 ${r.invoiceNo ?? "—"}｜${refundDone ? "Shopify 退款" : paid ? "待人手退款" : "未付款"}${reason ? `｜${reason}` : ""}`);
  rv();
  const shop = orderName ? `Shopify 訂單 ${orderName} 已取消。` : r.draftIds.length ? "Shopify 付款連結已刪除。" : "";
  const refundText = !paid ? "" : refundDone ? `已向 Shopify 發出原路退款 ${hk(amount)}（實際結果以 Shopify 為準）。` : `待退款 ${hk(amount)}：退款後請按「標記已退款」。`;
  return { done: ["已取消。", shop, refundText, creditNote].filter(Boolean).join(" ") };
}

// 待退款 → 已退款（人手退款完成後按）
export async function markRefunded(kind: CancelKind, id: string): Promise<{ error?: string }> {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  const res = await load(kind, id);
  if ("error" in res) return { error: res.error };
  if (!hasModule(staff, [res.module])) return { error: "沒有此功能的使用權限。" };
  const r = res.row;
  const who = staff.name || staff.email;
  const admin = createAdminClient();
  const { error } = await admin.from("order_cancellations").update({ refund_status: "refunded", refunded_at: new Date().toISOString(), refunded_by: who }).eq("entity", kind).eq("entity_id", r.rowId).eq("refund_status", "pending");
  if (error) return { error: "未能更新退款狀態。" };
  if (r.table) await admin.from(r.table).update({ payment_status: "refunded", notes: appendNote(r.notes, `💸 已退款 ${today()}（${who}）`) }).eq("id", r.rowId);
  await logAudit("mark_refunded", kind, r.rowId, `單號 ${r.invoiceNo ?? "—"} 標記已退款`);
  rv();
  return {};
}
