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
type CountResp = { productsCount: { count: number } };

const BOOKING_STATUS: { key: string; label: string; color: string }[] = [
  { key: "new", label: "新收到", color: "#c8a86b" },
  { key: "scheduled", label: "已排期", color: "#9c7f52" },
  { key: "pickup", label: "接送中", color: "#b89a6e" },
  { key: "cremating", label: "火化中", color: "#8a7350" },
  { key: "completed", label: "已完成", color: "#9aa87f" },
  { key: "cancelled", label: "已取消", color: "#c4b8a6" },
];

// 純 SVG 環形圖
function Donut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: { value: number; color: string }[];
  centerValue: string | number;
  centerLabel: string;
}) {
  const size = 150;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((n, s) => n + s.value, 0);
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-[150px] h-[150px] shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--cream)"
          strokeWidth={stroke}
        />
        {total > 0 &&
          segments.map((s, i) => {
            if (s.value <= 0) return null;
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </g>
      <text
        x="50%"
        y="46%"
        textAnchor="middle"
        className="fill-[var(--ink)]"
        style={{ fontSize: 28, fontWeight: 600 }}
      >
        {centerValue}
      </text>
      <text
        x="50%"
        y="62%"
        textAnchor="middle"
        className="fill-[var(--soft)]"
        style={{ fontSize: 11 }}
      >
        {centerLabel}
      </text>
    </svg>
  );
}

export default async function OverviewPage() {
  const staff = await getStaff();
  const supabase = await createClient();
  const months = lastSixMonths();
  const since = months[0].key + "-01";

  const [heldPosts, crisisPosts, visiblePosts, bookingsRes, shopRes, countRes] =
    await Promise.all([
      supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "held"),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "held")
        .eq("crisis_flag", true),
      supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "visible"),
      supabase.from("cremation_bookings").select("status, service_date").limit(1000),
      shopifyGraphQL<OrdersResp>(
        `{ orders(first: 250, query: "created_at:>=${since}") {
           edges { node { createdAt totalPriceSet { shopMoney { amount currencyCode } } } }
        } }`
      ).catch((e) => ({ __err: String(e) }) as unknown as OrdersResp),
      shopifyGraphQL<CountResp>(`{ productsCount { count } }`).catch(
        () => ({ productsCount: { count: 0 } }) as CountResp
      ),
    ]);

  const shopErr = (shopRes as unknown as { __err?: string }).__err || "";
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

  const bookings = (bookingsRes.data ?? []) as {
    status: string;
    service_date: string | null;
  }[];
  const today = todayStr();
  const todayCount = bookings.filter((b) => b.service_date === today).length;
  const activeCount = bookings.filter(
    (b) => b.status !== "completed" && b.status !== "cancelled"
  ).length;
  const bookingDist = BOOKING_STATUS.map((s) => ({
    ...s,
    value: bookings.filter((b) => b.status === s.key).length,
  }));

  const kpis = [
    { icon: "💰", label: `本月營業額（${currency}）`, value: "$" + Math.round(thisMonthRevenue).toLocaleString() },
    { icon: "🧾", label: "本月訂單", value: thisMonthOrders },
    { icon: "✦", label: "進行中預約", value: activeCount },
    { icon: "📅", label: "今日預約", value: todayCount },
    { icon: "✎", label: "待審留言", value: heldPosts.count ?? 0, alert: (heldPosts.count ?? 0) > 0 },
    { icon: "▦", label: "產品數", value: countRes.productsCount.count },
  ];

  const pending = [
    { label: "危機留言（優先跟進）", value: crisisPosts.count ?? 0, href: "/board?filter=held", alert: (crisisPosts.count ?? 0) > 0 },
    { label: "待審留言", value: heldPosts.count ?? 0, href: "/board" },
    { label: "今日預約服務", value: todayCount, href: "/bookings" },
    { label: "進行中預約", value: activeCount, href: "/bookings" },
  ];

  return (
    <div>
      {/* 標題橫幅 */}
      <div className="rounded-2xl bg-gradient-to-r from-[var(--gold)] to-[var(--gold-soft)] text-white px-6 py-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-white">營運儀表板</h1>
          <div className="text-white/85 text-sm mt-0.5">
            <Clock name={staff?.name || staff?.email || ""} />
          </div>
        </div>
        <div className="text-white/90 text-sm">Resoul 後台</div>
      </div>

      {/* KPI 圖標大數字 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 flex items-center gap-3"
          >
            <span className="text-2xl shrink-0">{k.icon}</span>
            <div className="min-w-0">
              <div className="text-[11px] text-[var(--soft)] truncate">{k.label}</div>
              <div
                className={
                  "text-xl font-semibold tabular-nums truncate " +
                  (k.alert ? "text-red-600" : "text-[var(--ink)]")
                }
              >
                {k.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 圖表面板 */}
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        {/* 營業額 bar chart */}
        <div className="lg:col-span-2 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-base">近 6 個月營業額</h2>
            <span className="text-xs text-[var(--soft)]">{currency}</span>
          </div>
          {shopErr ? (
            <p className="text-sm text-[var(--soft)] py-10 text-center">
              未能讀取 Shopify 訂單（請確認此環境已設定 SHOPIFY_ADMIN_API_TOKEN）。
            </p>
          ) : (
            <div className="flex items-end gap-2 sm:gap-4 h-48">
              {months.map((m) => {
                const rev = revByMonth[m.key] || 0;
                const h = Math.round((rev / maxRev) * 100);
                const isCur = m.key === curKey;
                return (
                  <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5 h-full">
                    <div className="text-[11px] text-[var(--soft)] tabular-nums h-4">
                      {rev > 0 ? Math.round(rev).toLocaleString() : ""}
                    </div>
                    <div className="flex-1 w-full flex items-end">
                      <div
                        className="w-full max-w-[48px] mx-auto rounded-t-md"
                        style={{
                          height: `${h}%`,
                          minHeight: rev > 0 ? 4 : 2,
                          background: isCur ? "var(--gold)" : "var(--gold-soft)",
                        }}
                        title={`${m.label}：$${Math.round(rev).toLocaleString()}`}
                      />
                    </div>
                    <div className={"text-xs " + (isCur ? "text-[var(--ink)] font-medium" : "text-[var(--soft)]")}>
                      {m.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 預約狀態分佈 donut */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <h2 className="text-base mb-4">預約狀態分佈</h2>
          <div className="flex items-center gap-4">
            <Donut
              segments={bookingDist.map((s) => ({ value: s.value, color: s.color }))}
              centerValue={bookings.length}
              centerLabel="總預約"
            />
            <div className="space-y-1.5 text-sm min-w-0">
              {bookingDist.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-[var(--soft)]">{s.label}</span>
                  <span className="ml-auto tabular-nums">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 待處理 + 留言板概況 */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <h2 className="text-base mb-4">待處理事項</h2>
          <div className="grid grid-cols-2 gap-3">
            {pending.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                className={
                  "flex items-center justify-between rounded-xl border px-4 py-3 hover:bg-[var(--cream)] transition " +
                  (p.alert ? "border-red-300" : "border-[var(--line)]")
                }
              >
                <span className="text-sm text-[var(--soft)]">{p.label}</span>
                <span
                  className={
                    "text-2xl font-semibold tabular-nums " +
                    (p.alert ? "text-red-600" : "text-[var(--ink)]")
                  }
                >
                  {p.value}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <h2 className="text-base mb-4">留言板概況</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--soft)]">待審</span>
              <span className="tabular-nums font-medium">{heldPosts.count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--soft)]">顯示中</span>
              <span className="tabular-nums font-medium">{visiblePosts.count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--soft)]">危機留言</span>
              <span
                className={
                  "tabular-nums font-medium " +
                  ((crisisPosts.count ?? 0) > 0 ? "text-red-600" : "")
                }
              >
                {crisisPosts.count ?? 0}
              </span>
            </div>
            <Link
              href="/board"
              className="block text-center mt-2 text-sm text-[var(--gold)] hover:underline"
            >
              前往審核 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
