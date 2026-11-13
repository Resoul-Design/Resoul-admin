"use server";

// 價目設定：保存一個類別（骨灰龕成本／轉介夥伴／司機標準收費）的全部項目。
// 只影響之後的計算；舊單已存的金額不會改寫（客戶資料保存規則：只在未有值或改了司機／骨灰龕時寫入）。
import { revalidatePath, revalidateTag } from "next/cache";
import { requireModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalDriver } from "@/lib/driver-names";
import { PRICE_SETTINGS_MISSING, PRICE_SETTINGS_TAG } from "@/lib/price-settings";

export type PriceRowInput = { key: string; amount?: string; rateType?: string; rate?: string; aliases?: string; needsPackageCode?: boolean; vendor?: string };
type Kind = "urn" | "referral" | "driver" | "product";
const LABEL: Record<Kind, string> = { urn: "骨灰龕成本", referral: "轉介夥伴", driver: "司機標準收費", product: "紀念品成本及供應商" };

const money = (v: unknown): number | null => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
};

export async function savePriceSettings(kind: Kind, input: PriceRowInput[]): Promise<{ error?: string; done?: string }> {
  const staff = await requireModule("prices");
  if (!LABEL[kind]) return { error: "類別不正確。" };
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const [i, r] of input.entries()) {
    const raw = String(r.key || "").trim();
    if (!raw) continue;
    const key = kind === "urn" || kind === "product" ? raw.toUpperCase() : kind === "driver" ? canonicalDriver(raw) : raw;
    const dup = key.toLowerCase();
    if (seen.has(dup)) return { error: `「${key}」重複，請刪除其中一項。` };
    seen.add(dup);
    const base = { kind, key, sort: i + 1, updated_at: new Date().toISOString(), updated_by: staff.name || staff.email };
    if (kind === "referral") {
      const type = r.rateType === "fixed" || r.rateType === "zero" ? r.rateType : "percent";
      const value = type === "zero" ? 0 : money(r.rate);
      if (value == null || Number.isNaN(value)) return { error: `「${key}」須填寫${type === "fixed" ? "金額" : "百分比"}。` };
      if (type === "percent" && value > 100) return { error: `「${key}」百分比不可大於 100。` };
      const aliases = [...new Set(String(r.aliases || "").split(/[,，、]/).map((x) => x.trim()).filter((x) => x && x !== key))];
      rows.push({ ...base, rate_type: type, rate: type === "percent" ? value / 100 : value, amount: null, needs_package_code: !!r.needsPackageCode, aliases });
    } else if (kind === "product") {
      const value = money(r.amount);
      const vendor = String(r.vendor || "").trim().slice(0, 120);
      if (Number.isNaN(value)) return { error: `「${key}」成本不正確。` };
      if (value == null && !vendor) continue;
      rows.push({ ...base, amount: value, vendor: vendor || null, rate_type: null, rate: null, needs_package_code: false, aliases: [] });
    } else {
      const value = money(r.amount);
      if (value == null) { if (kind === "driver") continue; return { error: `「${key}」須填寫成本。` }; }
      if (Number.isNaN(value)) return { error: `「${key}」金額不正確。` };
      rows.push({ ...base, amount: value, rate_type: null, rate: null, needs_package_code: false, aliases: [] });
    }
  }

  const db = createAdminClient();
  const existing = await db.from("price_settings").select("key").eq("kind", kind);
  if (existing.error) return { error: PRICE_SETTINGS_MISSING };
  if (kind === "product") {
    const probe = await db.from("price_settings").select("vendor").limit(1);
    if (probe.error) return { error: "未啟用紀念品成本：請先於 Supabase 執行 data_20261113_product_costs.sql。" };
  }
  const keep = new Set(rows.map((r) => String(r.key)));
  const remove = (existing.data || []).map((r) => String(r.key)).filter((k) => !keep.has(k));
  if (rows.length) {
    const { error } = await db.from("price_settings").upsert(rows, { onConflict: "kind,key" });
    if (error) return { error: kind === "product" && /check constraint|kind_check/.test(error.message) ? "未啟用紀念品成本：請先於 Supabase 執行 data_20261113_product_costs.sql。" : "未能保存，請稍後再試。" };
  }
  if (remove.length) {
    const { error } = await db.from("price_settings").delete().eq("kind", kind).in("key", remove);
    if (error) return { error: "已保存，但未能刪除已移除的項目，請重新整理後再試。" };
  }
  await logAudit("update_price_settings", "price_settings", kind, `${LABEL[kind]}：${rows.length} 項${remove.length ? `，刪除 ${remove.join("、")}` : ""}`);
  revalidateTag(PRICE_SETTINGS_TAG);
  revalidatePath("/prices");
  return { done: `已保存${LABEL[kind]}（${rows.length} 項）。` };
}
