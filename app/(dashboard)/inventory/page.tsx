import { shopifyGraphQL } from "@/lib/shopify";

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

const STATUS: Record<string, string> = {
  ACTIVE: "上架中",
  DRAFT: "草稿",
  ARCHIVED: "已封存",
};

type Variant = {
  title: string;
  sku: string | null;
  price: string | null;
  qty: number | null;
};
type Product = {
  id: string;
  title: string;
  status: string;
  image: string | null;
  variants: Variant[];
};
type Group = { type: string; products: Product[] };

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
      <h1 className="text-2xl font-semibold mb-1">倉存 · 出貨</h1>
      <p className="text-sm text-[var(--soft)] mb-6">按產品類型分組，顯示售價與庫存。</p>

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

      <div className="space-y-8">
        {groups.map((g) => (
          <section key={g.type}>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <span className="text-[var(--gold)]">▣</span>
              {g.type}
              <span className="text-xs font-normal text-[var(--soft)]">
                （{g.products.length} 項產品）
              </span>
            </h2>
            <div className="space-y-3">
              {g.products.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4"
                >
                  <div className="flex items-start gap-3">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image}
                        alt={p.title}
                        className="h-16 w-16 rounded-lg object-cover border border-[var(--line)] shrink-0"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-[var(--cream)] shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{p.title}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                          {STATUS[p.status] || p.status}
                        </span>
                      </div>
                      <div className="mt-2 divide-y divide-[var(--line)]/60">
                        {p.variants.map((v, i) => {
                          const low = (v.qty ?? 0) <= 3;
                          return (
                            <div
                              key={i}
                              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm"
                            >
                              <div className="min-w-[120px] flex-1">
                                <span>
                                  {v.title === "Default Title" ? "預設款式" : v.title}
                                </span>
                                <span className="text-xs text-[var(--soft)] ml-2">
                                  SKU：{v.sku || "—"}
                                </span>
                              </div>
                              <div className="text-[var(--soft)]">
                                售價：
                                <span className="text-[var(--ink)]">
                                  {v.price ? "$" + Number(v.price).toLocaleString() : "—"}
                                </span>
                              </div>
                              <div className={low ? "text-red-600 font-medium" : "text-[var(--soft)]"}>
                                庫存：
                                <span className="tabular-nums">{v.qty ?? "—"}</span>
                                {low && v.qty != null && " ⚠"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
