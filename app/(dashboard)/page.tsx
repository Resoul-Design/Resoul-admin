import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOrdersSinceCached, getProductsCountCached } from "@/lib/revenue";
import { getStaff } from "@/lib/auth";
import { Clock } from "./_clock";
import { DashboardAutoRefresh } from "./_auto-refresh";

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
  const curKey = months[5].key;
  const today = todayStr();
  const monthStart = curKey + "-01";

  // 輕量查詢：狀態分佈用聚合 count（不拉全部資料）；列表只取最近 6 筆
  const statusCountsP = Promise.all(
    BOOKING_STATUS.map((s) =>
      supabase.from("cremation_bookings").select("id", { count: "exact", head: true }).eq("status", s.key)
    )
  );
  const [
    [heldPosts, heldListRes, recentRes, todayRes, incomeRes, ordersRes, productsCount, heldCrisisRes],
    statusCounts,
  ] = await Promise.all([
    Promise.all([
      supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "held"),
      supabase.from("posts").select("name, body, crisis_flag, context, created_at").eq("status", "held").order("created_at", { ascending: false }).limit(4),
      supabase.from("cremation_bookings").select("owner_name, pet_name, plan, status, service_date, created_at").order("created_at", { ascending: false }).limit(6),
      supabase.from("cremation_bookings").select("id", { count: "exact", head: true }).eq("service_date", today),
      supabase.from("project_entries").select("amount").eq("kind", "income").gte("entry_date", monthStart),
      getOrdersSinceCached(since),
      getProductsCountCached(),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "held").eq("crisis_flag", true),
    ]),
    statusCountsP,
  ]);
  const crisisHeld = heldCrisisRes.count ?? 0;

  // 訂單營業額（分頁抓取 + 5 分鐘快取）
  const shopErr = ordersRes.ok ? "" : ordersRes.error || "error";
  const revByMonth: Record<string, number> = {};
  const cntByMonth: Record<string, number> = {};
  let currency = "HKD";
  for (const o of ordersRes.rows) {
    const m = o.createdAt.slice(0, 7);
    revByMonth[m] = (revByMonth[m] || 0) + o.amount;
    cntByMonth[m] = (cntByMonth[m] || 0) + 1;
    currency = o.currency || currency;
  }
  const thisMonthRevenue = revByMonth[curKey] || 0;
  const thisMonthOrders = cntByMonth[curKey] || 0;
  const maxRev = Math.max(1, ...months.map((m) => revByMonth[m.key] || 0));

  // 狀態分佈與進行中／總數（由聚合 count 得出）
  const bookingDist = BOOKING_STATUS.map((s, i) => ({ ...s, value: statusCounts[i].count ?? 0 }));
  const totalBookings = bookingDist.reduce((n, s) => n + s.value, 0);
  const activeCount = bookingDist
    .filter((s) => s.key !== "completed" && s.key !== "cancelled")
    .reduce((n, s) => n + s.value, 0);
  const todayCount = todayRes.count ?? 0;

  const cremThisMonth = ((incomeRes.data ?? []) as { amount: number }[]).reduce((n, e) => n + (e.amount || 0), 0);

  const recentBookings = (recentRes.data ?? []) as {
    owner_name: string | null;
    pet_name: string | null;
    plan: string | null;
    status: string;
    service_date: string | null;
    created_at: string;
  }[];
  const statusLabel = (k: string) => BOOKING_STATUS.find((s) => s.key === k)?.label || k;

  const heldList = (heldListRes.data ?? []) as {
    name: string | null;
    body: string;
    crisis_flag: boolean;
    context: string;
    created_at: string;
  }[];

  const kpis = [
    { icon: "💰", label: "本月營業額", value: "$" + Math.round(thisMonthRevenue + cremThisMonth).toLocaleString() },
    { icon: "🧾", label: "本月訂單", value: thisMonthOrders },
    { icon: "✦", label: "進行中預約", value: activeCount },
    { icon: "📅", label: "今日預約", value: todayCount },
    { icon: "✎", label: "待審留言", value: heldPosts.count ?? 0, alert: (heldPosts.count ?? 0) > 0 },
    { icon: "▦", label: "產品數", value: productsCount },
  ];

  return (
    <div>
      <DashboardAutoRefresh />
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

      {/* 危機留言醒目入口 */}
      {crisisHeld > 0 && (
        <Link
          href="/board/community?filter=held"
          className="mb-6 flex items-center gap-3 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 transition hover:bg-red-100"
        >
          <span className="text-2xl">⚠️</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-red-700">有 {crisisHeld} 則「危機字眼」留言待審</div>
            <div className="text-sm text-red-600/90">可能涉及情緒危機，請盡快查看並處理。</div>
          </div>
          <span className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">立即審核 →</span>
        </Link>
      )}

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
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="text-base">近 6 個月營業額</h2>
            <span className="text-xs text-[var(--soft)]">{currency}</span>
          </div>
          <p className="mb-3 text-[11px] text-[var(--soft)]">Shopify 訂單金額，近 6 個月；數據每 5 分鐘更新。</p>
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
              centerValue={totalBookings}
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
                <div key={i} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto_auto] items-center gap-3 py-2.5 text-sm">
                  <span className="truncate text-[var(--ink)]" title={b.owner_name || "—"}>
                    {b.owner_name || "—"}
                  </span>
                  <span className="truncate text-[var(--soft)]" title={b.pet_name || "—"}>
                    {b.pet_name || "—"}
                  </span>
                  <span className="truncate text-xs text-[var(--soft)]" title={b.plan || "—"}>
                    {b.plan || "—"}
                  </span>
                  <span className="justify-self-end text-xs px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)] whitespace-nowrap">
                    {statusLabel(b.status)}
                  </span>
                  <span className="text-xs text-[var(--soft)] whitespace-nowrap text-right tabular-nums">
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
