import { unstable_cache } from "next/cache";
import { shopifyGraphQL } from "@/lib/shopify";

// Shopify 上架產品目錄：紀念品訂單、火化預約及接送服務的「新增訂單」共用。
export type DraftCatalogProduct = {
  id: string;
  title: string;
  productType: string;
  variants: { id: string; title: string; sku: string | null; price: string | null }[];
};

// 按產品類型分流：火化預約只可選火化服務；接送服務只可選預約服務；紀念品訂單排除以上及火化套餐
export const CREMATION_TYPES = ["火化服務"];
export const DEPOSIT_TYPES = ["預約服務"];
const NOT_SOUVENIR = [...CREMATION_TYPES, ...DEPOSIT_TYPES, "火化套餐 Cremation Package"];

type CatalogResponse = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: {
      node: {
        id: string;
        title: string;
        productType: string | null;
        variants: { edges: { node: { id: string; title: string; sku: string | null; price: string | null } }[] };
      };
    }[];
  };
};

// 分頁讀取全部上架產品（每頁 50 件；上限 10 頁）
const CATALOG_QUERY = `query DraftCatalog($after: String) {
  products(first: 50, after: $after, sortKey: TITLE, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id title productType
      variants(first: 20) { edges { node { id title sku price } } }
    } }
  }
}`;
const CATALOG_MAX_PAGES = 10;

// 產品目錄變動不頻繁：快取 5 分鐘；讀取失敗時拋出錯誤，不會把失敗結果寫入快取。
const getCatalogCached = unstable_cache(
  async (): Promise<DraftCatalogProduct[]> => {
    const products: DraftCatalogProduct[] = [];
    let after: string | null = null;
    for (let page = 0; page < CATALOG_MAX_PAGES; page++) {
      const catalog: CatalogResponse = await shopifyGraphQL<CatalogResponse>(CATALOG_QUERY, { after });
      for (const { node } of catalog.products.edges) {
        const variants = node.variants.edges.map(({ node: variant }) => variant);
        if (!variants.length) continue;
        products.push({ id: node.id, title: node.title, productType: (node.productType || "").trim() || "未分類", variants });
      }
      if (!catalog.products.pageInfo.hasNextPage) break;
      after = catalog.products.pageInfo.endCursor;
    }
    return products;
  },
  ["draft-catalog"],
  { revalidate: 300 }
);

export type CatalogKind = "souvenir" | "cremation" | "deposit";

export async function loadCatalog(kind: CatalogKind): Promise<{ products: DraftCatalogProduct[]; error: string }> {
  try {
    const all = await getCatalogCached();
    const products = all.filter((p) =>
      kind === "cremation" ? CREMATION_TYPES.includes(p.productType)
        : kind === "deposit" ? DEPOSIT_TYPES.includes(p.productType)
          : !NOT_SOUVENIR.includes(p.productType)
    );
    return { products, error: products.length ? "" : "Shopify 暫無可加入的上架產品。" };
  } catch (e) {
    console.error("[draft_catalog]", e instanceof Error ? e.message : "unknown error");
    return { products: [], error: "未能讀取 Shopify 產品。請確認 Shopify 連線和 read_products 權限。" };
  }
}
