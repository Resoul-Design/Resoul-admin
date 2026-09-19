// 顯示用單據編號：火化服務用「C」開頭、紀念產品用「P」開頭，
// 保留 Shopify 訂單的數字部分（例如 #RS-1011 → 火化顯示 #C-1011、產品顯示 #P-1006），
// 方便一眼分辨類別，同時仍可對回 Shopify 的 #RS-#### 訂單。
export function orderLabel(
  name: string | null | undefined,
  kind: "cremation" | "product"
): string {
  if (!name) return "—";
  const num = String(name).replace(/[^0-9]/g, "");
  if (!num) return String(name);
  return `#${kind === "cremation" ? "C" : "P"}-${num}`;
}
