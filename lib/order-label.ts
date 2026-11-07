// 專案編號跨接送、火化及紀念產品沿用；系統新產生的為 RSL-xxxxxx-xxxx，同事亦可沿用其他編號。
// Shopify #RESOUL-#### 是每次付款各自產生的發票編號，兩者不可互換。

// 不限格式：只限文字、數字、空格、連字號及底線（編號會用於資料庫篩選及網址，其他符號會令查詢出錯）
const PROJECT_NO_RE = /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,39}$/u;
// Shopify 訂單號以 # 開頭已被上面排除；付款參考及資料列 UUID 不是專案編號
const NOT_PROJECT_NO_RE = /^PAY-|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProjectNo(value?: string | null): boolean {
  const text = String(value ?? "").trim();
  return PROJECT_NO_RE.test(text) && !NOT_PROJECT_NO_RE.test(text);
}

/**
 * 回傳對外唯一的專案編號。
 * Shopify 訂單號、付款參考碼及資料列 UUID 都不是專案編號，不能作後備顯示。
 */
export function canonicalProjectNo(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim().toUpperCase();
    if (isProjectNo(value)) return value;
  }
  return "—";
}

export function projectNoFromNotes(notes?: string | null): string {
  const match = (notes || "").match(/(?:專案編號|Project no\.)[：:]\s*([^｜|]+)/i);
  const value = match?.[1]?.trim() || "";
  return isProjectNo(value) ? value.toUpperCase() : "—";
}

export function projectNoFromItems(items?: { attributes?: { key: string; value: string }[] }[]): string {
  const value = items?.flatMap((item) => item.attributes || []).find((a) => /project|專案/i.test(a.key))?.value || "";
  return isProjectNo(value) ? value.trim().toUpperCase() : "—";
}

// 紀念品訂單：已保存的 project_no（自動產生、沿用訂單屬性或同事連結的原有專案）優先，否則讀訂單屬性
export function productOrderProjectNo(o: { project_no?: string | null; line_items?: { attributes?: { key: string; value: string }[] }[] | null }): string {
  return canonicalProjectNo(o.project_no, projectNoFromItems(o.line_items || undefined));
}
