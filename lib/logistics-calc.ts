// 客戶資料計算欄（對應 Google Sheet「Basic Info Logistic」，2026-11-10 已驗證公式）。
// 全部純計算、只作顯示：不寫入資料庫，不改任何已存欄位。
//   發票總額 invoice_total  ＝ 套餐價 ＋ 紀念品加購 ＋ 盅仔租用 ＋ 回歸自然（不含其他附加費）
//   尚欠 balance_due        ＝ 發票總額 − 訂金 − 折扣額
//   司機費 driver_cost      ＝ 按司機過往物流記錄自動帶入的「司機／GoGoVan 費用」
//   轉介費 referral_fee     ＝ 按轉介夥伴對照表（只限「應付」夥伴）
//   毛利 gross_profit       ＝ 發票總額 − 折扣額 − 紀念品成本 − 骨灰龕成本 − 運送成本 − 司機費 − 佣金（一律減佣金）
// 紀念品加購／成本：有紀念品產品行時以產品行加總；沒有產品行時用已存值。

export type ReferralType = "percent" | "fixed" | "zero" | "blank" | "unmapped";
export type ReferralPartner = { key: string; aliases?: string[]; type: "percent" | "fixed" | "zero"; rate: number; payable: boolean; needsPackageCode?: boolean };

// 轉介夥伴對照表（Resoul Referral Fee Cross-Map 2026-11-10）：只有 payable 的夥伴計費
export const REFERRAL_PARTNERS: ReferralPartner[] = [
  { key: "Precious Pet Clinic", type: "percent", rate: 0.1, payable: true },
  { key: "OAFA", type: "percent", rate: 0.1, payable: true, needsPackageCode: true },
  { key: "Yeah O2", aliases: ["YeahO2"], type: "percent", rate: 0.15, payable: true },
  { key: "Joyee", type: "fixed", rate: 180, payable: true },
  { key: "Buddy's", type: "percent", rate: 0.1, payable: true },
  { key: "Small animal", type: "percent", rate: 0.1, payable: true },
  { key: "HKDR(ALC)", type: "zero", rate: 0, payable: false },
  { key: "Royal Pet 0-20", type: "percent", rate: 0.1, payable: true },
  { key: "Royal Pet 21-40", type: "percent", rate: 0.15, payable: true },
  { key: "Royal Pet 41-80", type: "percent", rate: 0.2, payable: true },
  { key: "Royal Pet 81-100", type: "percent", rate: 0.25, payable: true },
  { key: "Royal Pet>100", type: "percent", rate: 0.3, payable: true },
];

const num = (v: unknown): number | null => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function findPartner(referral: unknown): ReferralPartner | null {
  const s = String(referral ?? "").trim();
  if (!s) return null;
  return REFERRAL_PARTNERS.find((p) => p.key === s || (p.aliases || []).includes(s)) || null;
}

// 轉介費：完全跟 Sheet 公式次序；對照表以外的文字（Others、N/A、半山貓醫院等）＝ 0，不計費
export function referralFee(referral: unknown, packagePrice: unknown, packageCode: unknown): { fee: number | null; type: ReferralType; payable: boolean; partner: string; note: string } {
  const raw = String(referral ?? "").trim();
  if (!raw) return { fee: null, type: "blank", payable: false, partner: "", note: "沒有轉介" };
  const p = findPartner(raw);
  if (!p) return { fee: 0, type: "unmapped", payable: false, partner: raw, note: "對照表以外的轉介，不計費" };
  if (p.type === "zero") return { fee: 0, type: "zero", payable: false, partner: p.key, note: "此夥伴不收轉介費" };
  if (p.type === "fixed") return { fee: p.rate, type: "fixed", payable: true, partner: p.key, note: `固定 HK$${p.rate}` };
  const price = num(packagePrice);
  const code = String(packageCode ?? "").trim();
  if (p.needsPackageCode && !code) return { fee: null, type: "percent", payable: true, partner: p.key, note: "未有套餐代碼，費用留空" };
  if (p.key === "Precious Pet Clinic" && price == null) return { fee: null, type: "percent", payable: true, partner: p.key, note: "未有套餐價，費用留空" };
  return { fee: round2((price ?? 0) * p.rate), type: "percent", payable: true, partner: p.key, note: `套餐價 × ${Math.round(p.rate * 100)}%${price == null ? "（未有套餐價）" : ""}` };
}

export type ShopifySummary = { hasDocs: boolean; depositPaid: number; gross: number; credit: number; other: number; payable: number };

export type LineTotals = { count: number; amount: number; cost: number; costCount: number };

export type LogisticsCalc = {
  memorial: { value: number; from: "lines" | "saved" };
  invoiceTotal: number;
  depositPaid: number;
  credit: number;
  discount: number;
  balanceDue: number;
  driverCost: { value: number; from: "saved" | "default" };
  referral: ReturnType<typeof referralFee>;
  memorialCost: { value: number; from: "lines" | "saved" };
  grossProfit: number;
};

// values：表格目前的值（已存值或正在編輯的值）；lines：紀念品產品行加總
// 有 Shopify 單據時：發票總額＝Shopify 原價、尚欠＝Shopify 應付、折扣＝Shopify 折扣；已收訂金只計 Shopify 已付款的接送訂金（沒有＝0）
export function computeLogistics(values: Record<string, unknown>, lines?: LineTotals | null, shopify?: ShopifySummary | null): LogisticsCalc {
  const v = (k: string) => num(values[k]) ?? 0;
  const memorial = lines && lines.count > 0 ? { value: round2(lines.amount), from: "lines" as const } : { value: v("memorial_addon_price"), from: "saved" as const };
  const depositPaid = shopify?.depositPaid ?? 0;
  const discount = shopify?.other ?? 0;
  const credit = shopify?.credit ?? 0;
  const invoiceTotal = shopify?.hasDocs ? shopify.gross : round2(v("package_price") + memorial.value + v("urn_storage_rental_price") + v("back_to_nature_price"));
  const balanceDue = shopify?.hasDocs ? shopify.payable : round2(invoiceTotal - depositPaid - discount);
  const savedDriver = num(values.driver_or_gogovan_cost);
  const driverCost = savedDriver != null ? { value: savedDriver, from: "saved" as const } : { value: 0, from: "default" as const };
  const memorialCost = lines && lines.costCount > 0 ? { value: round2(lines.cost), from: "lines" as const } : { value: v("memorial_cost"), from: "saved" as const };
  const grossProfit = round2(invoiceTotal - discount - memorialCost.value - v("urn_cost") - v("delivery_cost_to_customer") - driverCost.value - v("commission"));
  return { memorial, invoiceTotal, depositPaid, credit, discount, balanceDue, driverCost, referral: referralFee(values.referral, values.package_price, values.package_code), memorialCost, grossProfit };
}

// 紀念品產品行加總（只計已存的行；淡黃色建議行未保存，不計）
export function lineTotals(lines: { id: string | null; amount: number | null; quantity: number; unit_price: number | null; cost: number | null; suggested?: boolean; missing?: boolean }[]): LineTotals {
  // Shopify 已刪除的行（紅色）不計
  const saved = lines.filter((l) => l.id && !l.suggested && !l.missing);
  return {
    count: saved.length,
    amount: saved.reduce((n, l) => n + (l.amount ?? (l.unit_price ?? 0) * l.quantity), 0),
    cost: saved.reduce((n, l) => n + (l.cost ?? 0), 0),
    costCount: saved.filter((l) => l.cost != null).length,
  };
}
