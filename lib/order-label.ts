// RSL-xxxxxx-xxxx 是跨接送、火化及紀念產品沿用的專案編號。
// Shopify #RESOUL-#### 是每次付款各自產生的發票編號，兩者不可互換。

/**
 * 規範化並回傳對外唯一「專案編號」。
 * - 優先使用表單／商品屬性內的 RSL 專案編號。
 * - 舊資料未有 RSL 編號時才回退顯示 Shopify 發票，避免資料完全無法辨識。
 * - 兩者皆無則回 "—"。
 */
export function canonicalProjectNo(
  shopifyOrderName?: string | null,
  fallback?: string | null
): string {
  const fb = String(fallback ?? "").trim();
  if (fb && fb !== "—") return fb;
  const raw = String(shopifyOrderName ?? "").trim();
  if (raw) {
    const digits = raw.replace(/\D/g, "");
    if (digits) return `#RESOUL-${digits}`;
    return raw.startsWith("#") ? raw : `#${raw}`;
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
  return value && !/^(新專案|New project)$/i.test(value) ? value : "—";
}

export function projectNoFromItems(items?: { attributes?: { key: string; value: string }[] }[]): string {
  return items?.flatMap((item) => item.attributes || []).find((a) => /project|專案/i.test(a.key))?.value || "—";
}
