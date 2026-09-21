// Shopify 的 #RS-#### 是跨接送、火化及紀念品共用的專案編號。
// 不另造 C/P 前綴，避免同一客戶被拆成多個看似不同的專案。
export function orderLabel(
  name: string | null | undefined,
  kind: "cremation" | "product"
): string {
  if (!name) return "—";
  void kind;
  const value = String(name).trim();
  const num = value.replace(/[^0-9]/g, "");
  if (!num) return value;
  return `#RS-${num}`;
}
