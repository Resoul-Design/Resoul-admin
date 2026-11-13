import { notFound, redirect } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";
import { PageHeader } from "../_page-header";
import { loadPriceSettings, PRICE_SETTINGS_MISSING } from "@/lib/price-settings";
import { driverOptions } from "@/lib/drivers";
import { loadCatalog } from "@/lib/catalog";
import { PriceEditor, type EditorRow } from "./_editor";

export const dynamic = "force-dynamic";

const num = (n: number) => String(Math.round(n * 100) / 100);

export default async function PriceSettingsPage() {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!hasModule(staff, ["prices"])) notFound();
  const [settings, drivers, catalog] = await Promise.all([loadPriceSettings(), driverOptions(), loadCatalog("souvenir")]);

  // 名稱：按 SKU 對照 Shopify 產品
  const urnNames = new Map<string, string>();
  for (const p of catalog.products) {
    for (const v of p.variants) if (v.sku) urnNames.set(v.sku.toUpperCase(), v.title === "Default Title" ? p.title : `${p.title}（${v.title}）`);
  }
  const urnRows: EditorRow[] = Object.entries(settings.urnCosts).map(([key, amount]) => ({ key, amount: num(amount), name: urnNames.get(key) }));
  const productRows: EditorRow[] = Object.entries(settings.productCosts).map(([key, p]) => ({ key, amount: p.cost == null ? "" : num(p.cost), vendor: p.vendor || "", name: urnNames.get(key) }));
  const referralRows: EditorRow[] = settings.partners.map((p) => ({
    key: p.key,
    aliases: (p.aliases || []).join("、"),
    rateType: p.type,
    rate: p.type === "zero" ? "" : p.type === "percent" ? num(p.rate * 100) : num(p.rate),
    needsPackageCode: !!p.needsPackageCode,
  }));
  const driverNames = [...new Set([...Object.keys(settings.savedDrivers), ...drivers])];
  const driverRows: EditorRow[] = driverNames.map((key) => {
    const fee = settings.ready ? settings.savedDrivers[key] : settings.driverFees[key];
    return { key, amount: fee == null ? "" : num(fee), history: settings.historyFees[key] == null ? "" : num(settings.historyFees[key]) };
  });

  return (
    <div>
      <PageHeader title="價目設定" />
      {!settings.ready && <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{PRICE_SETTINGS_MISSING}</p>}
      <PriceEditor kind="product" title="紀念品成本及供應商" rows={productRows} canSave={settings.ready} />
      <PriceEditor kind="urn" title="骨灰龕成本" rows={urnRows} canSave={settings.ready} />
      <PriceEditor kind="referral" title="轉介夥伴" rows={referralRows} canSave={settings.ready} />
      <PriceEditor kind="driver" title="司機標準收費" rows={driverRows} canSave={settings.ready} />
    </div>
  );
}
