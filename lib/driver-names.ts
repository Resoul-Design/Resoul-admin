// 司機名稱（瀏覽器及伺服器共用）：試算表司機名單及同一司機不同寫法的合併
export const EXCEL_DRIVERS = ["Ricky", "Joe", "豪仔 / Ho Jai", "Vivian", "Yeah O2", "V's Dad", "Gary", "JH", "Tony", "Jason", "Louis", "O2 Team"];

// 同一司機的不同寫法合併為一個選項（2026-11-11 用戶確認）；試算表及資料庫原有文字不變，只在選單及表格顯示時合併
const ALIASES: Record<string, string> = {
  "豪仔": "豪仔 / Ho Jai", "ho jai": "豪仔 / Ho Jai", "豪仔 / ho jai": "豪仔 / Ho Jai", "豪仔/ho jai": "豪仔 / Ho Jai",
  "v's dad": "V's Dad", "vivian's dad": "V's Dad", "yeah o2": "Yeah O2",
};
export function canonicalDriver(name: string | null | undefined): string {
  const s = String(name || "").trim();
  return ALIASES[s.toLowerCase().replace(/\s+/g, " ")] || ALIASES[s] || s;
}
