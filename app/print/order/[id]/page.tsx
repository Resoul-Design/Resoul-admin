import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { shopifyGraphQL } from "@/lib/shopify";
import { COMPANY } from "@/lib/company";
import { PrintButton } from "../../_print-button";

export const dynamic = "force-dynamic";

const money = (n: number) => "$" + Math.round(n).toLocaleString();

type OrderResp = {
  order: {
    name: string;
    createdAt: string;
    customer: { displayName: string | null; email: string | null } | null;
    lineItems: {
      edges: {
        node: {
          title: string;
          quantity: number;
          originalUnitPriceSet: { shopMoney: { amount: string } };
        };
      }[];
    };
    currentSubtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
    totalTaxSet: { shopMoney: { amount: string } } | null;
    totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  } | null;
};

export default async function OrderDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await getStaff())) redirect("/login");
  const { id } = await params;
  const gid = `gid://shopify/Order/${id}`;

  let data: OrderResp | null = null;
  let err = "";
  try {
    data = await shopifyGraphQL<OrderResp>(
      `{ order(id: "${gid}") {
        name createdAt
        customer { displayName email }
        lineItems(first: 100) { edges { node { title quantity originalUnitPriceSet { shopMoney { amount } } } } }
        currentSubtotalPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount } }
        totalPriceSet { shopMoney { amount currencyCode } }
      } }`
    );
  } catch (e) {
    err = String(e);
  }

  if (err) return <div className="p-10 text-center text-red-600">讀取 Shopify 失敗：{err}</div>;
  const o = data?.order;
  if (!o) return <div className="p-10 text-center text-[var(--soft)]">找不到此訂單。</div>;

  const items = o.lineItems.edges.map((e) => e.node);
  const subtotal = Number(o.currentSubtotalPriceSet?.shopMoney.amount || 0);
  const tax = Number(o.totalTaxSet?.shopMoney.amount || 0);
  const total = Number(o.totalPriceSet.shopMoney.amount || 0);
  const today = new Date(o.createdAt).toLocaleDateString("zh-HK", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-white text-[var(--ink)] py-10 px-4 flex justify-center">
      <style>{`
        @media print { .no-print{display:none!important} html,body{background:#fff!important} }
        @page { margin: 16mm; }
      `}</style>
      <PrintButton />

      <div className="w-full max-w-[720px]">
        <div className="flex items-start justify-between border-b-2 border-[var(--gold)] pb-4 mb-6">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/resoul-wordmark.png" alt={COMPANY.name} className="h-11 w-auto" />
            <div className="brand-slogan text-sm text-[var(--soft)] mt-1">{COMPANY.tagline}</div>
          </div>
          <div className="text-right text-xs text-[var(--soft)] leading-relaxed">
            <div>{COMPANY.address}</div>
            <div>電話：{COMPANY.tel}</div>
            <div>電郵：{COMPANY.email}</div>
            {COMPANY.br && <div>商業登記：{COMPANY.br}</div>}
          </div>
        </div>

        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-2xl font-semibold">發票</div>
            <div className="text-xs text-[var(--soft)] tracking-widest">INVOICE</div>
          </div>
          <div className="text-right text-sm">
            <div>訂單：<span className="font-medium">{o.name}</span></div>
            <div className="text-[var(--soft)]">日期：{today}</div>
          </div>
        </div>

        <div className="mb-6 text-sm">
          <div className="text-xs text-[var(--soft)] mb-1">客戶</div>
          <div className="font-medium">{o.customer?.displayName || "—"}</div>
          {o.customer?.email && <div className="text-[var(--soft)]">{o.customer.email}</div>}
        </div>

        <table className="w-full text-sm mb-4 border border-[var(--line)]">
          <thead>
            <tr className="bg-[var(--head)] text-left">
              <th className="px-3 py-2 font-medium">產品</th>
              <th className="px-3 py-2 font-medium text-center w-16">數量</th>
              <th className="px-3 py-2 font-medium text-right w-28">單價</th>
              <th className="px-3 py-2 font-medium text-right w-28">金額</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const unit = Number(it.originalUnitPriceSet.shopMoney.amount);
              return (
                <tr key={i} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">{it.title}</td>
                  <td className="px-3 py-2 text-center">{it.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(unit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(unit * it.quantity)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--line)]">
              <td colSpan={3} className="px-3 py-1.5 text-right text-[var(--soft)]">小計</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(subtotal)}</td>
            </tr>
            {tax > 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-1.5 text-right text-[var(--soft)]">稅項</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money(tax)}</td>
              </tr>
            )}
            <tr className="border-t-2 border-[var(--gold)] bg-[var(--cream)]/40">
              <td colSpan={3} className="px-3 py-2 text-right font-medium">總計（{o.totalPriceSet.shopMoney.currencyCode}）</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="text-xs text-[var(--soft)] leading-relaxed border-t border-[var(--line)] pt-4 mt-8">
          <p>多謝惠顧。付款以 Shopify 結帳記錄為準。</p>
        </div>
      </div>
    </div>
  );
}
