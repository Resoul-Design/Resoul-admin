import { shopifyGraphQL } from "@/lib/shopify";

export const dynamic = "force-dynamic";

type OrdersResp = {
  orders: {
    edges: {
      node: {
        id: string;
        name: string;
        createdAt: string;
        displayFinancialStatus: string | null;
        displayFulfillmentStatus: string | null;
        totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
        customer: { displayName: string | null } | null;
        lineItems: { edges: { node: { title: string; quantity: number } }[] };
      };
    }[];
  };
};

const QUERY = `{
  orders(first: 50, sortKey: CREATED_AT, reverse: true) {
    edges { node {
      id name createdAt displayFinancialStatus displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { displayName }
      lineItems(first: 5) { edges { node { title quantity } } }
    } }
  }
}`;

const FIN: Record<string, string> = {
  PAID: "已付款",
  PENDING: "待付款",
  REFUNDED: "已退款",
  PARTIALLY_REFUNDED: "部分退款",
  VOIDED: "已作廢",
};
const FUL: Record<string, string> = {
  FULFILLED: "已出貨",
  UNFULFILLED: "未出貨",
  PARTIALLY_FULFILLED: "部分出貨",
  RESTOCKED: "已退貨入庫",
};

export default async function OrdersPage() {
  let data: OrdersResp | null = null;
  let err = "";
  try {
    data = await shopifyGraphQL<OrdersResp>(QUERY);
  } catch (e) {
    err = String(e);
  }

  const orders = data?.orders.edges.map((e) => e.node) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">客戶訂單</h1>
      <p className="text-sm text-[var(--soft)] mb-6">
        來自 Shopify，即時讀取（共 {orders.length} 筆）
      </p>

      {err && (
        <div className="rounded-2xl border border-red-300 bg-[var(--card)] p-6 text-sm text-red-600">
          讀取 Shopify 失敗：{err}
          <div className="text-[var(--soft)] mt-2">
            請確認 Vercel／.env.local 已設定 SHOPIFY_ADMIN_API_TOKEN。
          </div>
        </div>
      )}

      {!err && orders.length === 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無訂單。商店有新訂單時會即時顯示於此。
        </div>
      )}

      {orders.length > 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium">訂單</th>
                <th className="px-4 py-3 font-medium">日期</th>
                <th className="px-4 py-3 font-medium">客戶</th>
                <th className="px-4 py-3 font-medium">內容</th>
                <th className="px-4 py-3 font-medium">付款</th>
                <th className="px-4 py-3 font-medium">出貨</th>
                <th className="px-4 py-3 font-medium text-right">金額</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{o.name}</td>
                  <td className="px-4 py-3 text-[var(--soft)] whitespace-nowrap">
                    {o.createdAt?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3">{o.customer?.displayName || "—"}</td>
                  <td className="px-4 py-3 text-[var(--soft)]">
                    {o.lineItems.edges
                      .map((l) => `${l.node.title}×${l.node.quantity}`)
                      .join("、") || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {FIN[o.displayFinancialStatus || ""] ||
                      o.displayFinancialStatus ||
                      "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {FUL[o.displayFulfillmentStatus || ""] ||
                      o.displayFulfillmentStatus ||
                      "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    ${Number(o.totalPriceSet.shopMoney.amount).toLocaleString()}{" "}
                    {o.totalPriceSet.shopMoney.currencyCode}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
