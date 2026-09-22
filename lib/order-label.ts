// 對外／跨系統唯一「專案編號」= Shopify 訂單名（#RESOUL-####）。
// 接送訂金、火化預約、紀念產品同一客戶旅程，都應顯示同一個 #RESOUL-####。
// 每次付款仍可有獨立 payment_ref／發票；UI 要分開標籤「專案編號」vs「付款參考／發票」。

/**
 * 規範化並回傳對外唯一「專案編號」。
 * - 永遠優先 Shopify 訂單名（#RESOUL-####）：去空白、只留數字、補回 #RESOUL- 前綴。
 * - 無 Shopify 訂單名時，回退到 fallback（例如 notes 內專案號或 case_no）。
 * - 兩者皆無則回 "—"。
 */
export function canonicalProjectNo(
  shopifyOrderName?: string | null,
  fallback?: string | null
): string {
  const raw = String(shopifyOrderName ?? "").trim();
  if (raw) {
    const digits = raw.replace(/\D/g, "");
    if (digits) return `#RESOUL-${digits}`;
    return raw.startsWith("#") ? raw : `#${raw}`;
  }
  const fb = String(fallback ?? "").trim();
  return fb || "—";
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
