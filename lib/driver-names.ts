// 司機選項：試算表 Basic Info Logistic 的 Driver 欄（歷史名稱）。
// 只合併顯示同一人的不同寫法。這裡沒有司機收費表，不可由這些名稱推斷車費。

export const EXCEL_DRIVERS = ["Ricky", "Joe", "豪仔 / Ho Jai", "Vivian", "Yeah O2", "V's Dad", "Gary", "JH", "Tony", "Jason", "Louis"];

const ALIASES: Record<string, string> = {
  "豪仔": "豪仔 / Ho Jai",
  "ho jai": "豪仔 / Ho Jai",
  "豪仔 / ho jai": "豪仔 / Ho Jai",
  "豪仔/ho jai": "豪仔 / Ho Jai",
  "v's dad": "V's Dad",
  "vivian's dad": "V's Dad",
  "yeah o2": "Yeah O2",
  "o2 team": "Yeah O2",
};

const SKIP = /^(n\/?a|na|-|—|pending)$/i;

export function canonicalDriver(name: string | null | undefined): string {
  const value = String(name || "").trim().replace(/\s+/g, " ");
  if (!value || SKIP.test(value)) return "";
  return ALIASES[value.toLowerCase()] || ALIASES[value] || value;
}

export function driverChoices(extra: Array<string | null | undefined> = []): string[] {
  const seen = new Map<string, string>();
  for (const name of [...EXCEL_DRIVERS, ...extra.map((item) => canonicalDriver(item))]) {
    if (!name || SKIP.test(name)) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
}
