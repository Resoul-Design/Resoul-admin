// 發票預設備註（開新單必選）：寫入 Shopify 付款連結備註，Order Printer 及後台發票的 Remarks 會顯示
export type UrnPickup = "today" | "later" | "na";
export const URN_PICKUP_OPTIONS: { key: UrnPickup; label: string; text: string }[] = [
  { key: "today", label: "今日取回骨灰", text: "Urn to be picked up today." },
  { key: "later", label: "另日取回骨灰", text: "Urn to be picked up another day." },
  { key: "na", label: "不適用（不加此句）", text: "" },
];
export const MEMORIAL_REMARK = "Memorial products ordered will be completed in around 90 business days.";
export const isUrnPickup = (v: unknown): v is UrnPickup => URN_PICKUP_OPTIONS.some((o) => o.key === v);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 按骨灰龕取回日期建議發票備註：不需要骨灰龕＝不適用；取回日期＝火化日期＝今日取回；其他日期或待定＝另日取回
export function suggestUrnPickup(pickupDate: string, serviceDate: string, urnType: string): UrnPickup | null {
  if (urnType === "No Urn") return "na";
  if (!pickupDate) return null;
  if (serviceDate && pickupDate === serviceDate) return "today";
  return "later";
}

// 有訂紀念品時加 90 個工作天一句；另日取回並有取回日期時寫出日期（例如 Urn to be picked up on 20 Nov 2026.）
export function invoiceRemarkLines(urn: UrnPickup | null | undefined, hasMemorial: boolean, pickupDate?: string | null): string[] {
  const m = String(pickupDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const urnText = urn === "later" && m ? `Urn to be picked up on ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}.` : URN_PICKUP_OPTIONS.find((o) => o.key === urn)?.text || "";
  return [urnText, hasMemorial ? MEMORIAL_REMARK : ""].filter(Boolean);
}
