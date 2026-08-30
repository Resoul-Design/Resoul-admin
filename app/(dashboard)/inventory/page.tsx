import { shopifyGraphQL } from "@/lib/shopify";

export const dynamic = "force-dynamic";

type ProductsResp = {
  products: {
    edges: {
      node: {
        id: string;
        title: string;
        status: string;
        totalInventory: number | null;
        variants: {
          edges: {
            node: {
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
  products(first: 50, sortKey: TITLE) {
    edges { node {
      id title status totalInventory
      variants(first: 20) { edges { node { title sku price inventoryQuantity } } }
    } }
  }
}`;

const STATUS: Record<string, string> = {
  ACTIVE: "上架中",
  DRAFT: "草稿",
  ARCHIVED: "已封存",
};

export default async function InventoryPage() {
  let data: ProductsResp | null = null;
  let err = "";
  try {
    data = await shopifyGraphQL<ProductsResp>(QUERY);
  } catch (e) {
    err = String(e);
  }

  const products = data?.products.edges.map((e) => e.node) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">倉存 · 出貨</h1>
      <p className="text-sm text-[var(--soft)] mb-6">
        來自 Shopify 產品與庫存，即時讀取（共 {products.length} 件產品）
      </p>

      {err && (
        <div className="rounded-2xl border border-red-300 bg-[var(--card)] p-6 text-sm text-red-600">
          讀取 Shopify 失敗：{err}
        </div>
      )}

      {!err && products.length === 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無產品。
        </div>
      )}

      {products.length > 0 && (
        <div className="space-y-4">
          {products.map((p) => {
            const variants = p.variants.edges.map((v) => v.node);
            const low = (p.totalInventory ?? 0) <= 3;
            return (
              <div
                key={p.id}
                className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--head)] text-[var(--soft)]">
                    {STATUS[p.status] || p.status}
                  </span>
                  <span
                    className={
                      "ml-auto text-sm " +
                      (low ? "text-red-600 font-medium" : "text-[var(--soft)]")
                    }
                  >
                    總庫存：{p.totalInventory ?? "—"}
                    {low && " ⚠ 偏低"}
                  </span>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--soft)] border-b border-[var(--line)]">
                      <th className="py-2 font-medium">款式</th>
                      <th className="py-2 font-medium">SKU</th>
                      <th className="py-2 font-medium text-right">售價</th>
                      <th className="py-2 font-medium text-right">庫存</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v, i) => (
                      <tr key={i} className="border-b border-[var(--line)] last:border-0">
                        <td className="py-2">{v.title}</td>
                        <td className="py-2 text-[var(--soft)]">{v.sku || "—"}</td>
                        <td className="py-2 text-right">
                          {v.price ? "$" + Number(v.price).toLocaleString() : "—"}
                        </td>
                        <td
                          className={
                            "py-2 text-right " +
                            ((v.inventoryQuantity ?? 0) <= 3 ? "text-red-600" : "")
                          }
                        >
                          {v.inventoryQuantity ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
