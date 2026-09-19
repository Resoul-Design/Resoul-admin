import { createClient } from "@/lib/supabase/server";
import type { ProductOrderRow } from "@/lib/product-orders";
import { syncProductOrders } from "./actions";

export const dynamic = "force-dynamic";

const FIN: Record<string, string> = {
  PAID: "已付款", PENDING: "待付款", PARTIALLY_PAID: "部分付款",
  REFUNDED: "已退款", PARTIALLY_REFUNDED: "部分退款", VOIDED: "已作廢",
};
const FUL: Record<string, string> = {
  FULFILLED: "已出貨", UNFULFILLED: "未出貨",
  PARTIALLY_FULFILLED: "部分出貨", RESTOCKED: "已退貨入庫",
};

export default async function OrdersPage({ searchParams }: {
  searchParams: Promise<{ synced?: string; sync_error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_orders").select("*")
    .order("shopify_created_at", { ascending: false }).limit(500);
  const orders = (data || []) as ProductOrderRow[];
  const itemsText = (order: ProductOrderRow) =>
    (order.line_items || []).map((item) => `${item.title}×${item.quantity}`).join("、") || "—";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">客戶訂單</h1>
          <p className="mt-1 text-sm text-[var(--soft)]">產品訂單由 Shopify 同步並儲存於 Supabase。</p>
        </div>
        <form action={syncProductOrders}>
          <button className="rounded-lg bg-[var(--gold)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            同步 Shopify 訂單
          </button>
        </form>
      </div>

      {params.synced && <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">已同步 {params.synced} 張產品訂單到 Supabase。</div>}
      {params.sync_error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">同步失敗：{params.sync_error}</div>}
      {error && <div className="rounded-lg border border-red-300 bg-[var(--card)] p-6 text-sm text-red-600">讀取 Supabase 失敗：{error.message}<div className="mt-2 text-[var(--soft)]">請先執行 db/migration_product_orders.sql。</div></div>}
      {!error && orders.length === 0 && <div className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">暫無產品訂單。請按「同步 Shopify 訂單」匯入舊記錄。</div>}

      {orders.length > 0 && (
        <div className="hidden overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--card)] md:block">
          <table className="w-full table-fixed text-sm">
            <thead><tr className="bg-[var(--head)] text-left text-[var(--soft)]">
              <th className="w-[9%] px-4 py-3 font-medium">訂單</th><th className="w-[11%] px-4 py-3 font-medium">日期</th>
              <th className="w-[14%] px-4 py-3 font-medium">客戶</th><th className="px-4 py-3 font-medium">內容</th>
              <th className="w-[9%] px-4 py-3 font-medium">付款</th><th className="w-[9%] px-4 py-3 font-medium">出貨</th>
              <th className="w-[13%] px-4 py-3 text-right font-medium">金額</th><th className="w-[8%] px-4 py-3 text-right font-medium">文件</th>
            </tr></thead>
            <tbody>{orders.map((order) => (
              <tr key={order.shopify_order_id} className="border-t border-[var(--line)] align-top">
                <td className="px-4 py-3 font-medium">{order.order_name}</td>
                <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{order.shopify_created_at.slice(0, 10)}</td>
                <td className="break-words px-4 py-3">{order.customer_name || "—"}</td>
                <td className="break-words px-4 py-3 text-[var(--soft)]">{itemsText(order)}</td>
                <td className="px-4 py-3">{FIN[order.financial_status || ""] || order.financial_status || "—"}</td>
                <td className="px-4 py-3">{FUL[order.fulfillment_status || ""] || order.fulfillment_status || "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">${Number(order.total_amount).toLocaleString()} {order.currency}</td>
                <td className="px-4 py-3 text-right"><a href={`/print/order/${order.shopify_order_id.split("/").pop()}`} target="_blank" className="text-xs text-[var(--gold)] hover:underline">發票</a></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {orders.length > 0 && <div className="space-y-3 md:hidden">{orders.map((order) => (
        <div key={order.shopify_order_id} className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between gap-2"><span className="font-medium">{order.order_name}</span><span className="text-xs text-[var(--soft)]">{order.shopify_created_at.slice(0, 10)}</span></div>
          <div className="mt-1 text-sm">{order.customer_name || "—"}</div><div className="mt-1 break-words text-sm text-[var(--soft)]">{itemsText(order)}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-[var(--cream)] px-2 py-0.5 text-[var(--soft)]">{FIN[order.financial_status || ""] || order.financial_status || "—"}</span>
            <span className="rounded-full bg-[var(--cream)] px-2 py-0.5 text-[var(--soft)]">{FUL[order.fulfillment_status || ""] || order.fulfillment_status || "—"}</span>
            <span className="ml-auto font-medium">${Number(order.total_amount).toLocaleString()} {order.currency}</span>
          </div>
        </div>
      ))}</div>}
    </div>
  );
}
