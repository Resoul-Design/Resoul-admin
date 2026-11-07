// 接送訂金可抵扣金額：只計訂金本身（預設 HK$1,800，可用 DEPOSIT_AMOUNT 設定）。
// 舊單的付款金額可能連同其他商品一併收取（例如訂金 1,800＋產品 1,000＝2,800），多出的部分不屬訂金，不可抵扣。
export const DEPOSIT_AMOUNT = Number(process.env.DEPOSIT_AMOUNT) > 0 ? Number(process.env.DEPOSIT_AMOUNT) : 1800;

export function depositCreditValue(paymentAmount: unknown): number {
  const paid = Number(paymentAmount);
  return Number.isFinite(paid) && paid > 0 ? Math.min(paid, DEPOSIT_AMOUNT) : DEPOSIT_AMOUNT;
}
