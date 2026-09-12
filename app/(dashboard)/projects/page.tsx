import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const money = (n: number) => "$" + Math.round(n).toLocaleString();

type Booking = {
  id: string;
  case_no: string | null;
  pet_name: string | null;
  owner_name: string | null;
  plan: string | null;
  status: string;
  service_date: string | null;
  amount: number | null;
  payment_amount: number | null;
  payment_status: string | null;
  shopify_order_name: string | null;
};
type Entry = { booking_id: string; kind: string; amount: number };

const STATUS_LABEL: Record<string, string> = {
  new: "新收到",
  scheduled: "已排期",
  pickup: "接送中",
  cremating: "火化中",
  completed: "已完成",
  cancelled: "已取消",
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const [bkRes, peRes] = await Promise.all([
    supabase
      .from("cremation_bookings")
      .select("id, case_no, pet_name, owner_name, plan, status, service_date, amount, payment_amount, payment_status, shopify_order_name")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("project_entries").select("booking_id, kind, amount"),
  ]);
  const bookings = (bkRes.data ?? []) as Booking[];
  const entries = (peRes.data ?? []) as Entry[];

  const agg: Record<string, { income: number; expense: number }> = {};
  for (const e of entries) {
    const a = (agg[e.booking_id] = agg[e.booking_id] || { income: 0, expense: 0 });
    if (e.kind === "income") a.income += e.amount || 0;
    else a.expense += e.amount || 0;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">專案管理</h1>

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無專案。預約火化記錄會成為專案。
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium">專案編號</th>
                <th className="px-4 py-3 font-medium">毛孩 / 主人</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium text-right">收入</th>
                <th className="px-4 py-3 font-medium text-right">支出</th>
                <th className="px-4 py-3 font-medium text-right">淨額</th>
                <th className="px-4 py-3 font-medium text-right">明細</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const a = agg[b.id] || { income: 0, expense: 0 };
                // 收入：優先用手動帳目；否則用已付款金額（與付款同步）
                const paid = b.payment_status === "paid" ? (b.amount ?? b.payment_amount ?? 0) : 0;
                const income = a.income > 0 ? a.income : paid;
                const net = income - a.expense;
                const projNo = b.shopify_order_name || b.case_no || "—";
                return (
                  <tr key={b.id} className="border-t border-[var(--line)]">
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--gold)]">{projNo}</td>
                    <td className="px-4 py-3">
                      {b.pet_name || "—"}
                      <span className="text-[var(--soft)]">{b.owner_name ? `　·　${b.owner_name}` : ""}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                        {STATUS_LABEL[b.status] || b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(income)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--soft)]">{money(a.expense)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{money(net)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/projects/${b.id}`} className="text-xs text-[var(--gold)] hover:underline">
                        管理 →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
