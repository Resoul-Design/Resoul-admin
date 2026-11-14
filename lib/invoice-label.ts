// 單據編號顯示：接送訂金在單號後加「-DEPOSIT」，與同一單號的火化／紀念品單據分開（單號本身不變，不會另開新號）
export const DEPOSIT_SUFFIX = "-DEPOSIT";
// 測試訂單：內部單號由 900001 起（不佔正式單號），對外顯示為 TEST-01、TEST-02…
export const TEST_INVOICE_BASE = 900000;
export const isTestInvoice = (invoiceNo: unknown) => Number(invoiceNo) > TEST_INVOICE_BASE;
export const testInvoiceLabel = (invoiceNo: number) => `TEST-${String(invoiceNo - TEST_INVOICE_BASE).padStart(2, "0")}`;
export function invoiceLabel(invoiceNo: number | string | null | undefined, orderType?: string | null): string {
  if (invoiceNo == null || invoiceNo === "") return "";
  const base = isTestInvoice(invoiceNo) ? testInvoiceLabel(Number(invoiceNo)) : String(invoiceNo);
  return orderType === "deposit" ? `${base}${DEPOSIT_SUFFIX}` : base;
}
