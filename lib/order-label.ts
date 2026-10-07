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

export function projectNoFromNotes(notes?: string | null): string {
  const match = (notes || "").match(/(?:專案編號|Project no\.)[：:]\s*([^｜|]+)/i);
  const value = match?.[1]?.trim() || "";
  return isRslProjectNo(value) ? value.toUpperCase() : "—";
}

export function projectNoFromItems(items?: { attributes?: { key: string; value: string }[] }[]): string {
  const value = items?.flatMap((item) => item.attributes || []).find((a) => /project|專案/i.test(a.key))?.value || "";
  return isRslProjectNo(value) ? value.trim().toUpperCase() : "—";
}

// 紀念品訂單：訂單屬性帶入的編號（連結原有專案）優先，否則用系統自動產生的 project_no
export function productOrderProjectNo(o: { project_no?: string | null; line_items?: { attributes?: { key: string; value: string }[] }[] | null }): string {
  return canonicalProjectNo(projectNoFromItems(o.line_items || undefined), o.project_no);
}
