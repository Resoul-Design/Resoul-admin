// 由 Excel 匯入：先比較 CSV 與後台現有資料，列出差異，同事逐項核准後才寫入。
// 客戶資料（Basic Info Logistic）及紀念品（Memorial Product Order Tracking）共用同一流程；重新匯入同一份 CSV 不會重複寫入。
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOGISTICS_FIELDS } from "@/lib/logistics-fields";
import { planImport, type ImportPlan } from "@/lib/logistics-import";
import { extraOrders, type ExtraOrder } from "@/lib/logistics-extra";
import { planMemorialImport, type MemorialImportRow } from "@/lib/memorial-import";
import { loadPriceSettings } from "@/lib/price-settings";
import { urnCost } from "@/lib/urn-costs";

export type ReviewChange = { field: string; label: string; from: string; to: string };
export type ReviewItem = { id: string; invoiceNo: number; title: string; action: "new" | "update"; changes: ReviewChange[] };
export type ReviewResult = { kind: "logistics" | "memorial"; items: ReviewItem[]; unchanged: number; errors: string[]; unknownColumns: string[] };
export type Approved = Record<string, string[]>; // 項目 id → 核准的欄位

type Row = Record<string, unknown>;
const FIELD = new Map(LOGISTICS_FIELDS.map((f) => [f.key, f]));
const shown = (v: unknown) => (v == null ? "" : String(v).trim());
// 比較用：數字按數值、日期取前 10 字、文字去頭尾空白
function same(a: unknown, b: unknown, type?: string): boolean {
  const x = shown(a), y = shown(b);
  if (!x && !y) return true;
  if (type === "number") { const nx = Number(x.replace(/[$,\s]/g, "")), ny = Number(y.replace(/[$,\s]/g, "")); return x !== "" && y !== "" && Number.isFinite(nx) && Number.isFinite(ny) && Math.abs(nx - ny) < 0.005; }
  if (type === "date") return x.slice(0, 10) === y.slice(0, 10);
  return x === y;
}

// ---------- 客戶資料 ----------
export async function prepareLogistics(csv: string, isAdmin: boolean, admin: SupabaseClient): Promise<ImportPlan> {
  const plan = planImport(csv, { isAdmin });
  if (plan.excel) {
    // Excel 的「Memorial Product Cost」包括骨灰龕；後台分開記：紀念品成本（不含骨灰龕）＋骨灰龕成本
    const prices = await loadPriceSettings();
    for (const r of [...plan.rows, ...plan.extras]) {
      const urn = r.values.urn ? urnCost(String(r.values.urn), prices.urnCosts) : null;
      const mc = typeof r.values.memorial_cost === "number" ? r.values.memorial_cost : null;
      if (urn && mc != null && mc >= urn) r.values.memorial_cost = Math.round((mc - urn) * 100) / 100;
    }
    // 後台已改為骨灰龕產品代碼（URN…）的單，Excel 仍寫 By Package 時保留後台代碼
    const byPackage = plan.rows.filter((r) => /^by package$/i.test(String(r.values.urn || "")));
    for (let i = 0; i < byPackage.length; i += 500) {
      const { data } = await admin.from("logistics_orders").select("invoice_no, urn").in("invoice_no", byPackage.slice(i, i + 500).map((r) => r.invoiceNo));
      const sku = new Set((data || []).filter((x) => /^URN/i.test(String(x.urn || ""))).map((x) => Number(x.invoice_no)));
      for (const r of byPackage.slice(i, i + 500)) if (sku.has(r.invoiceNo)) delete r.values.urn;
    }
  }
  return plan;
}

async function currentLogistics(plan: ImportPlan, admin: SupabaseClient) {
  const ids = [...new Set([...plan.rows, ...plan.extras].map((r) => r.invoiceNo))];
  const cur = new Map<number, Row>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin.from("logistics_orders").select("*").in("invoice_no", ids.slice(i, i + 300));
    for (const r of (data || []) as Row[]) cur.set(Number(r.invoice_no), r);
  }
  return cur;
}

const diffValues = (values: Record<string, string | number>, current: Row | Record<string, unknown> | null): ReviewChange[] =>
  Object.entries(values).flatMap(([k, v]) => {
    const f = FIELD.get(k);
    const from = current ? current[k] : null;
    return same(from, v, f?.type) ? [] : [{ field: k, label: f?.label || k, from: shown(from), to: shown(v) }];
  });

export async function reviewLogistics(plan: ImportPlan, admin: SupabaseClient): Promise<ReviewResult> {
  const cur = await currentLogistics(plan, admin);
  const items: ReviewItem[] = [];
  let unchanged = 0;
  for (const r of plan.rows) {
    const row = cur.get(r.invoiceNo) || null;
    const changes = diffValues(r.values, row);
    if (!changes.length) { unchanged++; continue; }
    items.push({ id: `L:${r.invoiceNo}`, invoiceNo: r.invoiceNo, title: `單號 ${r.invoiceNo}${row?.pet_name || r.values.pet_name ? `｜${shown(row?.pet_name || r.values.pet_name)}` : ""}`, action: row ? "update" : "new", changes });
  }
  for (const e of plan.extras) {
    const parent = cur.get(e.invoiceNo);
    if (!parent) { items.push({ id: `E:${e.ref}`, invoiceNo: e.invoiceNo, title: `附加單 ${e.ref}（找不到原單號 ${e.invoiceNo}，不能寫入）`, action: "new", changes: [] }); continue; }
    const found = extraOrders(parent).find((x) => x.ref.toUpperCase() === e.ref);
    const changes = diffValues(e.values, found ? found.fields : null);
    if (!changes.length) { unchanged++; continue; }
    items.push({ id: `E:${e.ref}`, invoiceNo: e.invoiceNo, title: `附加單 ${e.ref}`, action: found ? "update" : "new", changes });
  }
  return { kind: "logistics", items, unchanged, errors: plan.errors, unknownColumns: plan.unknownColumns };
}

export async function applyLogistics(plan: ImportPlan, approved: Approved, admin: SupabaseClient) {
  const cur = await currentLogistics(plan, admin);
  const errors: string[] = [];
  let updated = 0, created = 0, extras = 0;
  const pick = (values: Record<string, string | number>, fields: string[] | undefined) => Object.fromEntries(Object.entries(values).filter(([k]) => fields?.includes(k)));
  for (const r of plan.rows) {
    const values = pick(r.values, approved[`L:${r.invoiceNo}`]);
    if (!Object.keys(values).length) continue;
    const exists = cur.has(r.invoiceNo);
    const { error } = exists
      ? await admin.from("logistics_orders").update({ ...values, updated_at: new Date().toISOString() }).eq("invoice_no", r.invoiceNo)
      : await admin.from("logistics_orders").insert({ invoice_no: r.invoiceNo, source: "csv", ...values });
    if (error) errors.push(`單號 ${r.invoiceNo}：未能保存（${error.message.slice(0, 80)}）`);
    else if (exists) updated++; else created++;
  }
  const byParent = new Map<number, typeof plan.extras>();
  for (const e of plan.extras) if (approved[`E:${e.ref}`]?.length) byParent.set(e.invoiceNo, [...(byParent.get(e.invoiceNo) || []), e]);
  for (const [parent, list] of byParent) {
    const { data: row } = await admin.from("logistics_orders").select("extra_orders").eq("invoice_no", parent).maybeSingle();
    if (!row) { for (const e of list) errors.push(`附加單 ${e.ref}：找不到原單號 ${parent}`); continue; }
    const current: ExtraOrder[] = extraOrders(row);
    for (const e of list) {
      const values = pick(e.values, approved[`E:${e.ref}`]);
      const i = current.findIndex((x) => x.ref.toUpperCase() === e.ref);
      if (i >= 0) current[i] = { ...current[i], fields: { ...current[i].fields, ...values } };
      else current.push({ ref: e.ref, fields: values, source_row: e.line });
    }
    const { error } = await admin.from("logistics_orders").update({ extra_orders: current, updated_at: new Date().toISOString() }).eq("invoice_no", parent);
    if (error) errors.push(`附加單（原單號 ${parent}）：未能保存（${error.message.slice(0, 80)}）`);
    else extras += list.length;
  }
  return { updated, created, extras, errors };
}

// ---------- 紀念品（Memorial Product Order Tracking） ----------
const MEMORIAL_LABEL: Record<string, string> = {
  pet_name: "寵物", product_name: "產品名稱", product_code: "產品代碼", vendor: "供應商", quantity: "數量", unit_price: "單價", amount: "金額", status: "狀態",
  status_note: "Excel 狀態", customer_order_date: "下單日期", completed_on: "完成日期", delivered_to_vendor_on: "交供應商日期", vendor_returned_on: "供應商交回日期", cost: "成本", remarks: "備註",
};
const MEMORIAL_TYPE: Record<string, string> = { quantity: "number", unit_price: "number", amount: "number", cost: "number", customer_order_date: "date", completed_on: "date", delivered_to_vendor_on: "date", vendor_returned_on: "date" };
const STATUS_LABEL: Record<string, string> = { ordered: "已訂購", pending_delivery: "待交付", completed: "已完成" };
// 已同步 Shopify 的行：名稱、數量、價錢以 Shopify 為準，不按 Excel 改
const LOCKED = new Set(["product_name", "product_code", "quantity", "unit_price", "amount"]);

async function memorialContext(rows: MemorialImportRow[], admin: SupabaseClient) {
  const invoices = [...new Set(rows.map((r) => r.invoiceNo))];
  const byKey = new Map<string, Row[]>();
  for (let i = 0; i < invoices.length; i += 300) {
    const { data, error } = await admin.from("memorial_product_lines").select("*").in("invoice_no", invoices.slice(i, i + 300)).order("sort_order").order("created_at");
    if (error) throw new Error("NOT_READY");
    for (const r of (data || []) as Row[]) { const k = `${r.invoice_no}|${shown(r.product_code || r.product_name).toUpperCase()}`; byKey.set(k, [...(byKey.get(k) || []), r]); }
  }
  // 第 n 件對應現有第 n 行
  return rows.map((r) => { const [k, n] = r.key.split("#"); return { row: r, line: (byKey.get(k) || [])[Number(n) - 1] || null }; });
}

const memorialChanges = (r: MemorialImportRow, line: Row | null): ReviewChange[] =>
  Object.entries(r.values).flatMap(([k, v]) => {
    if (line && LOCKED.has(k) && ["synced", "syncing"].includes(shown(line.sync_status))) return [];
    if (v == null || v === "") return []; // Excel 空白不覆蓋
    const from = line ? line[k] : null;
    if (same(from, v, MEMORIAL_TYPE[k])) return [];
    const fmt = (x: unknown) => (k === "status" ? STATUS_LABEL[shown(x)] || shown(x) : shown(x));
    return [{ field: k, label: MEMORIAL_LABEL[k] || k, from: fmt(from), to: fmt(v) }];
  });

export async function reviewMemorial(csv: string, admin: SupabaseClient): Promise<ReviewResult> {
  const mp = planMemorialImport(csv);
  const ctx = await memorialContext(mp.rows, admin);
  const items: ReviewItem[] = [];
  let unchanged = 0;
  for (const { row, line } of ctx) {
    const changes = memorialChanges(row, line);
    if (!changes.length) { unchanged++; continue; }
    items.push({ id: `M:${row.key}`, invoiceNo: row.invoiceNo, title: `單號 ${row.extraRef || row.invoiceNo}｜${row.values.product_name.slice(0, 60)}`, action: line ? "update" : "new", changes });
  }
  return { kind: "memorial", items, unchanged, errors: mp.errors, unknownColumns: [] };
}

export async function applyMemorial(csv: string, approved: Approved, admin: SupabaseClient, who: string) {
  const mp = planMemorialImport(csv);
  const ctx = await memorialContext(mp.rows, admin);
  const errors: string[] = [];
  let added = 0, updated = 0;
  for (const { row, line } of ctx) {
    const fields = approved[`M:${row.key}`];
    if (!fields?.length) continue;
    const allowed = new Set(memorialChanges(row, line).map((c) => c.field).filter((f) => fields.includes(f)));
    const values = Object.fromEntries(Object.entries(row.values).filter(([k]) => allowed.has(k)));
    if (line) {
      if (!Object.keys(values).length) continue;
      const { error } = await admin.from("memorial_product_lines").update({ ...values, updated_at: new Date().toISOString() }).eq("id", String(line.id));
      if (error) errors.push(`單號 ${row.invoiceNo}「${row.values.product_name.slice(0, 30)}」：未能更新（${error.message.slice(0, 80)}）`); else updated++;
    } else {
      // 新增的紀念品：寫入整行（產品名稱必定寫入）
      const { error } = await admin.from("memorial_product_lines").insert({ ...row.values, invoice_no: row.invoiceNo, extra_ref: row.extraRef, source: "excel", sync_status: "none", sort_order: Number(row.key.split("#")[1]), created_by: `Excel 匯入（${who}）` });
      if (error) errors.push(`單號 ${row.invoiceNo}「${row.values.product_name.slice(0, 30)}」：未能新增（${error.message.slice(0, 80)}）`); else added++;
    }
  }
  return { added, updated, errors };
}
