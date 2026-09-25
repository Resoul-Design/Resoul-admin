import { shopifyGraphQL } from "@/lib/shopify";
import { InventoryList, type Group } from "./_list";

export const dynamic = "force-dynamic";

type ProductsResp = {
  products: {
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

const QUERY = `{
  products(first: 100, sortKey: TITLE) {
    edges { node {
      id title status productType
      featuredImage { url }
      variants(first: 25) { edges { node { id title sku price inventoryQuantity } } }
    } }
  }
}`;

type Product = Group["products"][number];

export default async function InventoryPage() {
  let data: ProductsResp | null = null;
  let err = "";
  try {
    data = await shopifyGraphQL<ProductsResp>(QUERY);
  } catch (e) {
    err = String(e);
  }

  const products = data?.products.edges.map((e) => e.node) ?? [];

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
