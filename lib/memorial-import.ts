// Excel「Memorial Product Order Tracking」CSV 匯入：每行一件紀念品，寫入紀念品產品行。
// 按單號＋產品代碼（沒有代碼時用產品名稱）逐件比對，資料庫已有的不會重複加入（可重複匯入同一份 CSV）。
import { parseCsv, toDate } from "@/lib/logistics-import";
import { parseExtraRef } from "@/lib/logistics-extra";

export type MemorialImportRow = {
  line: number; invoiceNo: number; extraRef: string | null; key: string;
  values: { pet_name: string | null; product_name: string; product_code: string | null; vendor: string | null; quantity: number; unit_price: number | null; amount: number | null; status: string; status_note: string | null; customer_order_date: string | null; completed_on: string | null; delivered_to_vendor_on: string | null; vendor_returned_on: string | null; cost: number | null; remarks: string | null };
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s（）()：:/]/g, "");
const HEAD = {
  no: "Customer Number", pet: "Pet Name", order: "Customer Order Date", done: "Completed / delivery to Customer date",
  code: "Product Code", vendor: "Vendor", unit: "Unit", product: "Product", remarks: "Remarks", unitPrice: "Prodcut price - pre Unit",
  amount: "Prodcut price  -Item Total", toVendor: "Delivery date to vendor", returned: "Vendor return date", cost: "Item cost/ To pay Vendor)", status: "Product Status",
} as const;

// 是否「Memorial Product Order Tracking」CSV
export function isMemorialTracking(text: string): boolean {
  const h = (parseCsv(text.slice(0, 5000))[0] || []).map(norm);
  return [HEAD.no, HEAD.code, HEAD.status].every((x) => h.includes(norm(x)));
}

const text = (v: unknown) => { const s = String(v ?? "").trim(); return s && !/^(none|n\/?a|-|—)$/i.test(s) ? s : null; };
const money = (v: unknown) => { const s = String(v ?? "").replace(/[$,\sHKD]/gi, ""); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
const date = (v: unknown) => { const s = text(v); return s ? toDate(s) : null; };

// Excel「Product Status」→ 已訂購／待交付／已完成
function statusOf(raw: string | null, completedOn: string | null): string {
  const s = (raw || "").toLowerCase();
  if (completedOn || /done|complete|delivered/.test(s)) return "completed";
  if (/pending/.test(s)) return "pending_delivery";
  return "ordered";
}

export function planMemorialImport(csv: string): { rows: MemorialImportRow[]; errors: string[] } {
  const table = parseCsv(csv);
  const headers = (table[0] || []).map(norm);
  const at = (name: string) => { const n = norm(name); const exact = headers.indexOf(n); return exact >= 0 ? exact : headers.findIndex((h) => h.startsWith(n)); };
  const idx = Object.fromEntries(Object.entries(HEAD).map(([k, v]) => [k, at(v)])) as Record<keyof typeof HEAD, number>;
  const errors: string[] = [];
  const rows: MemorialImportRow[] = [];
  const seen = new Map<string, number>();
  for (let r = 1; r < table.length; r++) {
    const cells = table[r], line = r + 1;
    const get = (k: keyof typeof HEAD) => (idx[k] >= 0 ? cells[idx[k]] : "");
    const rawNo = String(get("no") ?? "").trim().replace(/\.0+$/, "");
    const product = text(get("product"));
    if (!rawNo || !product) continue;
    const extra = parseExtraRef(rawNo);
    const plain = rawNo.replace(/^#/, "");
    const invoiceNo = extra ? extra.invoice : /^\d+$/.test(plain) ? Number(plain) : NaN;
    if (!Number.isInteger(invoiceNo) || invoiceNo < 1) { errors.push(`第 ${line} 行：單號「${rawNo}」不是數字，已略過`); continue; }
    const code = text(get("code"));
    const completedOn = date(get("done"));
    const statusNote = text(get("status"));
    const key = `${invoiceNo}|${(code || product).toUpperCase()}`;
    seen.set(key, (seen.get(key) || 0) + 1);
    rows.push({
      line, invoiceNo, extraRef: extra?.ref || null, key: `${key}#${seen.get(key)}`,
      values: {
        pet_name: text(get("pet")), product_name: product.slice(0, 300), product_code: code?.slice(0, 120) || null, vendor: text(get("vendor"))?.slice(0, 120) || null,
        quantity: money(get("unit")) || 1, unit_price: money(get("unitPrice")), amount: money(get("amount")),
        status: statusOf(statusNote, completedOn), status_note: statusNote?.slice(0, 300) || null,
        customer_order_date: date(get("order")), completed_on: completedOn, delivered_to_vendor_on: date(get("toVendor")), vendor_returned_on: date(get("returned")),
        cost: money(get("cost")), remarks: text(get("remarks"))?.slice(0, 20000) || null,
      },
    });
  }
  return { rows, errors };
}
