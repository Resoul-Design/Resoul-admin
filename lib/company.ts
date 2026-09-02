// 文件（報價單／發票／收據）用的公司資料。
export const COMPANY = {
  name: "Resoul",
  tagline: "Your last greatest love to show",
  web: "https://resoul.hk",
  ig: "@resoul_hk",
  tel: "+852 6476 2951",
  email: "resoulhk@gmail.com",
  footer: "May the story of your beloved companion continue to bring warmth to your days.",
};

// 火化方案 → 產品代碼 + 英文名（與收據一致）
export const PLAN_CODES: Record<string, { code: string; en: string }> = {
  風之旅: { code: "BJ1", en: "Breeze Journey" },
  雲之旅: { code: "CJ1", en: "Cloud Journey" },
  星之旅: { code: "SJ1", en: "Star Journey" },
};
