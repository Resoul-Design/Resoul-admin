// 單據編號顯示：接送訂金在單號後加「-DEPOSIT」，與同一單號的火化／紀念品單據分開（單號本身不變，不會另開新號）
export const DEPOSIT_SUFFIX = "-DEPOSIT";
export function invoiceLabel(invoiceNo: number | string | null | undefined, orderType?: string | null): string {
  if (invoiceNo == null || invoiceNo === "") return "";
  return orderType === "deposit" ? `${invoiceNo}${DEPOSIT_SUFFIX}` : String(invoiceNo);
}
