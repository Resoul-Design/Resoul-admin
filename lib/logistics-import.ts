// 客戶資料 CSV 匯入：讀取 CSV（支援引號、逗號、換行）、對應欄位（中文標籤或欄位名）、轉換數字及日期。
// 欄位定義與單號詳細頁表格共用 lib/logistics-fields.ts。
import { LOGISTICS_FIELDS, type LogisticsField, LEGACY_FIELD_LABELS, EXCEL_FIELD_LABELS } from "@/lib/logistics-fields";
import { parseExtraRef } from "@/lib/logistics-extra";

// RFC 4180 CSV：雙引號包住的欄位可含逗號、換行；兩個雙引號代表一個引號
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s（）()：:]/g, "");
const INVOICE_HEADERS = ["invoice_no", "單號", "發票編號", "order no.", "order no", "invoice no", "invoice no."].map(norm);
const BY_HEADER = new Map<string, LogisticsField>();
// 舊範本的欄名「骨灰盅…」（2026-11-10 改為「骨灰龕」）仍可匯入
for (const f of LOGISTICS_FIELDS) { BY_HEADER.set(norm(f.key), f); BY_HEADER.set(norm(f.label), f); BY_HEADER.set(norm(f.label.replaceAll("骨灰龕", "骨灰盅")), f); }
for (const [label, key] of Object.entries({ ...LEGACY_FIELD_LABELS, ...EXCEL_FIELD_LABELS })) { const f = LOGISTICS_FIELDS.find((x) => x.key === key); if (f) BY_HEADER.set(norm(label), f); }

// 空值記號：視作空白（不覆蓋現有資料）
// Excel 公式錯誤（#REF! 等）亦視作空白
const EMPTY = new Set(["", "-", "—", "n/a", "na", "#n/a", "null", "#ref!", "#value!", "#div/0!", "#name?", "#num!"]);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// 6:30 PM → 18:30；已是 24 小時制則保留
function toTime(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?$/);
  if (!m) return raw.trim();
  let h = Number(m[1]) % 12;
  if (/p/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// 年、月、日有效才回傳（避免 2026-13-06 之類寫入失敗）
function ymd(y: number, mo: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (mo < 1 || mo > 12 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toDate(raw: string): string | null {
  // 日期後面的括號備註（例如「24 Feb 2026 (Urn)」）不計
  const s = raw.trim().replace(/\s*[(（].*$/, "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  // 9 November 2026、11 Nov 2026、21-Aug-26（Excel）
  m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{2}|\d{4})$/);
  if (m) { const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); return mi >= 0 ? ymd(+m[3], mi + 1, +m[1]) : null; }
  // 日/月/年（香港格式）；第二個數字大於 12 時當作月/日/年（Excel 美式，例如 6/13/2026）
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return +m[2] > 12 ? ymd(+m[3], +m[1], +m[2]) : ymd(+m[3], +m[2], +m[1]);
  if (/^\d{5}$/.test(s)) { // Excel 日期序號
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

// 日期欄的文字記號（Pending、Collected、0 等）：當作空白，不提示
const DATE_WORDS = /^(pending|collected|tbc|tbd|待定|0)\b/i;
// 數字欄的文字記號
const NUMBER_WORDS = /^(pending|tbc|tbd|待定)\b/i;

// 重量：138g → 0.138；4.5kg → 4.5；範圍（2-3kg）及「<1」等不能確定，留提示
function toKg(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  let m = s.match(/^([\d.]+)g$/i);
  if (m) return Math.round(Number(m[1])) / 1000;
  m = s.match(/^([\d.]+)(kg|公斤)?$/i);
  return m && Number.isFinite(Number(m[1])) ? Number(m[1]) : null;
}

export type ImportPlan = {
  rows: { line: number; invoiceNo: number; values: Record<string, string | number> }[];
  // 附加單（66B 等）：寫入原單號的「附加單」
  extras: { line: number; invoiceNo: number; ref: string; values: Record<string, string | number> }[];
  errors: string[];
  unknownColumns: string[];
  excel: boolean; // Excel「Basic Info Logistic」英文欄名
};

export function planImport(text: string, opts: { isAdmin: boolean }): ImportPlan {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length < 2) return { rows: [], extras: [], errors: ["CSV 沒有資料（第一行須為欄位名稱）。"], unknownColumns: [], excel: false };
  const headers = table[0];
  const invoiceCol = headers.findIndex((h) => INVOICE_HEADERS.includes(norm(h)));
  if (invoiceCol < 0) return { rows: [], extras: [], errors: ["找不到「單號」欄（可用：單號、發票編號、invoice_no、Order No.）。"], unknownColumns: [], excel: false };
  const statusField = LOGISTICS_FIELDS.find((f) => f.key === "row_status") || null;
  // Excel 匯出：第一欄沒有欄名，內容是訂單狀態（Appointment Made、Completed…）
  const cols = headers.map((h, i) => (i === invoiceCol ? null : BY_HEADER.get(norm(h)) || (i === 0 && !h.trim() && invoiceCol > 0 ? statusField : null)));
  const unknownColumns = headers.filter((h, i) => i !== invoiceCol && !cols[i] && h.trim());
  const rows: ImportPlan["rows"] = [];
  const extras: ImportPlan["extras"] = [];
  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const cells = table[r];
    // 只接受純數字單號（可帶 #、逗號、空格）；「66B」等附加單不可當成 66，否則會覆蓋原單
    const rawNo = String(cells[invoiceCol] ?? "").trim();
    if (!rawNo) continue;
    const cleanNo = rawNo.replace(/^#/, "").replace(/[,\s]/g, "").replace(/\.0+$/, "");
    const invoiceNo = /^\d+$/.test(cleanNo) ? Number(cleanNo) : NaN;
    const extra = parseExtraRef(rawNo);
    if (!extra && (!Number.isInteger(invoiceNo) || invoiceNo < 1)) { errors.push(`第 ${line} 行：單號「${rawNo}」不是數字，已略過`); continue; }
    const values: Record<string, string | number> = {};
    cols.forEach((f, i) => {
      if (!f || (f.adminOnly && !opts.isAdmin)) return;
      const raw = String(cells[i] ?? "").trim();
      if (EMPTY.has(raw.toLowerCase())) return;
      if (f.type === "number" && NUMBER_WORDS.test(raw)) return;
      if (f.type === "date" && DATE_WORDS.test(raw)) return;
      if (f.key === "weight_kg") {
        const kg = toKg(raw);
        if (kg != null) values[f.key] = kg;
        else errors.push(`第 ${line} 行「${f.label}」不是數字（${raw.slice(0, 20)}），已略過此格`);
      } else if (f.type === "number") {
        const n = Number(raw.replace(/[$,\sHKD]/gi, ""));
        if (Number.isFinite(n)) values[f.key] = n;
        else errors.push(`第 ${line} 行「${f.label}」不是數字（${raw.slice(0, 20)}），已略過此格`);
      } else if (f.type === "date") {
        const d = toDate(raw);
        if (d) values[f.key] = d;
        else errors.push(`第 ${line} 行「${f.label}」日期格式無法辨認（${raw.slice(0, 20)}），已略過此格`);
      } else if (f.key === "arrival_time" || f.key === "ceremony_time") values[f.key] = toTime(raw);
      else if (f.key === "urn_pickup_status") values[f.key] = /^pending$/i.test(raw) ? "待定" : toDate(raw) || raw.slice(0, 300);
      else values[f.key] = raw.slice(0, f.type === "textarea" ? 2000 : 300);
    });
    if (extra) extras.push({ line, invoiceNo: extra.invoice, ref: extra.ref, values });
    else rows.push({ line, invoiceNo, values });
  }
  const excel = headers.some((h) => norm(h) === norm("Memorial Product Cost") || norm(h) === norm("Package Price"));
  return { rows, extras, errors, unknownColumns, excel };
}

// 範本：單號＋全部欄位（中文標籤），加 BOM 方便 Excel 以 UTF-8 開啟
export function templateCsv(isAdmin: boolean): string {
  const fields = LOGISTICS_FIELDS.filter((f) => !f.adminOnly || isAdmin);
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + ["單號", ...fields.map((f) => f.label)].map(esc).join(",") + "\r\n";
}
