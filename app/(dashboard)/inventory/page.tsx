import { shopifyGraphQL } from "@/lib/shopify";
import { InventoryList, type Group } from "./_list";

export const dynamic = "force-dynamic";

type ProductsResp = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: {
      node: {
        id: string;
        title: string;
        status: string;
        productType: string | null;
        featuredImage: { url: string } | null;
        variants: {
          edges: {
            node: {
              id: string;
              title: string;
              sku: string | null;
              price: string | null;
              inventoryQuantity: number | null;
            };
          }[];
        };
      };
    }[];
  };
};

// 分頁讀取全部產品（每頁 100 件；上限 10 頁），店內產品已超過 100 件
const QUERY = `query InventoryProducts($after: String) {
  products(first: 100, after: $after, sortKey: TITLE) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id title status productType
      featuredImage { url }
      variants(first: 25) { edges { node { id title sku price inventoryQuantity } } }
    } }
  }
}`;

type Product = Group["products"][number];
type ShopifyProduct = ProductsResp["products"]["edges"][number]["node"];

const MAX_PAGES = 10;

export default async function InventoryPage() {
  const products: ShopifyProduct[] = [];
  let err = "";
  try {
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data: ProductsResp = await shopifyGraphQL<ProductsResp>(QUERY, { after });
      products.push(...data.products.edges.map((e) => e.node));
      if (!data.products.pageInfo.hasNextPage) break;
      after = data.products.pageInfo.endCursor;
    }
  } catch (e) {
    err = String(e);
  }

  const byType = new Map<string, Product[]>();
  for (const p of products) {
    const type = (p.productType || "").trim() || "未分類";
    const prod: Product = {
      id: p.id,
      title: p.title,
      status: p.status,
      image: p.featuredImage?.url ?? null,
      variants: p.variants.edges.map((v) => ({
        title: v.node.title,
        sku: v.node.sku,
        price: v.node.price,
        qty: v.node.inventoryQuantity,
      })),
    };
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type)!.push(prod);
  }
  const groups: Group[] = [...byType.entries()]
    .map(([type, ps]) => ({ type, products: ps }))
    .sort((a, b) => a.type.localeCompare(b.type, "zh-Hant"));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">倉存 · 出貨</h1>

      {err && (
        <div className="rounded-2xl border border-red-300 bg-[var(--card)] p-6 text-sm text-red-600">
          讀取 Shopify 失敗：{err}
        </div>
      )}

      {!err && groups.length === 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無產品。
        </div>
      )}

      {groups.length > 0 && <InventoryList groups={groups} />}
    </div>
  );
}
