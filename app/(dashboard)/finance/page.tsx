import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOrdersSinceCached } from "@/lib/revenue";

export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
function shiftYm(ym: string, delta: number) {
  const [yy, mm] = ym.split("-").map(Number);
  const d = new Date(yy, mm - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
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
  payment_amount: number | null;
  payment_status: string | null;
  paid_at: string | null;
  created_at: string;
  shopify_order_name: string | null;
};
const money = (n: number) => "$" + Math.round(n).toLocaleString();

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ fm?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const months = lastSixMonths();
  const curKey = months[5].key;
  const since = shiftYm(curKey, -11) + "-01"; // 抓近 12 個月訂單，供月份選擇
  const selMonth = sp.fm && /^\d{4}-\d{2}$/.test(sp.fm) ? sp.fm : curKey;

  const [bkRes, ordersRes, ppRes, peRes] = await Promise.all([
    supabase
      .from("cremation_bookings")
      .select("id, case_no, pet_name, owner_name, plan, status, service_date, amount, cost, payment_amount, payment_status, paid_at, created_at, shopify_order_name")
      .order("service_date", { ascending: false, nullsFirst: false })
      .limit(500),
    getOrdersSinceCached(since),
    supabase.from("plan_prices").select("plan, price, cost"),
    supabase.from("project_entries").select("booking_id, kind, amount, entry_date"),
  ]);
  const planPrices = (ppRes.data ?? []) as { plan: string; price: number; cost: number }[];
  const PLAN_ORDER = ["風之旅", "雲之旅", "星之旅"];
  const priceRows = PLAN_ORDER.map(
    (p) => planPrices.find((x) => x.plan === p) || { plan: p, price: 0, cost: 0 }
  );

  const bookings = (bkRes.data ?? []) as Booking[];
  const shopErr = ordersRes.ok ? "" : ordersRes.error || "error";
  const orders = ordersRes.rows;

  // 產品銷售：只計「非火化」Shopify 訂單（火化訂單帶 payment_ref，歸入火化收入，避免重複計算）
  const productByMonth: Record<string, number> = {};
  for (const o of orders) {
    if (o.isCremation) continue;
    const mk = o.createdAt.slice(0, 7);
    productByMonth[mk] = (productByMonth[mk] || 0) + o.amount;
  }

  // 有效收入/成本：手動填優先，否則套用方案定價；已取消不計
  const priceMap: Record<string, { price: number; cost: number }> = {};
  for (const r of priceRows) priceMap[r.plan] = { price: r.price || 0, cost: r.cost || 0 };
  const effAmt = (b: Booking) =>
    b.amount ?? (b.plan ? priceMap[b.plan]?.price ?? 0 : 0);
  const effCost = (b: Booking) =>
    b.cost ?? (b.plan ? priceMap[b.plan]?.cost ?? 0 : 0);

  // 專案明細（實際收支）：按專案 / 按 entry_date 月份加總
  const entries = (peRes.data ?? []) as {
    booking_id: string;
    kind: string;
    amount: number;
    entry_date: string;
  }[];
  const expByMonth: Record<string, number> = {};
  for (const e of entries) {
    const mk = (e.entry_date || "").slice(0, 7);
    if (e.kind === "expense" && mk) expByMonth[mk] = (expByMonth[mk] || 0) + (e.amount || 0);
  }

  // 預計（未取消，按方案價，依 service_date 月份）
  const inMonth = bookings.filter(
    (b) => (b.service_date || "").startsWith(selMonth) && b.status !== "cancelled"
  );
  const projIncome = inMonth.reduce((n, b) => n + effAmt(b), 0);
  const projCost = inMonth.reduce((n, b) => n + effCost(b), 0);

  // 火化收入（實際）：已付款預約，依 paid_at（無則 service_date / created_at）月份加總
  const cremRevByMonth: Record<string, number> = {};
  for (const b of bookings) {
    if (b.payment_status !== "paid") continue;
    const d = (b.paid_at || b.service_date || b.created_at || "").slice(0, 7);
    if (!d) continue;
    cremRevByMonth[d] = (cremRevByMonth[d] || 0) + (b.amount ?? b.payment_amount ?? effAmt(b));
  }

  // 實際：火化收入（已付款預約）+ 產品銷售（非火化訂單）+ 火化成本（專案明細支出）
  const actIncome = cremRevByMonth[selMonth] || 0;
  const actCost = expByMonth[selMonth] || 0;
  const prodMonth = shopErr ? 0 : productByMonth[selMonth] || 0;
  const [selY, selM] = selMonth.split("-").map(Number);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">財務管理</h1>
      <p className="mb-6 text-xs text-[var(--soft)]">產品銷售取自 Shopify 訂單（近 12 個月，游標分頁抓取；數據每 5 分鐘更新）。火化收入取自已付款預約／專案明細。{shopErr ? "　⚠️ 暫時未能讀取 Shopify 訂單。" : ""}</p>

      {/* 月份選擇 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-semibold">
          {selY} 年 {selM} 月 收支
        </h2>
        <div className="flex gap-2 text-sm">
          <Link href={`/finance?fm=${shiftYm(selMonth, -1)}`} className="px-3 py-1.5 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]">← 上月</Link>
          <Link href="/finance" className="px-3 py-1.5 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]">本月</Link>
          <Link href={`/finance?fm=${shiftYm(selMonth, 1)}`} className="px-3 py-1.5 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]">下月 →</Link>
        </div>
      </div>

      {/* 預計（全部未取消，按方案價） */}
      <div className="text-xs text-[var(--soft)] mb-1.5">預計（已排期等，含未完成）</div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-4">
        {[
          { label: "預計收入", value: money(projIncome) },
          { label: "預計成本", value: money(projCost) },
          { label: "預計毛利", value: money(projIncome - projCost) },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
            <div className="text-xs text-[var(--soft)] mb-1">{c.label}</div>
            <div className="text-xl sm:text-2xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      {/* 實際（已完成 + 產品銷售） */}
      <div className="text-xs text-[var(--soft)] mb-1.5">實際（已完成火化 + 產品銷售）</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {[
          { label: "實際火化收入", value: money(actIncome) },
          { label: "產品銷售", value: shopErr ? "—" : money(prodMonth) },
          { label: "實際成本", value: money(actCost) },
          { label: "實際毛利", value: money(actIncome - actCost + prodMonth) },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
            <div className="text-xs text-[var(--soft)] mb-1">{c.label}</div>
            <div className="text-xl sm:text-2xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      {/* 每月收支 */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 mb-6">
        <h2 className="text-base mb-3">近 6 個月收支</h2>
        <table className="hidden md:table w-full text-sm">
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
              const inc = cremRevByMonth[m.key] || 0;
              const cost = expByMonth[m.key] || 0;
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

        <div className="space-y-2 md:hidden">
          {months.map((m) => {
            const inc = cremRevByMonth[m.key] || 0;
            const cost = expByMonth[m.key] || 0;
            const prod = productByMonth[m.key] || 0;
            const profit = inc - cost + prod;
            return (
              <div key={m.key} className="rounded-xl border border-[var(--line)] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{m.label}</span>
                  <span className="tabular-nums font-medium">毛利 {money(profit)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--soft)]">
                  <span>火化收入 <span className="tabular-nums text-[var(--ink)]">{money(inc)}</span></span>
                  <span>成本 <span className="tabular-nums">{money(cost)}</span></span>
                  <span>產品 <span className="tabular-nums text-[var(--ink)]">{shopErr ? "—" : money(prod)}</span></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
