import { createClient } from "@/lib/supabase/server";
import type { ProductOrderRow } from "@/lib/product-orders";
import { shopDomain } from "@/lib/shopify";
import { canonicalProjectNo } from "@/lib/order-label";
import { getStaff } from "@/lib/auth";
import { shopifyGraphQL } from "@/lib/shopify";
import { syncProductOrders } from "./actions";
import { OrdersTable, type OrderRow } from "./_table";
import { NewSouvenirOrder, type DraftCatalogProduct } from "./_new-order";

export const dynamic = "force-dynamic";

const FIN: Record<string, string> = {
  PAID: "已付款", PENDING: "待付款", PARTIALLY_PAID: "部分付款",
  REFUNDED: "已退款", PARTIALLY_REFUNDED: "部分退款", VOIDED: "已作廢",
};
const FUL: Record<string, string> = {
  FULFILLED: "已出貨", UNFULFILLED: "未出貨",
  PARTIALLY_FULFILLED: "部分出貨", RESTOCKED: "已退貨入庫",
};

type CatalogResponse = {
  products: {
    edges: {
      node: {
        id: string;
        title: string;
        variants: {
          edges: {
            node: { id: string; title: string; sku: string | null; price: string | null };
          }[];
        };
      };
    }[];
  };
};

const CATALOG_QUERY = `query SouvenirCatalog {
  products(first: 50, sortKey: TITLE, query: "status:active") {
    edges { node {
      id title
      variants(first: 20) { edges { node { id title sku price } } }
    } }
  }
}`;

export default async function OrdersPage({ searchParams }: {
  searchParams: Promise<{ synced?: string; sync_error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const staff = await getStaff();
  const { data, error } = await supabase
    .from("product_orders").select("*")
    .order("shopify_created_at", { ascending: false }).limit(2000);
  const orders = (data || []) as ProductOrderRow[];

  let products: DraftCatalogProduct[] = [];
  let catalogError = "";
  if (staff?.role === "admin") {
    try {
      const catalog = await shopifyGraphQL<CatalogResponse>(CATALOG_QUERY);
      products = catalog.products.edges.map(({ node }) => ({
        id: node.id,
        title: node.title,
        variants: node.variants.edges.map(({ node: variant }) => variant),
      })).filter((product) => product.variants.length > 0);
      if (!products.length) catalogError = "Shopify 暫無可加入的上架產品。";
    } catch (catalogFailure) {
      console.error("[souvenir_catalog]", catalogFailure instanceof Error ? catalogFailure.message : "unknown error");
      catalogError = "未能讀取 Shopify 產品。請確認 Shopify 連線和 read_products 權限。";
    }
  }

  const orderId = (o: ProductOrderRow) => o.shopify_order_id.split("/").pop() || "";
  const rows: OrderRow[] = orders.map((o) => {
    const phone = (o.phone || "").replace(/\D/g, "");
    // 專案編號＝Shopify 訂單名（#RESOUL-####）；產品訂單的訂單號本身就是專案編號。
    const attrProject = (o.line_items || []).flatMap((item) => item.attributes || []).find((a) => /project|專案/i.test(a.key))?.value || "";
    const projectNo = canonicalProjectNo(o.order_name, attrProject);
    const wa = phone ? `https://wa.me/${phone.startsWith("852") ? phone : `852${phone}`}?text=${encodeURIComponent(`你好 ${o.customer_name || ""}，關於你的 Resoul 訂單 ${o.order_name}：`)}` : null;
    return {
      id: o.shopify_order_id,
      orderName: o.order_name,
      projectNo,
      date: o.shopify_created_at.slice(0, 10),
      customer: o.customer_name || "",
      phone: o.phone || "",
      items: (o.line_items || []).map((it) => `${it.title}×${it.quantity}`).join("、") || "—",
      fin: o.financial_status || "",
      finLabel: FIN[o.financial_status || ""] || o.financial_status || "—",
      fulLabel: FUL[o.fulfillment_status || ""] || o.fulfillment_status || "—",
      amount: Number(o.total_amount),
      currency: o.currency,
      cancelled: !!o.cancelled_at,
      printHref: `/print/order/${orderId(o)}`,
      whatsapp: wa,
      editUrl: `https://${shopDomain()}/admin/orders/${orderId(o)}`,
    };
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">紀念品訂單</h1>
          <p className="mt-1 text-sm text-[var(--soft)]">產品訂單由 Shopify 同步並儲存於 Supabase。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {staff?.role === "admin" && <NewSouvenirOrder products={products} catalogError={catalogError} />}
          <form action={syncProductOrders}>
            <button className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm hover:bg-[var(--cream)]">
              同步 Shopify 訂單
            </button>
          </form>
        </div>
      </div>

      {params.synced && <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">已同步 {params.synced} 張產品訂單到 Supabase。</div>}
      {params.sync_error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">同步失敗：{params.sync_error}</div>}
      {error && <div className="rounded-lg border border-red-300 bg-[var(--card)] p-6 text-sm text-red-600">讀取 Supabase 失敗：{error.message}<div className="mt-2 text-[var(--soft)]">請先執行 db/migration_product_orders.sql。</div></div>}
      {!error && orders.length === 0 && <div className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">暫無產品訂單。請按「同步 Shopify 訂單」匯入舊記錄。</div>}

      {orders.length > 0 && <OrdersTable rows={rows} />}
    </div>
  );
}
