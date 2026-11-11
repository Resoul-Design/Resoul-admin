// 客戶資料計算欄（對應 Google Sheet「Basic Info Logistic」）。
// 全部純計算、只作顯示：不寫入資料庫，不改任何已存欄位。
//   發票總額：有 Shopify 單據時用原價；否則套餐價＋紀念品加購＋存放＋回歸自然。
//   尚欠：有 Shopify 單據時用應付（已扣接送訂金抵扣及折扣，不再減已收訂金）；否則發票總額−已收訂金−折扣。
//   司機費：只用已存的司機／GoGoVan 費用。沒有官方收費表，空白不是 0。
//   骨灰龕成本：本單骨灰龕有明確代碼時用目錄成本（包括牌價 0 的代碼）；否則用已存值，沒有則留空。
//   紀念品加購：有產品行時用實際行金額；行數為空時用已存值，不用 0 覆蓋舊數。
import { lookupUrnCost } from "./urn-cost";
import { sumMemorialLines } from "./memorial-total";

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

export type ShopifySummary = {
  loadError?: boolean;
  hasDocs: boolean;
  depositPaid: number | null;
  gross: number | null;
  credit: number | null;
  other: number | null;
  payable: number | null;
  planSku?: string;
  depositNote?: string;
};

export type LineTotals = { count: number; amount: number; ambiguous: boolean; cost: number; costCount: number };

export type LogisticsCalc = {
  memorial: { value: number | null; from: "lines" | "saved" | "none" | "ambiguous" };
  invoiceTotal: number | null;
  depositPaid: number | null;
  credit: number | null;
  discount: number | null;
  balanceDue: number | null;
  driverCost: { value: number | null; from: "saved" | "unresolved" };
  urnCost: { value: number | null; from: "catalog" | "saved" | "unresolved"; sku: string };
  referral: ReturnType<typeof referralFee>;
  memorialCost: { value: number; from: "lines" | "saved" };
  grossProfit: number | null;
};

// values：表格目前的值。lines：已存紀念品產品行。shopify：實時單據；讀取失敗時金額留空，不用 0。
export function computeLogistics(values: Record<string, unknown>, lines?: LineTotals | null, shopify?: ShopifySummary | null): LogisticsCalc {
  const v = (k: string) => num(values[k]) ?? 0;
  const savedMemorial = num(values.memorial_addon_price);
  const memorial = lines?.ambiguous
    ? (savedMemorial != null ? { value: savedMemorial, from: "saved" as const } : { value: null, from: "ambiguous" as const })
    : lines && lines.count > 0
      ? { value: round2(lines.amount), from: "lines" as const }
      : savedMemorial != null
        ? { value: savedMemorial, from: "saved" as const }
        : { value: 0, from: "none" as const };
  const failed = !!shopify?.loadError;
  const depositPaid = failed ? null : shopify?.depositPaid ?? 0;
  const discount = failed ? null : shopify?.hasDocs ? shopify.other ?? 0 : 0;
  const credit = failed ? null : shopify?.hasDocs ? shopify.credit ?? 0 : 0;
  const invoiceTotal = failed
    ? null
    : shopify?.hasDocs
      ? shopify.gross
      : memorial.value == null
        ? null
        : round2(v("package_price") + memorial.value + v("urn_storage_rental_price") + v("back_to_nature_price"));
  const balanceDue = failed
    ? null
    : shopify?.hasDocs
      ? shopify.payable
      : invoiceTotal == null || depositPaid == null
        ? null
        : round2(invoiceTotal - depositPaid - (discount ?? 0));
  const savedDriver = num(values.driver_or_gogovan_cost);
  const driverCost = savedDriver != null ? { value: savedDriver, from: "saved" as const } : { value: null, from: "unresolved" as const };
  const savedUrn = num(values.urn_cost);
  const urnLookup = lookupUrnCost(values.urn);
  const urnCost = urnLookup.state === "amount"
    ? { value: urnLookup.amount, from: "catalog" as const, sku: urnLookup.sku }
    : savedUrn != null
      ? { value: savedUrn, from: "saved" as const, sku: "" }
      : { value: null, from: "unresolved" as const, sku: "" };
  const memorialCost = lines && lines.costCount > 0 ? { value: round2(lines.cost), from: "lines" as const } : { value: v("memorial_cost"), from: "saved" as const };
  const grossProfit = invoiceTotal == null || discount == null || driverCost.value == null || urnCost.value == null
    ? null
    : round2(invoiceTotal - discount - memorialCost.value - urnCost.value - v("delivery_cost_to_customer") - driverCost.value - v("commission"));
  return { memorial, invoiceTotal, depositPaid, credit, discount, balanceDue, driverCost, urnCost, referral: referralFee(values.referral, values.package_price, values.package_code), memorialCost, grossProfit };
}

// 紀念品產品行加總（只計已存的行；淡黃色建議行及已刪除行不計）
export function lineTotals(lines: { id: string | null; amount: number | null; quantity: number; unit_price: number | null; cost: number | null; suggested?: boolean; missing?: boolean }[]): LineTotals {
  const saved = lines.filter((l) => l.id && !l.suggested && !l.missing);
  const total = sumMemorialLines(saved.map((line) => ({ amount: line.amount, unitPrice: line.unit_price, quantity: line.quantity })));
  return {
    count: saved.length,
    amount: total.state === "amount" ? total.amount : 0,
    ambiguous: total.state === "ambiguous",
    cost: saved.reduce((n, l) => n + (l.cost ?? 0), 0),
    costCount: saved.filter((l) => l.cost != null).length,
  };
}
