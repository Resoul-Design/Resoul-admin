import { shopifyGraphQL } from "@/lib/shopify";
import { InventoryEditor, type EGroup, type EProduct } from "./_editor";

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
              inventoryItem: { id: string } | null;
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
      variants(first: 25) { edges { node { id title sku price inventoryQuantity inventoryItem { id } } } }
    } }
  }
}`;

export default async function InventoryPage() {
  let data: ProductsResp | null = null;
  let err = "";
  try {
    data = await shopifyGraphQL<ProductsResp>(QUERY);
  } catch (e) {
    err = String(e);
  }

  const products = data?.products.edges.map((e) => e.node) ?? [];

  // 依產品類型分組
  const byType = new Map<string, EProduct[]>();
  for (const p of products) {
    const type = (p.productType || "").trim() || "未分類";
    const ep: EProduct = {
      id: p.id,
      title: p.title,
      status: p.status,
      productType: type,
      image: p.featuredImage?.url ?? null,
      variants: p.variants.edges.map((v) => ({
        id: v.node.id,
        inventoryItemId: v.node.inventoryItem?.id ?? null,
        title: v.node.title,
        sku: v.node.sku,
        price: v.node.price,
        qty: v.node.inventoryQuantity,
      })),
    };
    (byType.get(type) || byType.set(type, []).get(type)!).push(ep);
  }
  const groups: EGroup[] = [...byType.entries()]
    .map(([type, ps]) => ({ type, products: ps }))
    .sort((a, b) => a.type.localeCompare(b.type, "zh-Hant"));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">倉存 · 出貨</h1>
      <p className="text-sm text-[var(--soft)] mb-6">
        按產品類型分組；可直接修改售價與庫存，儲存後即同步至 Shopify。
      </p>

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

      {groups.length > 0 && <InventoryEditor groups={groups} />}
    </div>
  );
}
