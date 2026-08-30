import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { shopifyGraphQL } from "@/lib/shopify";
import { getStaff } from "@/lib/auth";
import { Clock } from "./_clock";

export const dynamic = "force-dynamic";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function lastSixMonths() {
  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${d.getMonth() + 1}月`,
    });
  }
  return months;
}

type OrdersResp = {
  orders: {
    edges: {
      node: {
        createdAt: string;
        totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
      };
    }[];
  };
};

export default async function OverviewPage() {
  const staff = await getStaff();
  const supabase = await createClient();
  const months = lastSixMonths();
  const since = months[0].key + "-01";

  const [heldPosts, crisisPosts, todaysBookings, activeBookings, shopRes] =
    await Promise.all([
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "held"),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "held")
        .eq("crisis_flag", true),
      supabase
        .from("cremation_bookings")
        .select("*", { count: "exact", head: true })
        .eq("service_date", todayStr()),
      supabase
        .from("cremation_bookings")
        .select("*", { count: "exact", head: true })
        .not("status", "in", "(completed,cancelled)"),
      shopifyGraphQL<OrdersResp>(
        `{ orders(first: 250, query: "created_at:>=${since}") {
           edges { node { createdAt totalPriceSet { shopMoney { amount currencyCode } } } }
        } }`
      ).catch((e) => ({ __err: String(e) }) as unknown as OrdersResp),
    ]);

  const shopErr =
    (shopRes as unknown as { __err?: string }).__err || "";
  const orders = shopErr ? [] : shopRes.orders.edges.map((e) => e.node);

  const revByMonth: Record<string, number> = {};
  const cntByMonth: Record<string, number> = {};
  let currency = "HKD";
  for (const o of orders) {
    const m = o.createdAt.slice(0, 7);
    revByMonth[m] = (revByMonth[m] || 0) + Number(o.totalPriceSet.shopMoney.amount);
    cntByMonth[m] = (cntByMonth[m] || 0) + 1;
    currency = o.totalPriceSet.shopMoney.currencyCode || currency;
  }
  const curKey = months[5].key;
  const thisMonthRevenue = revByMonth[curKey] || 0;
  const thisMonthOrders = cntByMonth[curKey] || 0;
  const maxRev = Math.max(1, ...months.map((m) => revByMonth[m.key] || 0));

  const pending = [
    { label: "今日預約服務", value: todaysBookings.count ?? 0, href: "/bookings" },
    { label: "進行中預約", value: activeBookings.count ?? 0, href: "/bookings" },
    { label: "待審留言", value: heldPosts.count ?? 0, href: "/board" },
    {
      label: "危機留言（待跟進）",
      value: crisisPosts.count ?? 0,
      href: "/board?filter=held",
      alert: (crisisPosts.count ?? 0) > 0,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">總覽</h1>
      <Clock name={staff?.name || staff?.email || ""} />

      {/* 待處理 */}
      <h2 className="text-base mt-8 mb-3 text-[var(--ink)]">待處理事項</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {pending.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={
              "block rounded-2xl border p-4 sm:p-5 bg-[var(--card)] hover:shadow-[var(--shadow)] transition " +
              (c.alert ? "border-red-300" : "border-[var(--line)]")
            }
          >
            <div className="text-xs sm:text-sm text-[var(--soft)] mb-2">
              {c.label}
            </div>
            <div
              className={
                "text-3xl font-semibold tabular-nums " +
                (c.alert ? "text-red-600" : "text-[var(--ink)]")
              }
            >
              {c.value}
            </div>
          </Link>
        ))}
      </div>

      {/* 本月概況 */}
      <h2 className="text-base mt-8 mb-3 text-[var(--ink)]">本月概況</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="rounded-2xl border border-[var(--line)] p-4 sm:p-5 bg-[var(--card)]">
          <div className="text-xs sm:text-sm text-[var(--soft)] mb-2">本月訂單</div>
          <div className="text-3xl font-semibold tabular-nums">{thisMonthOrders}</div>
        </div>
        <div className="rounded-2xl border border-[var(--line)] p-4 sm:p-5 bg-[var(--card)] lg:col-span-3">
          <div className="text-xs sm:text-sm text-[var(--soft)] mb-2">
            本月營業額（{currency}）
          </div>
          <div className="text-3xl font-semibold tabular-nums">
            ${Math.round(thisMonthRevenue).toLocaleString()}
          </div>
        </div>
      </div>

      {/* 近 6 個月營業額 bar chart */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-base">近 6 個月營業額</h2>
          <span className="text-xs text-[var(--soft)]">{currency}</span>
        </div>

        {shopErr ? (
          <p className="text-sm text-[var(--soft)] py-6 text-center">
            未能讀取 Shopify 訂單（可能未於此環境設定 SHOPIFY_ADMIN_API_TOKEN）。
          </p>
        ) : (
          <div className="flex items-end gap-2 sm:gap-4 h-44">
            {months.map((m) => {
              const rev = revByMonth[m.key] || 0;
              const h = Math.round((rev / maxRev) * 100);
              const isCur = m.key === curKey;
              return (
                <div
                  key={m.key}
                  className="flex-1 flex flex-col items-center gap-1.5 h-full"
                >
                  <div className="text-[11px] text-[var(--soft)] tabular-nums h-4">
                    {rev > 0 ? Math.round(rev).toLocaleString() : ""}
                  </div>
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className="w-full max-w-[46px] mx-auto rounded-t-md transition-all"
                      style={{
                        height: `${h}%`,
                        minHeight: rev > 0 ? 4 : 2,
                        background: isCur ? "var(--gold)" : "var(--gold-soft)",
                      }}
                      title={`${m.label}：$${Math.round(rev).toLocaleString()}`}
                    />
                  </div>
                  <div
                    className={
                      "text-xs " +
                      (isCur ? "text-[var(--ink)] font-medium" : "text-[var(--soft)]")
                    }
                  >
                    {m.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
