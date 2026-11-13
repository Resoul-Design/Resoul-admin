// 成本只放在資料庫「價目設定」（price_settings，kind = urn），不寫在公開程式碼
export const URN_COSTS: Record<string, number> = {};
// 骨灰龕成本；By Package、No Urn、Pending 等不是產品代碼時為 null
export function urnCost(code: string | null | undefined, table: Record<string, number> = URN_COSTS): number | null {
  const c = String(code || "").trim().toUpperCase();
  return c in table ? table[c] : null;
}
