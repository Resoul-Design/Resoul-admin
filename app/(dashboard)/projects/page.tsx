import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { orderLabel } from "@/lib/order-label";
import type { ProductOrderRow } from "@/lib/product-orders";
import { DeleteProject } from "./_delete";

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
  created_at: string;
  amount: number | null;
  payment_amount: number | null;
  payment_status: string | null;
  shopify_order_name: string | null;
};
type Entry = { booking_id: string | null; order_ref: string | null; kind: string; amount: number };

const STATUS_LABEL: Record<string, string> = {
  new: "新收到",
  scheduled: "已排期",
  pickup: "接送中",
  cremating: "火化中",
  completed: "已完成",
  cancelled: "已取消",
};
const FIN: Record<string, string> = {
  PAID: "已付款", PENDING: "待付款", PARTIALLY_PAID: "部分付款",
  REFUNDED: "已退款", PARTIALLY_REFUNDED: "部分退款", VOIDED: "已作廢",
};

type Row = {
  key: string;
  href: string;
  projectNo: string;
  primary: string;
  secondary: string;
  plan: string;
  status: string;
  income: number;
  expense: number;
  date: string;
  deleteId?: string;
  deleteLabel?: string;
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const me = await getStaff();
  const isAdmin = me?.role === "admin";

  const [bkRes, peRes, poRes] = await Promise.all([
    supabase
      .from("cremation_bookings")
      .select("id, case_no, pet_name, owner_name, plan, status, service_date, created_at, amount, payment_amount, payment_status, shopify_order_name")
      .order("created_at", { ascending: false })
      .limit(1000),
    // select("*") 以容忍 order_ref 欄位尚未建立（migration 未跑）時不報錯
    supabase.from("project_entries").select("*"),
    supabase.from("product_orders").select("*").order("shopify_created_at", { ascending: false }).limit(500),
  ]);
  const bookings = (bkRes.data ?? []) as Booking[];
  const entries = (peRes.data ?? []) as Entry[];
  const productOrders = (poRes.data ?? []) as ProductOrderRow[];

  const byBooking: Record<string, { income: number; expense: number }> = {};
  const byOrder: Record<string, { income: number; expense: number }> = {};
  for (const e of entries) {
    if (e.booking_id) {
      const a = (byBooking[e.booking_id] = byBooking[e.booking_id] || { income: 0, expense: 0 });
      if (e.kind === "income") a.income += e.amount || 0; else a.expense += e.amount || 0;
    } else if (e.order_ref) {
      const a = (byOrder[e.order_ref] = byOrder[e.order_ref] || { income: 0, expense: 0 });
      if (e.kind === "income") a.income += e.amount || 0; else a.expense += e.amount || 0;
    }
  }

  const rows: Row[] = [];
  for (const b of bookings) {
    const a = byBooking[b.id] || { income: 0, expense: 0 };
    const paid = b.payment_status === "paid" ? (b.amount ?? b.payment_amount ?? 0) : 0;
    const income = a.income > 0 ? a.income : paid;
    rows.push({
      key: "b:" + b.id,
      href: `/projects/${b.id}`,
      projectNo: orderLabel(b.shopify_order_name || b.case_no, "cremation"),
      primary: b.pet_name || "—",
      secondary: b.owner_name || "—",
      plan: b.plan || "火化服務",
      status: STATUS_LABEL[b.status] || b.status,
      income,
      expense: a.expense,
      date: b.service_date || b.created_at?.slice(0, 10) || "",
      deleteId: isAdmin ? b.id : undefined,
      deleteLabel: `${b.pet_name || "—"}／${b.owner_name || "—"}`,
    });
  }
  for (const o of productOrders) {
    const a = byOrder[o.shopify_order_id] || { income: 0, expense: 0 };
    const income = a.income > 0 ? a.income : Number(o.total_amount || 0);
    const items = (o.line_items || []).map((it) => `${it.title}×${it.quantity}`).join("、");
    rows.push({
      key: "o:" + o.shopify_order_id,
      href: `/projects/order/${o.shopify_order_id.split("/").pop()}`,
      projectNo: orderLabel(o.order_name, "product"),
      primary: o.customer_name || "—",
      secondary: items || "產品訂單",
      plan: "紀念產品",
      status: FIN[o.financial_status || ""] || o.financial_status || "—",
      income,
      expense: a.expense,
      date: o.shopify_created_at?.slice(0, 10) || "",
    });
  }
  rows.sort((x, y) => (y.date || "").localeCompare(x.date || ""));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">專案管理</h1>
      <p className="mb-6 text-sm text-[var(--soft)]">火化預約與紀念產品訂單都是專案。收入預設取已付款金額，可另加收支明細。</p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無專案。預約火化記錄與產品訂單會成為專案。
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium">專案編號</th>
                <th className="px-4 py-3 font-medium">名稱</th>
                <th className="px-4 py-3 font-medium">類別</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium text-right">收入</th>
                <th className="px-4 py-3 font-medium text-right">支出</th>
                <th className="px-4 py-3 font-medium text-right">淨額</th>
                <th className="px-4 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--gold)]">{r.projectNo}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block min-w-[6rem] align-top">{r.primary}</span>
                    <span className="text-[var(--soft)]"><span className="text-[var(--faint)] mx-1.5">·</span>{r.secondary}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{r.plan}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(r.income)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--soft)]">{money(r.expense)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{money(r.income - r.expense)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={r.href} className="text-xs text-[var(--gold)] hover:underline">管理 →</Link>
                      {r.deleteId && <DeleteProject id={r.deleteId} label={r.deleteLabel || r.projectNo} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
