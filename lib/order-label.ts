// RSL-xxxxxx-xxxx 是跨接送、火化及紀念產品沿用的專案編號。
// Shopify #RESOUL-#### 是每次付款各自產生的發票編號，兩者不可互換。

const RSL_PROJECT_RE = /^RSL-[A-Z0-9]+-[A-Z0-9]+$/i;

export function isRslProjectNo(value?: string | null): boolean {
  return RSL_PROJECT_RE.test(String(value ?? "").trim());
}

/**
 * 回傳對外唯一的 RSL 專案編號。
 * Shopify 訂單號、付款參考碼及資料列 UUID 都不是專案編號，不能作後備顯示。
 */
export function canonicalProjectNo(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim().toUpperCase();
    if (isRslProjectNo(value)) return value;
  }
  return "—";
}

/**
 * @deprecated 舊版 #RS-#### 標籤；請改用 canonicalProjectNo()。保留供尚未遷移的位置參考。
 */
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

export function projectNoFromNotes(notes?: string | null): string {
  const match = (notes || "").match(/(?:專案編號|Project no\.)[：:]\s*([^｜|]+)/i);
  const value = match?.[1]?.trim() || "";
  return isRslProjectNo(value) ? value.toUpperCase() : "—";
}

export function projectNoFromItems(items?: { attributes?: { key: string; value: string }[] }[]): string {
  const value = items?.flatMap((item) => item.attributes || []).find((a) => /project|專案/i.test(a.key))?.value || "";
  return isRslProjectNo(value) ? value.trim().toUpperCase() : "—";
}
