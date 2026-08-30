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

  const [heldPosts, heldListRes, bookingsRes, shopRes, countRes] =
    await Promise.all([
      supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "held"),
      supabase
        .from("posts")
        .select("name, body, crisis_flag, context, created_at")
        .eq("status", "held")
        .order("created_at", { ascending: false })
        .limit(4),
      supabase
        .from("cremation_bookings")
        .select("owner_name, pet_name, plan, status, service_date, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
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
    owner_name: string | null;
    pet_name: string | null;
    plan: string | null;
    status: string;
    service_date: string | null;
    created_at: string;
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
  const recentBookings = bookings.slice(0, 6);
  const statusLabel = (k: string) =>
    BOOKING_STATUS.find((s) => s.key === k)?.label || k;

  const heldList = (heldListRes.data ?? []) as {
    name: string | null;
    body: string;
    crisis_flag: boolean;
    context: string;
    created_at: string;
  }[];

  const kpis = [
    { icon: "💰", label: `本月營業額（${currency}）`, value: "$" + Math.round(thisMonthRevenue).toLocaleString() },
    { icon: "🧾", label: "本月訂單", value: thisMonthOrders },
    { icon: "✦", label: "進行中預約", value: activeCount },
    { icon: "📅", label: "今日預約", value: todayCount },
    { icon: "✎", label: "待審留言", value: heldPosts.count ?? 0, alert: (heldPosts.count ?? 0) > 0 },
    { icon: "▦", label: "產品數", value: countRes.productsCount.count },
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

      {/* 近期預約 + 待審留言（實質內容，不與上方數字重複） */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* 近期預約 */}
        <div className="lg:col-span-2 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base">近期預約</h2>
            <Link href="/bookings" className="text-xs text-[var(--gold)] hover:underline">
              全部 →
            </Link>
          </div>
          {recentBookings.length === 0 ? (
            <p className="text-sm text-[var(--soft)] py-6 text-center">暫無預約記錄。</p>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {recentBookings.map((b, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="text-[var(--ink)]">{b.owner_name || "—"}</span>
                    {b.pet_name && (
                      <span className="text-[var(--soft)]">　·　{b.pet_name}</span>
                    )}
                  </span>
                  {b.plan && (
                    <span className="text-xs text-[var(--soft)] hidden sm:inline">
                      {b.plan}
                    </span>
                  )}
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)] whitespace-nowrap">
                    {statusLabel(b.status)}
                  </span>
                  <span className="text-xs text-[var(--soft)] whitespace-nowrap w-16 text-right">
                    {(b.service_date || b.created_at)?.slice(5, 10)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 待審留言（顯示真實留言） */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base">待審留言</h2>
            <Link href="/board" className="text-xs text-[var(--gold)] hover:underline">
              審核 →
            </Link>
          </div>
          {heldList.length === 0 ? (
            <p className="text-sm text-[var(--soft)] py-6 text-center">目前沒有待審留言。</p>
          ) : (
            <div className="space-y-2.5">
              {heldList.map((p, i) => (
                <div
                  key={i}
                  className={
                    "rounded-xl border px-3 py-2 text-sm " +
                    (p.crisis_flag ? "border-red-300 bg-red-50/40" : "border-[var(--line)]")
                  }
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-[var(--soft)]">{p.name || "匿名"}</span>
                    {p.crisis_flag && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                        ⚠ 危機
                      </span>
                    )}
                  </div>
                  <p className="text-[var(--ink)] line-clamp-2">{p.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
