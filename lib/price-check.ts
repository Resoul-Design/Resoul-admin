// 同步狀態：網站火化收費（後台「網站內容」）與 Shopify 火化方案價錢對數，以及未設產品類型的產品
import { shopifyGraphQL } from "@/lib/shopify";
import { PLAN_NAMES, type CremationPrices } from "@/lib/site-content";

export type PriceCompareRow = { band: string; plan: string; site: number | null; shop: number | null; state: "ok" | "diff" | "site_only" | "shop_only" };

// 體重級別統一寫法：「1 kg 以下」＝「< 1 kg」；連字號及空格統一
const normBand = (s: string) => {
  const t = s.replace(/\s+/g, " ").replace(/[-‐‑‒—―]/g, "–").trim();
  return /^1 ?kg 以下$|^under 1 ?kg$/i.test(t) ? "< 1 kg" : t.replace(/\s*–\s*/g, "–");
};

type ProductsResp = { products: { nodes: { title: string; productType: string; status: string; variants: { nodes: { title: string; price: string }[] } }[] } };

export async function comparePrices(site: CremationPrices): Promise<{ rows: PriceCompareRow[]; error?: string }> {
  let shopProducts: ProductsResp["products"]["nodes"] = [];
  try {
    const q = PLAN_NAMES.map((p) => `title:${p.zh}*`).join(" OR ");
    shopProducts = (await shopifyGraphQL<ProductsResp>(
      `query($q: String!) { products(first: 20, query: $q) { nodes { title productType status variants(first: 30) { nodes { title price } } } } }`,
      { q }
    )).products.nodes;
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message.slice(0, 120) : "Shopify 連線失敗" };
  }
  const rows: PriceCompareRow[] = [];
  PLAN_NAMES.forEach((plan, i) => {
    // 只取方案本身（例如「風之旅 Breeze Journey」），不包括骨灰龕套餐
    const product = shopProducts.find((p) => p.title.startsWith(plan.zh));
    const shopMap = new Map((product?.variants.nodes || []).map((v) => [normBand(v.title), Number(v.price)]));
    const seen = new Set<string>();
    for (const r of site.rows) {
      const band = normBand(r.zh);
      seen.add(band);
      const sitePrice = r.prices[i] ?? null;
      const shopPrice = shopMap.has(band) ? shopMap.get(band)! : null;
      rows.push({ band, plan: plan.zh, site: sitePrice, shop: shopPrice, state: shopPrice === null ? "site_only" : sitePrice === shopPrice ? "ok" : "diff" });
    }
    for (const [band, price] of shopMap) if (!seen.has(band)) rows.push({ band, plan: plan.zh, site: null, shop: price, state: "shop_only" });
  });
  return { rows };
}

// 已上架但未設「產品類型」的產品（商店分類以產品類型為準，未設的只會在「全部」出現）
export async function productsWithoutType(): Promise<{ titles: string[]; error?: string }> {
  try {
    const d = await shopifyGraphQL<ProductsResp>(`{ products(first: 250, query: "status:active") { nodes { title productType status variants(first: 1) { nodes { title price } } } } }`);
    return { titles: d.products.nodes.filter((p) => !p.productType.trim()).map((p) => p.title) };
  } catch (e) {
    return { titles: [], error: e instanceof Error ? e.message.slice(0, 120) : "Shopify 連線失敗" };
  }
}
