import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductOrderRow } from "@/lib/product-orders";

export const dynamic = "force-dynamic";

const BSTATUS: { key: string; label: string }[] = [
  { key: "new", label: "新收到" },
  { key: "scheduled", label: "已排期" },
  { key: "pickup", label: "接送中" },
  { key: "cremating", label: "火化中" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
];

type Booking = {
  id: string;
  status: string;
  source: string | null;
  amount: number | null;
  payment_amount: number | null;
  payment_status: string | null;
};
type Entry = { booking_id: string | null; kind: string; amount: number };
type Deposit = { status: string; payment_status: string | null; payment_amount: number | null };

export default async function ReportsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const [bkRes, peRes, depRes, orderRes] = await Promise.all([
    supabase.from("cremation_bookings").select("id, status, source, amount, payment_amount, payment_status").limit(2000),
    supabase.from("project_entries").select("booking_id, kind, amount").limit(5000),
    admin.from("deposit_bookings").select("status, payment_status, payment_amount").limit(2000),
    supabase.from("product_orders").select("*").order("shopify_created_at", { ascending: false }).limit(2000),
  ]);
  const allBookings = (bkRes.data ?? []) as Booking[];
  const vetBookings = allBookings.filter((b) => (b.source || "").includes("euthanasia"));
  const bookings = allBookings.filter((b) => !(b.source || "").includes("euthanasia"));
  const entries = (peRes.data ?? []) as Entry[];
  const deposits = (depRes.data ?? []) as Deposit[];
  const orders = (orderRes.data ?? []) as ProductOrderRow[];

  // 手動收入按專案加總（與「專案管理／財務」一致）
  const incByBooking: Record<string, number> = {};
  for (const e of entries) {
    if (e.kind === "income" && e.booking_id) {
      incByBooking[e.booking_id] = (incByBooking[e.booking_id] || 0) + (e.amount || 0);
    }
  }
  // 火化收入（累計）：每筆預約以手動收入優先，否則取已付款金額；已取消／退款不計
  const income = bookings.reduce((n, b) => {
    if (b.status === "cancelled" || b.payment_status === "refunded") return n;
    const manual = incByBooking[b.id] || 0;
    const paid = b.payment_status === "paid" ? (b.amount ?? b.payment_amount ?? 0) : 0;
    return n + (manual > 0 ? manual : paid);
  }, 0);
  // 成本（累計）：專案支出明細
  const cremationIds = new Set(bookings.map((b) => b.id));
  const cost = entries.filter((e) => e.kind === "expense" && e.booking_id && cremationIds.has(e.booking_id)).reduce((n, e) => n + (e.amount || 0), 0);
  const pickupIncome = deposits.filter((d) => d.status !== "cancelled" && d.payment_status === "paid").reduce((n, d) => n + Number(d.payment_amount || 0), 0);
  const productIncome = orders.filter((o) => !o.cancelled_at && !["REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"].includes(o.financial_status || "")).reduce((n, o) => n + Number(o.total_amount || 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">報表與匯出</h1>

      <div className="grid gap-4 mb-6 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "獸醫評估", count: vetBookings.length, income: null },
          { label: "火化預約", count: bookings.length, income },
          { label: "接送服務", count: deposits.length, income: pickupIncome },
          { label: "紀念品訂單", count: orders.length, income: productIncome },
        ].map((item) => <div key={item.label} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5"><div className="text-sm text-[var(--soft)]">{item.label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{item.count} 筆</div>{item.income != null && <div className="mt-2 text-sm text-[var(--soft)]">已記錄收入 <span className="font-medium text-[var(--ink)]">${Math.round(item.income).toLocaleString()}</span></div>}</div>)}
      </div>

      <div className="grid gap-4 mb-6 sm:grid-cols-2">
        {/* 預約概況 */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <h2 className="text-base mb-3">評估與火化狀態</h2>
          <div className="space-y-1.5 text-sm">
            <div className="grid grid-cols-[1fr_64px_64px] gap-2 text-xs text-[var(--soft)]"><span>狀態</span><span className="text-right">獸醫評估</span><span className="text-right">火化</span></div>
            {BSTATUS.map((s) => (
              <div key={s.key} className="grid grid-cols-[1fr_64px_64px] gap-2">
                <span className="text-[var(--soft)]">{s.label}</span>
                <span className="text-right tabular-nums">{vetBookings.filter((b) => b.status === s.key).length}</span>
                <span className="text-right tabular-nums">{bookings.filter((b) => b.status === s.key).length}</span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_64px_64px] gap-2 border-t border-[var(--line)] pt-1.5 mt-1.5 font-medium">
              <span>總計</span>
              <span className="text-right tabular-nums">{vetBookings.length}</span>
              <span className="text-right tabular-nums">{bookings.length}</span>
            </div>
          </div>
        </div>

        {/* 火化收支 */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <h2 className="text-base mb-1">火化收支（累計）</h2>
          <p className="mb-3 text-[11px] text-[var(--soft)]">收入＝已付款預約金額（或手動收入明細）；成本＝專案支出明細；已取消／退款不計。</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--soft)]">收入</span>
              <span className="tabular-nums">${Math.round(income).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--soft)]">成本</span>
              <span className="tabular-nums">${Math.round(cost).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--line)] pt-1.5 mt-1.5 font-medium">
              <span>毛利</span>
              <span className="tabular-nums">${Math.round(income - cost).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 匯出 */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
        <h2 className="text-base mb-3">匯出 CSV</h2>
        <div className="flex flex-wrap gap-3">
          <a href="/api/export/bookings?category=vet" className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">匯出獸醫評估</a>
          <a href="/api/export/bookings?category=cremation" className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">匯出火化預約</a>
          <a href="/api/export/deposits" className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">匯出接送服務</a>
          <a href="/api/export/orders" className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">匯出紀念品訂單</a>
        </div>
      </div>
    </div>
  );
}
