import { createClient } from "@/lib/supabase/server";
import { shopifyGraphQL } from "@/lib/shopify";
import { getStaff } from "@/lib/auth";
import { updateFinance, updatePlanPrice } from "./actions";

export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
function lastSixMonths() {
  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${d.getMonth() + 1}月` });
  }
  return months;
}

type Booking = {
  id: string;
  case_no: string | null;
  pet_name: string | null;
  owner_name: string | null;
  plan: string | null;
  status: string;
  service_date: string | null;
  amount: number | null;
  cost: number | null;
};
type OrdersResp = {
  orders: { edges: { node: { createdAt: string; totalPriceSet: { shopMoney: { amount: string; currencyCode: string } } } }[] };
};

const money = (n: number) => "$" + Math.round(n).toLocaleString();
const inputCls =
  "w-24 px-2 py-1 rounded-md border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)] text-sm text-right tabular-nums";

export default async function FinancePage() {
  const supabase = await createClient();
  const months = lastSixMonths();
  const since = months[0].key + "-01";
  const curKey = months[5].key;

  const me = await getStaff();
  const isAdmin = me?.role === "admin";
  const [bkRes, shopRes, ppRes] = await Promise.all([
    supabase
      .from("cremation_bookings")
      .select("id, case_no, pet_name, owner_name, plan, status, service_date, amount, cost")
      .order("service_date", { ascending: false, nullsFirst: false })
      .limit(500),
    shopifyGraphQL<OrdersResp>(
      `{ orders(first: 250, query: "created_at:>=${since}") { edges { node { createdAt totalPriceSet { shopMoney { amount currencyCode } } } } } }`
    ).catch((e) => ({ __err: String(e) }) as unknown as OrdersResp),
    supabase.from("plan_prices").select("plan, price, cost"),
  ]);
  const planPrices = (ppRes.data ?? []) as { plan: string; price: number; cost: number }[];
  const PLAN_ORDER = ["風之旅", "雲之旅", "星之旅"];
  const priceRows = PLAN_ORDER.map(
    (p) => planPrices.find((x) => x.plan === p) || { plan: p, price: 0, cost: 0 }
  );

  const bookings = (bkRes.data ?? []) as Booking[];
  const shopErr = (shopRes as unknown as { __err?: string }).__err || "";
  const orders = shopErr ? [] : shopRes.orders.edges.map((e) => e.node);

  const productByMonth: Record<string, number> = {};
  for (const o of orders) {
    const mk = o.createdAt.slice(0, 7);
    productByMonth[mk] = (productByMonth[mk] || 0) + Number(o.totalPriceSet.shopMoney.amount);
  }

  // 火化收支（按 service_date 月份）
  const cremIncomeByMonth: Record<string, number> = {};
  const cremCostByMonth: Record<string, number> = {};
  for (const b of bookings) {
    const mk = (b.service_date || "").slice(0, 7);
    if (!mk) continue;
    cremIncomeByMonth[mk] = (cremIncomeByMonth[mk] || 0) + (b.amount || 0);
    cremCostByMonth[mk] = (cremCostByMonth[mk] || 0) + (b.cost || 0);
  }

  const cremIncomeTotal = bookings.reduce((n, b) => n + (b.amount || 0), 0);
  const cremCostTotal = bookings.reduce((n, b) => n + (b.cost || 0), 0);
  const thisMonthCrem = cremIncomeByMonth[curKey] || 0;
  const thisMonthProduct = productByMonth[curKey] || 0;
  const thisMonthProfit = thisMonthCrem - (cremCostByMonth[curKey] || 0) + thisMonthProduct;

  const cards = [
    { label: "本月火化收入", value: money(thisMonthCrem) },
    { label: "本月產品銷售", value: shopErr ? "—" : money(thisMonthProduct) },
    { label: "火化成本（累計）", value: money(cremCostTotal) },
    { label: "本月毛利（估算）", value: money(thisMonthProfit) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">財務管理</h1>

      {/* 概況卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
            <div className="text-xs text-[var(--soft)] mb-1">{c.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      {/* 方案定價（完成火化時自動填入收入/成本） */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 mb-6">
        <h2 className="text-base mb-1">方案定價</h2>
        <p className="text-xs text-[var(--soft)] mb-3">
          火化完成時，若該筆未手動填收入/成本，會自動套用此定價。
        </p>
        <div className="space-y-2">
          {priceRows.map((r) => (
            <form
              key={r.plan}
              action={updatePlanPrice}
              className="flex items-center gap-2 text-sm flex-wrap"
            >
              <input type="hidden" name="plan" value={r.plan} />
              <span className="w-20 font-medium">{r.plan}</span>
              <label className="flex items-center gap-1 text-[var(--soft)]">
                收入
                <input
                  type="number"
                  step="0.01"
                  name="price"
                  defaultValue={r.price ?? 0}
                  readOnly={!isAdmin}
                  className="w-28 px-2 py-1 rounded-md border border-[var(--line)] bg-white text-right tabular-nums outline-none focus:border-[var(--gold)]"
                />
              </label>
              <label className="flex items-center gap-1 text-[var(--soft)]">
                成本
                <input
                  type="number"
                  step="0.01"
                  name="cost"
                  defaultValue={r.cost ?? 0}
                  readOnly={!isAdmin}
                  className="w-28 px-2 py-1 rounded-md border border-[var(--line)] bg-white text-right tabular-nums outline-none focus:border-[var(--gold)]"
                />
              </label>
              {isAdmin && (
                <button className="text-xs px-3 py-1 rounded-md bg-[var(--gold)] text-white hover:opacity-90">
                  存
                </button>
              )}
            </form>
          ))}
        </div>
      </div>

      {/* 每月收支 */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 mb-6 overflow-x-auto">
        <h2 className="text-base mb-3">近 6 個月收支</h2>
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[var(--soft)] border-b border-[var(--line)]">
              <th className="py-2 pr-3 font-medium">月份</th>
              <th className="py-2 pr-3 font-medium text-right">火化收入</th>
              <th className="py-2 pr-3 font-medium text-right">火化成本</th>
              <th className="py-2 pr-3 font-medium text-right">產品銷售</th>
              <th className="py-2 font-medium text-right">毛利（估算）</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const inc = cremIncomeByMonth[m.key] || 0;
              const cost = cremCostByMonth[m.key] || 0;
              const prod = productByMonth[m.key] || 0;
              const profit = inc - cost + prod;
              return (
                <tr key={m.key} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-2 pr-3">{m.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(inc)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-[var(--soft)]">{money(cost)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{shopErr ? "—" : money(prod)}</td>
                  <td className="py-2 text-right tabular-nums font-medium">{money(profit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 專案收支（可編輯） */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 overflow-x-auto">
        <h2 className="text-base mb-1">專案收支</h2>
        <p className="text-xs text-[var(--soft)] mb-3">
          火化收入 {money(cremIncomeTotal)}　·　成本 {money(cremCostTotal)}　·　毛利 {money(cremIncomeTotal - cremCostTotal)}
        </p>
        {bookings.length === 0 ? (
          <p className="text-sm text-[var(--soft)] py-4 text-center">暫無預約記錄。</p>
        ) : (
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-left text-[var(--soft)] border-b border-[var(--line)]">
                <th className="py-2 pr-3 font-medium">專案編號</th>
                <th className="py-2 pr-3 font-medium">毛孩 / 主人</th>
                <th className="py-2 pr-3 font-medium">方案</th>
                <th className="py-2 pr-3 font-medium">日期</th>
                <th className="py-2 pr-3 font-medium text-right">收入</th>
                <th className="py-2 pr-3 font-medium text-right">成本</th>
                <th className="py-2 font-medium text-right">存</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap text-[var(--gold)]">{b.case_no || "—"}</td>
                  <td className="py-2 pr-3">
                    {b.pet_name || "—"}
                    <span className="text-[var(--soft)]">{b.owner_name ? `　·　${b.owner_name}` : ""}</span>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{b.plan || "—"}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-[var(--soft)]">{b.service_date || "—"}</td>
                  <td colSpan={3} className="py-1.5">
                    <form action={updateFinance} className="flex items-center gap-1.5 justify-end">
                      <input type="hidden" name="id" value={b.id} />
                      <input type="number" step="0.01" name="amount" defaultValue={b.amount ?? ""} className={inputCls} placeholder="收入" />
                      <input type="number" step="0.01" name="cost" defaultValue={b.cost ?? ""} className={inputCls} placeholder="成本" />
                      <button className="text-xs px-3 py-1 rounded-md bg-[var(--gold)] text-white hover:opacity-90">存</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
