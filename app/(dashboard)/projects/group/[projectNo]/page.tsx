import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/auth";
import { canonicalProjectNo, isRslProjectNo, projectNoFromItems, projectNoFromNotes } from "@/lib/order-label";
import type { ProductOrderRow } from "@/lib/product-orders";

export const dynamic = "force-dynamic";

const money = (amount: number) => `${Math.round(amount).toLocaleString()} HKD`;

export default async function ProjectGroupPage({ params }: { params: Promise<{ projectNo: string }> }) {
  const staff = await getStaff();
  if (!staff) notFound();
  const { projectNo: rawProjectNo } = await params;
  const projectNo = decodeURIComponent(rawProjectNo).toUpperCase();
  if (!isRslProjectNo(projectNo)) notFound();

  const admin = createAdminClient();
  const [depositRes, bookingRes, orderRes] = await Promise.all([
    admin.from("deposit_bookings").select("id, owner_name, pet_name, status, service_date, created_at, payment_amount, payment_status, shopify_order_name, notes").order("created_at", { ascending: false }).limit(1000),
    admin.from("cremation_bookings").select("id, case_no, owner_name, pet_name, plan, status, service_date, created_at, amount, payment_amount, payment_status, shopify_order_name, notes, source").order("created_at", { ascending: false }).limit(1000),
    admin.from("product_orders").select("*").order("shopify_created_at", { ascending: false }).limit(1000),
  ]);
  const records: { key: string; label: string; person: string; date: string; status: string; amount: number; href: string }[] = [];

  for (const d of depositRes.data || []) {
    if (canonicalProjectNo(projectNoFromNotes(d.notes)) !== projectNo) continue;
    records.push({ key: `d:${d.id}`, label: `接送服務 · ${d.pet_name || "—"}`, person: d.owner_name || "—", date: d.service_date || d.created_at?.slice(0, 10) || "—", status: d.status || "—", amount: d.payment_status === "paid" ? Number(d.payment_amount || 0) : 0, href: "/deposits" });
  }
  for (const b of bookingRes.data || []) {
    if (canonicalProjectNo(b.case_no, projectNoFromNotes(b.notes)) !== projectNo) continue;
    const isVet = (b.source || "").includes("euthanasia");
    const status = b.payment_status === "refunded" ? "已退款" : b.status || "—";
    records.push({ key: `b:${b.id}`, label: `${isVet ? "獸醫評估" : b.plan || "火化服務"} · ${b.pet_name || "—"}`, person: b.owner_name || "—", date: b.service_date || b.created_at?.slice(0, 10) || "—", status, amount: b.status === "cancelled" || b.payment_status === "refunded" || b.payment_status !== "paid" ? 0 : Number(b.amount ?? b.payment_amount ?? 0), href: `/projects/${b.id}` });
  }
  for (const order of (orderRes.data || []) as ProductOrderRow[]) {
    if (canonicalProjectNo(projectNoFromItems(order.line_items)) !== projectNo) continue;
    const financial = (order.financial_status || "").toLowerCase();
    const cancelled = !!order.cancelled_at || ["refunded", "partially_refunded", "voided"].includes(financial);
    records.push({ key: `o:${order.shopify_order_id}`, label: `紀念產品 · ${order.order_name}`, person: order.customer_name || "—", date: order.shopify_created_at?.slice(0, 10) || "—", status: cancelled ? "已取消／退款" : order.financial_status || "—", amount: cancelled ? 0 : Number(order.total_amount || 0), href: `/projects/order/${order.shopify_order_id.split("/").pop()}` });
  }

  const income = records.reduce((sum, record) => sum + record.amount, 0);
  if (!records.length) notFound();

  return (
    <div>
      <div className="mb-4 text-sm"><Link href="/projects" className="text-[var(--gold)] hover:underline">← 專案管理</Link></div>
      <h1 className="text-2xl font-semibold">{projectNo}</h1>
      <p className="mt-1 text-sm text-[var(--soft)]">此專案下的預約與訂單明細</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-lg">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"><div className="text-xs text-[var(--soft)]">記錄數</div><div className="mt-1 text-xl font-semibold">{records.length}</div></div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"><div className="text-xs text-[var(--soft)]">收入</div><div className="mt-1 text-xl font-semibold">{money(income)}</div></div>
      </div>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)]">
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr className="bg-[var(--head)] text-left text-[var(--soft)]"><th className="px-4 py-3 font-medium">服務／訂單</th><th className="px-4 py-3 font-medium">主人</th><th className="px-4 py-3 font-medium">日期</th><th className="px-4 py-3 font-medium">狀態</th><th className="px-4 py-3 text-right font-medium">收入</th><th className="px-4 py-3 text-right font-medium">明細</th></tr></thead>
          <tbody>{records.map((record) => <tr key={record.key} className="border-t border-[var(--line)]"><td className="px-4 py-3">{record.label}</td><td className="px-4 py-3">{record.person}</td><td className="px-4 py-3 whitespace-nowrap">{record.date}</td><td className="px-4 py-3">{record.status}</td><td className="px-4 py-3 text-right tabular-nums">{money(record.amount)}</td><td className="px-4 py-3 text-right"><Link className="text-[var(--gold)] hover:underline" href={record.href}>查看 →</Link></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
