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
      <h1 className="text-2xl font-semibold mb-6">客戶訂單</h1>

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

      {/* 桌面：表格（全闊，不橫向捲動） */}
      {orders.length > 0 && (
        <div className="hidden md:block rounded-2xl border border-[var(--line)] bg-[var(--card)]">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium w-[9%]">訂單</th>
                <th className="px-4 py-3 font-medium w-[11%]">日期</th>
                <th className="px-4 py-3 font-medium w-[14%]">客戶</th>
                <th className="px-4 py-3 font-medium">內容</th>
                <th className="px-4 py-3 font-medium w-[9%]">付款</th>
                <th className="px-4 py-3 font-medium w-[9%]">出貨</th>
                <th className="px-4 py-3 font-medium text-right w-[13%]">金額</th>
                <th className="px-4 py-3 font-medium text-right w-[8%]">文件</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="px-4 py-3 text-[var(--soft)] whitespace-nowrap">
                    {o.createdAt?.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 break-words">{o.customer?.displayName || "—"}</td>
                  <td className="px-4 py-3 text-[var(--soft)] break-words">
                    {o.lineItems.edges
                      .map((l) => `${l.node.title}×${l.node.quantity}`)
                      .join("、") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {FIN[o.displayFinancialStatus || ""] ||
                      o.displayFinancialStatus ||
                      "—"}
                  </td>
                  <td className="px-4 py-3">
                    {FUL[o.displayFulfillmentStatus || ""] ||
                      o.displayFulfillmentStatus ||
                      "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    ${Number(o.totalPriceSet.shopMoney.amount).toLocaleString()}{" "}
                    {o.totalPriceSet.shopMoney.currencyCode}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/print/order/${o.id.split("/").pop()}`}
                      target="_blank"
                      className="text-xs text-[var(--gold)] hover:underline"
                    >
                      發票
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 手機：卡片式（易睇，不橫向捲動） */}
      {orders.length > 0 && (
        <div className="md:hidden space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{o.name}</span>
                <span className="text-[var(--soft)] text-xs">{o.createdAt?.slice(0, 10)}</span>
              </div>
              <div className="mt-1 text-sm">{o.customer?.displayName || "—"}</div>
              <div className="mt-1 text-sm text-[var(--soft)] break-words">
                {o.lineItems.edges
                  .map((l) => `${l.node.title}×${l.node.quantity}`)
                  .join("、") || "—"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                  {FIN[o.displayFinancialStatus || ""] || o.displayFinancialStatus || "—"}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                  {FUL[o.displayFulfillmentStatus || ""] || o.displayFulfillmentStatus || "—"}
                </span>
                <span className="ml-auto font-medium text-[var(--ink)]">
                  ${Number(o.totalPriceSet.shopMoney.amount).toLocaleString()}{" "}
                  {o.totalPriceSet.shopMoney.currencyCode}
                </span>
              </div>
              <div className="mt-2 text-right">
                <a
                  href={`/print/order/${o.id.split("/").pop()}`}
                  target="_blank"
                  className="text-xs text-[var(--gold)] hover:underline"
                >
                  發票 →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
