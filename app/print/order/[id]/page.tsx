import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { shopifyGraphQL } from "@/lib/shopify";
import { COMPANY } from "@/lib/company";
import { PrintButton } from "../../_print-button";

export const dynamic = "force-dynamic";

const money = (n: number) => "HK$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type OrderResp = {
  order: {
    name: string;
    createdAt: string;
    customer: { displayName: string | null; email: string | null; phone: string | null } | null;
    lineItems: {
      edges: {
        node: {
          title: string;
          quantity: number;
          sku: string | null;
          originalUnitPriceSet: { shopMoney: { amount: string } };
        };
      }[];
    };
    currentSubtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
    totalDiscountsSet: { shopMoney: { amount: string } } | null;
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
        customer { displayName email phone }
        lineItems(first: 100) { edges { node { title quantity sku originalUnitPriceSet { shopMoney { amount } } } } }
        currentSubtotalPriceSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount } }
        totalPriceSet { shopMoney { amount currencyCode } }
      } }`
    );
  } catch (e) {
    err = String(e);
  }

  if (err) return <div className="p-10 text-center text-red-600">讀取 Shopify 失敗：{err}</div>;
  const o = data?.order;
  if (!o) return <div className="p-10 text-center text-[#6f6156]">找不到此訂單。</div>;

  const items = o.lineItems.edges.map((e) => e.node);
  const subtotal = Number(o.currentSubtotalPriceSet?.shopMoney.amount || 0);
  const discount = Number(o.totalDiscountsSet?.shopMoney.amount || 0);
  const total = Number(o.totalPriceSet.shopMoney.amount || 0);
  const today = new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-white text-[#3b2f27] py-8 px-4 flex justify-center">
      <style>{`
        @media print { .no-print{display:none!important} html,body{background:#fff!important} }
        @page { margin: 10mm; }
      `}</style>
      <PrintButton />

      <div className="w-full max-w-[820px] border border-[#cfc4b0] p-2">
        <div className="border border-[#e6dccb] px-8 py-8">
          <div className="flex items-start justify-between mb-8">
            <div className="border border-[#cfc4b0] rounded-2xl px-6 py-3">
              <div className="text-3xl tracking-[0.15em] text-[#6f6156]" style={{ fontFamily: "'Noto Serif TC',serif" }}>INVOICE</div>
            </div>
            <div className="text-right">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/resoul-wordmark.png" alt={COMPANY.name} className="h-12 w-auto inline-block" />
              <div className="brand-slogan text-xs text-[#6f6156] mt-1">{COMPANY.tagline}</div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-6 mb-8">
            <div className="border border-[#cfc4b0] rounded-2xl px-5 py-4 text-sm min-w-[320px]">
              <div className="grid grid-cols-[92px_1fr] gap-y-1">
                <span className="text-[#6f6156]">Issued to:</span>
                <span>{o.customer?.displayName || "—"}</span>
                <span className="text-[#6f6156]">Email:</span>
                <span>{o.customer?.email || "—"}</span>
                <span className="text-[#6f6156]">Phone number:</span>
                <span>{o.customer?.phone || "—"}</span>
              </div>
            </div>
            <div className="text-sm text-right whitespace-nowrap pt-2">
              <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 justify-end">
                <span className="text-[#6f6156]">Invoice No.:</span>
                <span className="font-medium">{o.name}</span>
                <span className="text-[#6f6156]">Date:</span>
                <span>{today}</span>
              </div>
            </div>
          </div>

          <table className="w-full text-sm mb-2">
            <thead>
              <tr className="text-left text-[#6f6156] tracking-wide">
                <th className="py-2 font-medium w-24">ITEM CODE</th>
                <th className="py-2 font-medium">DESCRIPTION</th>
                <th className="py-2 font-medium text-right w-28">UNIT PRICE</th>
                <th className="py-2 font-medium text-center w-14">QTY</th>
                <th className="py-2 font-medium text-right w-28">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const unit = Number(it.originalUnitPriceSet.shopMoney.amount);
                return (
                  <tr key={i}>
                    <td className="py-2.5 align-top">{it.sku || ""}</td>
                    <td className="py-2.5 align-top">{it.title}</td>
                    <td className="py-2.5 align-top text-right tabular-nums">{money(unit)}</td>
                    <td className="py-2.5 align-top text-center tabular-nums">{it.quantity}</td>
                    <td className="py-2.5 align-top text-right tabular-nums">{money(unit * it.quantity)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-start justify-between gap-8 mt-16">
            <div className="text-sm max-w-[46%]">
              <div className="text-[#6f6156] tracking-wide mb-1">REMARKS</div>
              <div className="whitespace-pre-wrap"></div>
            </div>
            <div className="text-sm w-[280px]">
              <div className="flex justify-between py-1">
                <span className="text-[#6f6156]">SUBTOTAL</span>
                <span className="tabular-nums">{money(subtotal)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#6f6156]">DISCOUNT</span>
                <span className="tabular-nums">{money(discount)}</span>
              </div>
              <div className="flex justify-between py-1.5 mt-1 border-t border-[#cfc4b0] font-semibold">
                <span>TOTAL（{o.totalPriceSet.shopMoney.currencyCode}）</span>
                <span className="tabular-nums">{money(total)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-10">
            <div className="text-right">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/resoul-wordmark.png" alt={COMPANY.name} className="h-8 w-auto inline-block opacity-80" />
              <div className="text-xs tracking-[0.25em] text-[#6f6156] mt-1">THANK YOU</div>
            </div>
          </div>

          <div className="text-center text-xs text-[#6f6156] mt-8 leading-relaxed">
            <p>{COMPANY.footer}</p>
            <p className="mt-1">{COMPANY.web} | {COMPANY.ig} | {COMPANY.tel} | {COMPANY.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
