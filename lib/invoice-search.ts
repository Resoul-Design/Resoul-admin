// 單號搜尋：接受「319」「#319」「單號 319」「319-DEPOSIT」「66B」，回傳可比對的單號文字；不是單號時回傳空字串
export function invoiceQuery(raw: string): string {
  const s = String(raw || "").trim().replace(/^(?:#|單號|發票編號|發票|invoice(?:\s*no\.?)?)\s*/i, "").replace(/\s+/g, "");
  const m = s.match(/^(\d{1,8})(?:-?deposit|([a-z]))?$/i);
  return m ? m[1] + (m[2] ? m[2].toUpperCase() : "") : "";
}

// 比對單號（整個單號相同，打 319 不會出現 1319）；附加單 66B 亦對應原單 66
export function matchesInvoice(raw: string, invoiceNo: number | string | null | undefined): boolean {
  const q = invoiceQuery(raw);
  if (!q || invoiceNo == null || invoiceNo === "") return false;
  return String(invoiceNo).toUpperCase() === q || q.replace(/[A-Z]$/, "") === String(invoiceNo);
}
