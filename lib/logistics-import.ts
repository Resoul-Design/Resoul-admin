// 客戶資料 CSV 匯入：讀取 CSV（支援引號、逗號、換行）、對應欄位（中文標籤或欄位名）、轉換數字及日期。
// 欄位定義與單號詳細頁表格共用 lib/logistics-fields.ts。
import { LOGISTICS_FIELDS, type LogisticsField } from "@/lib/logistics-fields";

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
for (const f of LOGISTICS_FIELDS) { BY_HEADER.set(norm(f.key), f); BY_HEADER.set(norm(f.label), f); }

// 空值記號：視作空白（不覆蓋現有資料）
const EMPTY = new Set(["", "-", "—", "n/a", "na", "#n/a", "null"]);

function toDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // 日/月/年（香港格式）
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{5}$/.test(s)) { // Excel 日期序號
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export type ImportPlan = {
  rows: { line: number; invoiceNo: number; values: Record<string, string | number> }[];
  errors: string[];
  unknownColumns: string[];
};

export function planImport(text: string, opts: { isAdmin: boolean }): ImportPlan {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length < 2) return { rows: [], errors: ["CSV 沒有資料（第一行須為欄位名稱）。"], unknownColumns: [] };
  const headers = table[0];
  const invoiceCol = headers.findIndex((h) => INVOICE_HEADERS.includes(norm(h)));
  if (invoiceCol < 0) return { rows: [], errors: ["找不到「單號」欄（可用：單號、發票編號、invoice_no、Order No.）。"], unknownColumns: [] };
  const cols = headers.map((h, i) => (i === invoiceCol ? null : BY_HEADER.get(norm(h)) || null));
  const unknownColumns = headers.filter((h, i) => i !== invoiceCol && !cols[i] && h.trim());
  const rows: ImportPlan["rows"] = [];
  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const cells = table[r];
    // 只接受純數字單號（可帶 #、逗號、空格）；「66B」等附加單不可當成 66，否則會覆蓋原單
    const rawNo = String(cells[invoiceCol] ?? "").trim();
    if (!rawNo) continue;
    const cleanNo = rawNo.replace(/^#/, "").replace(/[,\s]/g, "").replace(/\.0+$/, "");
    const invoiceNo = /^\d+$/.test(cleanNo) ? Number(cleanNo) : NaN;
    if (!Number.isInteger(invoiceNo) || invoiceNo < 1) { errors.push(`第 ${line} 行：單號「${rawNo}」不是數字，已略過（附加單如 66B 請在原單號的資料內處理）`); continue; }
    const values: Record<string, string | number> = {};
    cols.forEach((f, i) => {
      if (!f || (f.adminOnly && !opts.isAdmin)) return;
      const raw = String(cells[i] ?? "").trim();
      if (EMPTY.has(raw.toLowerCase())) return;
      if (f.type === "number") {
        const n = Number(raw.replace(/[$,\sHKD]/gi, ""));
        if (Number.isFinite(n)) values[f.key] = n;
        else errors.push(`第 ${line} 行「${f.label}」不是數字（${raw.slice(0, 20)}），已略過此格`);
      } else if (f.type === "date") {
        const d = toDate(raw);
        if (d) values[f.key] = d;
        else errors.push(`第 ${line} 行「${f.label}」日期格式無法辨認（${raw.slice(0, 20)}），已略過此格`);
      } else values[f.key] = raw.slice(0, f.type === "textarea" ? 2000 : 300);
    });
    rows.push({ line, invoiceNo, values });
  }
  return { rows, errors, unknownColumns };
}

// 範本：單號＋全部欄位（中文標籤），加 BOM 方便 Excel 以 UTF-8 開啟
export function templateCsv(isAdmin: boolean): string {
  const fields = LOGISTICS_FIELDS.filter((f) => !f.adminOnly || isAdmin);
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + ["單號", ...fields.map((f) => f.label)].map(esc).join(",") + "\r\n";
}
