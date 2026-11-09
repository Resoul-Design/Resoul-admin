// 發票預設備註（開新單必選）：寫入 Shopify 付款連結備註，Order Printer 及後台發票的 Remarks 會顯示
export type UrnPickup = "today" | "later" | "na";
export const URN_PICKUP_OPTIONS: { key: UrnPickup; label: string; text: string }[] = [
  { key: "today", label: "今日取回骨灰", text: "Urn to be picked up today." },
  { key: "later", label: "另日取回骨灰", text: "Urn to be picked up another day." },
  { key: "na", label: "不適用（不加此句）", text: "" },
];
export const MEMORIAL_REMARK = "Memorial products ordered will be completed in around 90 business days.";
export const isUrnPickup = (v: unknown): v is UrnPickup => URN_PICKUP_OPTIONS.some((o) => o.key === v);

// 有訂紀念品時加 90 個工作天一句
export function invoiceRemarkLines(urn: UrnPickup | null | undefined, hasMemorial: boolean): string[] {
  const urnText = URN_PICKUP_OPTIONS.find((o) => o.key === urn)?.text || "";
  return [urnText, hasMemorial ? MEMORIAL_REMARK : ""].filter(Boolean);
}
