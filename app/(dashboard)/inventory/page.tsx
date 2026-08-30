import { shopifyGraphQL } from "@/lib/shopify";

export const dynamic = "force-dynamic";

type ProductsResp = {
  products: {
    edges: {
      node: {
        id: string;
        title: string;
        status: string;
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
      id title status
      variants(first: 20) { edges { node { title sku price inventoryQuantity } } }
    } }
  }
}`;

const STATUS: Record<string, string> = {
  ACTIVE: "上架中",
  DRAFT: "草稿",
  ARCHIVED: "已封存",
};

type Row = {
  product: string;
  status: string;
  variant: string;
  sku: string | null;
  price: string | null;
  qty: number | null;
  first: boolean;
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
  const rows: Row[] = [];
  for (const p of products) {
    const variants = p.variants.edges.map((v) => v.node);
    variants.forEach((v, i) => {
      rows.push({
        product: p.title,
        status: p.status,
        variant: v.title === "Default Title" ? "—" : v.title,
        sku: v.sku,
        price: v.price,
        qty: v.inventoryQuantity,
        first: i === 0,
      });
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">倉存 · 出貨</h1>

      {err && (
        <div className="rounded-2xl border border-red-300 bg-[var(--card)] p-6 text-sm text-red-600">
          讀取 Shopify 失敗：{err}
        </div>
      )}

      {!err && rows.length === 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無產品。
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium">產品</th>
                <th className="px-4 py-3 font-medium">款式</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium text-right">售價</th>
                <th className="px-4 py-3 font-medium text-right">庫存</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const low = (r.qty ?? 0) <= 3;
                return (
                  <tr
                    key={i}
                    className={
                      "border-t align-top " +
                      (r.first ? "border-[var(--line)]" : "border-[var(--line)]/40")
                    }
                  >
                    <td className="px-4 py-3">
                      {r.first ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{r.product}</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                            {STATUS[r.status] || r.status}
                          </span>
                        </div>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--soft)]">{r.variant}</td>
                    <td className="px-4 py-3 text-[var(--soft)]">{r.sku || "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.price ? "$" + Number(r.price).toLocaleString() : "—"}
                    </td>
                    <td
                      className={
                        "px-4 py-3 text-right tabular-nums " +
                        (low ? "text-red-600 font-medium" : "")
                      }
                    >
                      {r.qty ?? "—"}
                      {low && " ⚠"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
