import { createClient } from "@/lib/supabase/server";
import type { ProductOrderRow } from "@/lib/product-orders";
import { shopDomain } from "@/lib/shopify";
import { orderLabel } from "@/lib/order-label";
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
  const orderId = (order: ProductOrderRow) => order.shopify_order_id.split("/").pop() || "";
  const whatsappUrl = (order: ProductOrderRow) => {
    const phone = (order.phone || "").replace(/\D/g, "");
    return phone ? `https://wa.me/${phone.startsWith("852") ? phone : `852${phone}`}?text=${encodeURIComponent(`你好 ${order.customer_name || ""}，關於你的 Resoul 訂單 ${order.order_name}：`)}` : null;
  };
  const editUrl = (order: ProductOrderRow) => `https://${shopDomain()}/admin/orders/${orderId(order)}`;

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
              <th className="w-[11%] px-4 py-3 text-right font-medium">金額</th><th className="w-[26%] px-4 py-3 text-right font-medium">操作</th>
            </tr></thead>
            <tbody>{orders.map((order) => (
              <tr key={order.shopify_order_id} className="border-t border-[var(--line)] align-top">
                <td className="px-4 py-3 font-medium">{orderLabel(order.order_name, "product")}</td>
                <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{order.shopify_created_at.slice(0, 10)}</td>
                <td className="break-words px-4 py-3">{order.customer_name || "—"}</td>
                <td className="break-words px-4 py-3 text-[var(--soft)]">{itemsText(order)}</td>
                <td className="px-4 py-3">{FIN[order.financial_status || ""] || order.financial_status || "—"}</td>
                <td className="px-4 py-3">{FUL[order.fulfillment_status || ""] || order.fulfillment_status || "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">${Number(order.total_amount).toLocaleString()} {order.currency}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-2">
                  <a href={`/print/order/${orderId(order)}`} target="_blank" className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--gold)] hover:bg-[var(--cream)]">收據</a>
                  {whatsappUrl(order) && <a href={whatsappUrl(order)!} target="_blank" rel="noopener noreferrer" className="rounded-md border border-green-300 px-2.5 py-1.5 text-xs text-green-700 hover:bg-green-50">WhatsApp 客人</a>}
                  <a href={editUrl(order)} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--line)] px-2.5 py-1.5 text-xs text-[var(--ink)] hover:bg-[var(--cream)]">編輯</a>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {orders.length > 0 && <div className="space-y-3 md:hidden">{orders.map((order) => (
        <div key={order.shopify_order_id} className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between gap-2"><span className="font-medium">{orderLabel(order.order_name, "product")}</span><span className="text-xs text-[var(--soft)]">{order.shopify_created_at.slice(0, 10)}</span></div>
          <div className="mt-1 text-sm">{order.customer_name || "—"}</div><div className="mt-1 break-words text-sm text-[var(--soft)]">{itemsText(order)}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-[var(--cream)] px-2 py-0.5 text-[var(--soft)]">{FIN[order.financial_status || ""] || order.financial_status || "—"}</span>
            <span className="rounded-full bg-[var(--cream)] px-2 py-0.5 text-[var(--soft)]">{FUL[order.fulfillment_status || ""] || order.fulfillment_status || "—"}</span>
            <span className="ml-auto font-medium">${Number(order.total_amount).toLocaleString()} {order.currency}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
            <a href={`/print/order/${orderId(order)}`} target="_blank" className="rounded-md border border-[var(--line)] px-3 py-2 text-xs text-[var(--gold)]">收據</a>
            {whatsappUrl(order) && <a href={whatsappUrl(order)!} target="_blank" rel="noopener noreferrer" className="rounded-md border border-green-300 px-3 py-2 text-xs text-green-700">WhatsApp 客人</a>}
            <a href={editUrl(order)} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--line)] px-3 py-2 text-xs">編輯</a>
          </div>
        </div>
      ))}</div>}
    </div>
  );
}
