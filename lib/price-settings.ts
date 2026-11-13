// 價目設定（伺服器）：骨灰龕成本、轉介夥伴、司機標準收費。
// 來源為 Supabase price_settings（後台「價目設定」頁編輯）；未執行 db/migration_20261113_price_settings.sql 或某類別未有資料時，沿用程式內預設值。
// 司機：已設定的司機用設定值，未設定的司機沿用試算表記錄最常見金額。
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { REFERRAL_PARTNERS, type ReferralPartner } from "@/lib/logistics-calc";
import { URN_COSTS } from "@/lib/urn-costs";
import { canonicalDriver, driverFees as historyDriverFees } from "@/lib/drivers";

export const PRICE_SETTINGS_TAG = "price-settings";
export const PRICE_SETTINGS_MISSING = "未啟用價目設定：請先於 Supabase 執行 db/migration_20261113_price_settings.sql。";

export type PriceSettings = {
  ready: boolean; // price_settings 表已建立
  urnCosts: Record<string, number>;
  partners: ReferralPartner[];
  driverFees: Record<string, number>; // 已合併：設定值優先，其餘按記錄
  productCosts: Record<string, { cost: number | null; vendor: string | null }>; // 紀念品成本及供應商（按 SKU）
  savedDrivers: Record<string, number>; // 只限已設定
  historyFees: Record<string, number>; // 試算表記錄最常見金額
};

type Row = { kind: string; key: string; amount: number | null; rate_type: string | null; rate: number | null; needs_package_code: boolean | null; aliases: string[] | null; sort: number | null; vendor?: string | null };

async function load(): Promise<PriceSettings> {
  const [res, history] = await Promise.all([
    createAdminClient().from("price_settings").select("*").order("sort").order("key"),
    historyDriverFees(),
  ]);
  const rows = (res.error ? [] : res.data || []) as Row[];
  const of = (kind: string) => rows.filter((r) => r.kind === kind);
  const urnRows = of("urn"), refRows = of("referral"), drvRows = of("driver"), prodRows = of("product");
  const productCosts = Object.fromEntries(prodRows.map((r) => [r.key.toUpperCase(), { cost: r.amount == null ? null : Number(r.amount), vendor: r.vendor || null }]));
  const urnCosts = urnRows.length ? Object.fromEntries(urnRows.map((r) => [r.key.toUpperCase(), Number(r.amount || 0)])) : { ...URN_COSTS };
  const partners: ReferralPartner[] = refRows.length
    ? refRows.map((r) => {
        const type = r.rate_type === "fixed" || r.rate_type === "zero" ? r.rate_type : "percent";
        return { key: r.key, aliases: r.aliases || [], type, rate: type === "zero" ? 0 : Number(r.rate || 0), payable: type !== "zero", needsPackageCode: !!r.needs_package_code };
      })
    : REFERRAL_PARTNERS;
  const savedDrivers = Object.fromEntries(drvRows.filter((r) => r.amount != null).map((r) => [canonicalDriver(r.key), Number(r.amount)]));
  return { ready: !res.error, urnCosts, partners, driverFees: { ...history, ...savedDrivers }, productCosts, savedDrivers, historyFees: history };
}

const cached = unstable_cache(load, ["price-settings-v1"], { tags: [PRICE_SETTINGS_TAG], revalidate: 300 });

// 讀取（快取 5 分鐘；價目設定保存後即時更新）。快取內仍是「未建立」時直接重讀，執行 SQL 後即時生效
// 紀念品產品的供應商及單位成本（按產品代碼／SKU；骨灰龕代碼沿用骨灰龕成本）
export function productPricing(code: unknown, s: Pick<PriceSettings, "productCosts" | "urnCosts">): { vendor: string | null; cost: number | null } {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return { vendor: null, cost: null };
  const p = s.productCosts[c];
  return { vendor: p?.vendor || null, cost: p?.cost ?? (c in s.urnCosts ? s.urnCosts[c] : null) };
}

export async function loadPriceSettings(): Promise<PriceSettings> {
  const result = await cached();
  return result.ready ? result : load();
}
