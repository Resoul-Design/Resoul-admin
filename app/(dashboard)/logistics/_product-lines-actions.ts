"use server";

// 紀念品產品列：保存（同一單號多行）。同步 Shopify 見 new-order/actions.ts 的 syncInvoiceProducts。
import { loadPriceSettings, productPricing } from "@/lib/price-settings";
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMemorialStatus, slowestStatus } from "@/lib/memorial-status";
import { removeProductLinesFromShopify } from "../new-order/actions";

export type SaveLine = {
  id: string | null;
  product_name: string;
  variant_title: string;
  variant_id: string | null;
  product_code: string;
  vendor: string;
  quantity: string;
  unit_price: string;
  amount: string;
  status: string;
  customer_order_date: string;
  completed_on: string;
  delivered_to_vendor_on: string;
  vendor_returned_on: string;
  cost: string;
  remarks: string;
  source: string;
  source_ref: string | null;
  to_sync: boolean;
};

const NOT_READY = "未啟用紀念品產品表格：請先於 Supabase 執行 db/migration_20261109_memorial_lines_cancel.sql。";
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;

function num(v: string, label: string, row: number): { value: number | null; error?: string } {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return { value: null };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 99_999_999) return { value: null, error: `第 ${row} 行「${label}」請輸入正數。` };
  return { value: n };
}
function date(v: string, label: string, row: number): { value: string | null; error?: string } {
  const s = String(v ?? "").trim();
  if (!s) return { value: null };
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { value: s } : { value: null, error: `第 ${row} 行「${label}」日期格式不正確。` };
}

export async function saveProductLines(invoiceNo: number, rows: SaveLine[], deleteIds: string[], canSeeCost: boolean): Promise<{ error?: string; done?: string }> {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory", "orders", "bookings", "vet_assessments", "deposits"])) return { error: "沒有權限。" };
  if (!Number.isInteger(invoiceNo) || invoiceNo < 1) return { error: "單號無效。" };
  if (!Array.isArray(rows) || rows.length > 200) return { error: "每張單最多 200 行。" };
  const showCost = canSeeCost && hasModule(staff, ["inventory"]);
  const admin = createAdminClient();
  const who = staff.name || staff.email;

  const prices = await loadPriceSettings();
  const existing = await admin.from("memorial_product_lines").select("id, sync_status, status, source_ref, vendor, cost").eq("invoice_no", invoiceNo);
  if (existing.error) return { error: NOT_READY };
  const byId = new Map((existing.data || []).map((r) => [String(r.id), r]));

  // 已同步 Shopify 的行不可刪除（刪除不會改到 Shopify）
  const removable = (deleteIds || []).filter((id) => byId.has(id));

  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], n = i + 1;
    const name = text(r.product_name, 300);
    if (!name) return { error: `第 ${n} 行請填寫產品名稱。` };
    const qty = num(r.quantity, "數量", n), price = num(r.unit_price, "單價", n), amount = num(r.amount, "金額", n), cost = num(r.cost, "成本", n);
    const d1 = date(r.customer_order_date, "下單日期", n), d2 = date(r.completed_on, "完成日期", n), d3 = date(r.delivered_to_vendor_on, "交供應商", n), d4 = date(r.vendor_returned_on, "供應商交回", n);
    const err = [qty, price, amount, cost, d1, d2, d3, d4].find((x) => x.error)?.error;
    if (err) return { error: err };
    if (!qty.value) return { error: `第 ${n} 行請填寫數量。` };
    const cur = r.id ? byId.get(r.id) : null;
    if (r.id && !cur) return { error: "表格內容已過期，請重新整理頁面。" };
    if (!isMemorialStatus(r.status) && r.status !== cur?.status) return { error: `第 ${n} 行狀態無效。` };
    if (r.to_sync && qty.value && !Number.isInteger(qty.value)) return { error: `第 ${n} 行要同步 Shopify，數量必須為整數。` };
    if (r.to_sync && price.value == null) return { error: `第 ${n} 行要同步 Shopify，請填寫單價。` };

    // 供應商及成本：未填時按價目設定（Memorial Product Pricing，成本＝單位成本 × 數量）
    const pricing = productPricing(r.product_code, prices);
    const autoCost = cost.value == null && pricing.cost != null ? Math.round(pricing.cost * qty.value * 100) / 100 : null;
    const common: Record<string, unknown> = {
      product_code: text(r.product_code, 120), vendor: text(r.vendor, 120) || pricing.vendor, status: r.status, customer_order_date: d1.value, completed_on: d2.value,
      delivered_to_vendor_on: d3.value, vendor_returned_on: d4.value, remarks: text(r.remarks, 20000), updated_at: now,
      ...(showCost ? { cost: cost.value ?? autoCost } : !cur && autoCost != null ? { cost: autoCost } : {}),
    };
    const content: Record<string, unknown> = {
      product_name: name, variant_title: text(r.variant_title, 200), variant_id: /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(String(r.variant_id || "")) ? r.variant_id : null,
      quantity: qty.value, unit_price: price.value, amount: amount.value ?? (price.value == null ? null : Math.round(price.value * qty.value * 100) / 100),
    };
    if (cur) {
      // 已同步的行：內容以 Shopify 為準，不可在此修改名稱、數量及價錢
      const locked = ["synced", "syncing"].includes(String(cur.sync_status));
      const syncPatch = locked ? {} : { sync_status: r.to_sync ? (cur.sync_status === "failed" ? "failed" : "pending") : "none", ...(r.to_sync ? {} : { sync_error: null }) };
      updates.push({ id: String(r.id), patch: { ...common, ...(locked ? {} : content), ...syncPatch } });
    } else {
      inserts.push({
        ...common, ...content, invoice_no: invoiceNo, source: ["shopify", "company_order"].includes(r.source) ? r.source : "manual",
        source_ref: text(r.source_ref, 200), sync_status: r.to_sync ? "pending" : "none", sort_order: i, created_by: who,
      });
    }
  }

  let shopifyNote = "";
  if (removable.length) {
    // 在 Shopify 付款連結的項目：先在 Shopify 刪除，失敗則整次不保存
    const removed = await removeProductLinesFromShopify(invoiceNo, removable);
    if (removed.error) return { error: removed.error };
    shopifyNote = removed.done || "";
    const { error } = await admin.from("memorial_product_lines").delete().in("id", removable);
    if (error) return { error: `未能刪除：${error.message}` };
  }
  for (const u of updates) {
    const { error } = await admin.from("memorial_product_lines").update(u.patch).eq("id", u.id);
    if (error) return { error: `未能保存：${error.message}` };
  }
  if (inserts.length) {
    const { error } = await admin.from("memorial_product_lines").insert(inserts);
    if (error) return { error: `未能保存：${error.message}` };
  }

  // 產品狀態同步回紀念品訂單（同一訂單多行取最落後的一行）
  const { data: after } = await admin.from("memorial_product_lines").select("status, source_ref").eq("invoice_no", invoiceNo);
  const perOrder = new Map<string, string[]>();
  for (const l of after || []) if (String(l.source_ref || "").startsWith("gid://shopify/Order/")) perOrder.set(String(l.source_ref), [...(perOrder.get(String(l.source_ref)) || []), String(l.status)]);
  for (const [orderId, list] of perOrder) {
    const status = slowestStatus(list);
    if (status) await admin.from("product_orders").update({ memorial_status: status }).eq("shopify_order_id", orderId);
  }

  await logAudit("save_product_lines", "memorial_product_lines", String(invoiceNo), `單號 ${invoiceNo}｜${rows.length} 行${removable.length ? `｜刪除 ${removable.length} 行` : ""}`);
  for (const p of [`/logistics/${invoiceNo}`, "/logistics", "/orders", "/services", "/projects", "/crm"]) revalidatePath(p);
  return { done: ["已保存。", shopifyNote].filter(Boolean).join(" ") };
}

// 「6. 紀念品及成本」：每件紀念品的供應商、日期、成本及備註（只改這幾欄，不影響產品名稱、數量、價錢及 Shopify）
export type LineDetail = { id: string; vendor: string; delivered_to_vendor_on: string; vendor_returned_on: string; completed_on: string; cost: string; remarks: string };
export async function saveProductLineDetails(invoiceNo: number, items: LineDetail[]): Promise<{ error?: string }> {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory"])) return { error: "沒有權限。" };
  if (!Number.isInteger(invoiceNo) || !Array.isArray(items) || items.length > 200) return { error: "資料無效。" };
  if (!items.length) return {};
  const admin = createAdminClient();
  const { data: own, error } = await admin.from("memorial_product_lines").select("id").eq("invoice_no", invoiceNo).in("id", items.map((i) => i.id));
  if (error) return { error: NOT_READY };
  const ids = new Set((own || []).map((r) => String(r.id)));
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!ids.has(it.id)) return { error: "表格內容已過期，請重新整理頁面。" };
    const d1 = date(it.delivered_to_vendor_on, "交供應商日期", i + 1), d2 = date(it.vendor_returned_on, "供應商交回日期", i + 1), d3 = date(it.completed_on, "完成日期", i + 1), c = num(it.cost, "成本", i + 1);
    const err = [d1, d2, d3, c].find((x) => x.error)?.error;
    if (err) return { error: err.replace(/^第 (\d+) 行/, "第 $1 件紀念品") };
    const { error: upErr } = await admin.from("memorial_product_lines").update({
      vendor: text(it.vendor, 120), delivered_to_vendor_on: d1.value, vendor_returned_on: d2.value, completed_on: d3.value, cost: c.value, remarks: text(it.remarks, 20000), updated_at: new Date().toISOString(),
    }).eq("id", it.id);
    if (upErr) return { error: `未能保存：${upErr.message}` };
  }
  await logAudit("save_product_line_details", "memorial_product_lines", String(invoiceNo), `單號 ${invoiceNo}｜紀念品成本資料 ${items.length} 件`);
  revalidatePath(`/logistics/${invoiceNo}`);
  return {};
}
