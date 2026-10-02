// 單一 CSV 儲存格：文字以 = + - @ 或 Tab／換行開頭時加 ' 前綴，避免 Excel 當作公式執行
// （客人在網站填寫的姓名、備註等會出現在匯出檔）；數字保持原樣
export function csvCell(v: string | number | null | undefined) {
  let s = v === null || v === undefined ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  // 加 BOM，Excel 開 CJK 才正常
  return "﻿" + lines.join("\r\n");
}

export function csvResponse(filename: string, csv: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
