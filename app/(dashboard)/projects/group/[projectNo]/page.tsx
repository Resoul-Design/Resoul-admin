import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/auth";
import { canonicalProjectNo, isRslProjectNo, projectNoFromItems, projectNoFromNotes } from "@/lib/order-label";
import type { ProductOrderRow } from "@/lib/product-orders";

export const dynamic = "force-dynamic";

const money = (amount: number) => `${Math.round(amount).toLocaleString()} HKD`;

// 狀態及付款以中文顯示（接送服務、火化預約、獸醫評估及紀念品訂單共用）
const STATUS_LABEL: Record<string, string> = {
  new: "新收到",
  contacted: "已聯絡",
  scheduled: "已排期",
  pickup: "已接送",
  cremating: "火化中",
  ready: "可取回",
  completed: "已完成",
  cancelled: "已取消",
  FULFILLED: "已出貨",
  UNFULFILLED: "未出貨",
  PARTIALLY_FULFILLED: "部分出貨",
  RESTOCKED: "已退貨入庫",
  DRAFT: "草稿",
};
const PAYMENT_LABEL: Record<string, string> = {
  pending: "待付款",
  paid: "已付款",
  failed: "付款失敗",
  refunded: "已退款",
  PAID: "已付款",
  PENDING: "待付款",
  PARTIALLY_PAID: "部分付款",
  REFUNDED: "已退款",
  PARTIALLY_REFUNDED: "部分退款",
  VOIDED: "已作廢",
  AUTHORIZED: "已授權",
};

function statusClass(status: string) {
  switch (status) {
    case "new":
    case "UNFULFILLED":
      return "bg-amber-100 text-amber-800";
    case "contacted":
      return "bg-sky-100 text-sky-800";
    case "scheduled":
    case "pickup":
    case "cremating":
    case "PARTIALLY_FULFILLED":
      return "bg-blue-100 text-blue-800";
    case "completed":
    case "FULFILLED":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-200 text-gray-600";
  }
}

function paymentClass(payment: string) {
  switch (payment) {
    case "paid":
    case "PAID":
      return "bg-green-100 text-green-800";
    case "failed":
    case "VOIDED":
      return "bg-red-100 text-red-700";
    case "refunded":
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "bg-gray-200 text-gray-700";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

type ProjectRecord = {
  key: string;
  label: string;
  invoiceNo: string;
  person: string;
  date: string;
  status: string;
  payment: string;
  amount: number;
  href: string;
};

function Badge({ text, className }: { text: string; className: string }) {
  return <span className={"inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs " + className}>{text}</span>;
}

export default async function ProjectGroupPage({ params }: { params: Promise<{ projectNo: string }> }) {
  const staff = await getStaff();
  if (!staff) notFound();
  const { projectNo: rawProjectNo } = await params;
  const projectNo = decodeURIComponent(rawProjectNo).toUpperCase();
  if (!isRslProjectNo(projectNo)) notFound();

  const admin = createAdminClient();
  const draftsP = loadSouvenirDrafts();
  const [depositRes, bookingRes, orderRes] = await Promise.all([
    admin.from("deposit_bookings").select("id, owner_name, pet_name, status, service_date, created_at, payment_amount, payment_status, shopify_order_name, notes").order("created_at", { ascending: false }).limit(1000),
    admin.from("cremation_bookings").select("id, case_no, owner_name, pet_name, plan, status, service_date, created_at, amount, payment_amount, payment_status, shopify_order_name, notes, source").order("created_at", { ascending: false }).limit(1000),
    admin.from("product_orders").select("*").order("shopify_created_at", { ascending: false }).limit(1000),
  ]);
  const records: ProjectRecord[] = [];

  for (const d of depositRes.data || []) {
    if (canonicalProjectNo(projectNoFromNotes(d.notes)) !== projectNo) continue;
    records.push({
      key: `d:${d.id}`,
      label: `接送服務 · ${d.pet_name || "—"}`,
      invoiceNo: d.shopify_order_name || "",
      person: d.owner_name || "—",
      date: d.service_date || d.created_at?.slice(0, 10) || "—",
      status: d.status || "",
      payment: d.payment_status || "",
      amount: d.payment_status === "paid" ? Number(d.payment_amount || 0) : 0,
      href: "/deposits",
    });
  }
  for (const b of bookingRes.data || []) {
    if (canonicalProjectNo(b.case_no, projectNoFromNotes(b.notes)) !== projectNo) continue;
    const isVet = (b.source || "").includes("euthanasia");
    records.push({
      key: `b:${b.id}`,
      label: `${isVet ? "獸醫評估" : b.plan || "火化服務"} · ${b.pet_name || "—"}`,
      invoiceNo: b.shopify_order_name || "",
      person: b.owner_name || "—",
      date: b.service_date || b.created_at?.slice(0, 10) || "—",
      status: b.status || "",
      payment: b.payment_status || "",
      amount: b.status === "cancelled" || b.payment_status === "refunded" || b.payment_status !== "paid" ? 0 : Number(b.amount ?? b.payment_amount ?? 0),
      href: `/projects/${b.id}`,
    });
  }
  for (const order of (orderRes.data || []) as ProductOrderRow[]) {
    if (canonicalProjectNo(projectNoFromItems(order.line_items)) !== projectNo) continue;
    const financial = (order.financial_status || "").toUpperCase();
    const cancelled = !!order.cancelled_at || ["REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"].includes(financial);
    // 訂單號已列在「發票編號」，此處顯示產品名稱
    const items = order.line_items || [];
    const first = items[0]?.title || "—";
    records.push({
      key: `o:${order.shopify_order_id}`,
      label: `紀念產品 · ${first}${items.length > 1 ? ` 等 ${items.length} 項` : ""}`,
      invoiceNo: order.order_name || "",
      person: order.customer_name || "—",
      date: order.shopify_created_at?.slice(0, 10) || "—",
      status: order.cancelled_at ? "cancelled" : (order.fulfillment_status || "").toUpperCase(),
      payment: financial,
      amount: cancelled ? 0 : Number(order.total_amount || 0),
      href: `/projects/order/${order.shopify_order_id.split("/").pop()}`,
    });
  }

  for (const d of await draftsP) {
    if (d.projectNo !== projectNo) continue;
    const first = d.items[0]?.title || "—";
    records.push({
      key: `draft:${d.id}`,
      label: `紀念產品 · ${first}${d.items.length > 1 ? ` 等 ${d.items.length} 項` : ""}`,
      invoiceNo: d.name,
      person: d.owner || "—",
      date: d.createdAt.slice(0, 10),
      status: "DRAFT",
      payment: "PENDING",
      amount: 0,
      href: `/orders?q=${encodeURIComponent(d.name)}`,
    });
  }

  const income = records.reduce((sum, record) => sum + record.amount, 0);
  if (!records.length) notFound();

  const statusText = (r: ProjectRecord) => STATUS_LABEL[r.status] || r.status || "—";
  const paymentText = (r: ProjectRecord) => PAYMENT_LABEL[r.payment] || r.payment || "—";

  return (
    <div>
      <div className="mb-4 text-sm"><Link href="/projects" className="text-[var(--gold)] hover:underline">← 專案管理</Link></div>
      <h1 className="text-2xl font-semibold">{projectNo}</h1>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-lg">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"><div className="text-xs text-[var(--soft)]">記錄數</div><div className="mt-1 text-xl font-semibold">{records.length}</div></div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"><div className="text-xs text-[var(--soft)]">收入</div><div className="mt-1 text-xl font-semibold">{money(income)}</div></div>
      </div>
      <div className="mt-5 hidden overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)] md:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="bg-[var(--head)] text-left text-[var(--soft)] whitespace-nowrap">
              <th className="px-4 py-3 font-medium">服務／訂單</th>
              <th className="px-4 py-3 font-medium">發票編號</th>
              <th className="px-4 py-3 font-medium">主人</th>
              <th className="px-4 py-3 font-medium">日期</th>
              <th className="px-4 py-3 font-medium">狀態</th>
              <th className="px-4 py-3 font-medium">付款</th>
              <th className="px-4 py-3 text-right font-medium">收入</th>
              <th className="px-4 py-3 text-right font-medium">明細</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.key} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">{record.label}</td>
                <td className="px-4 py-3 whitespace-nowrap">{record.invoiceNo ? <span className="font-medium text-[var(--gold)]">{record.invoiceNo}</span> : <span className="text-[var(--faint)]">—</span>}</td>
                <td className="px-4 py-3">{record.person}</td>
                <td className="px-4 py-3 whitespace-nowrap">{record.date}</td>
                <td className="px-4 py-3"><Badge text={statusText(record)} className={statusClass(record.status)} /></td>
                <td className="px-4 py-3">{record.payment ? <Badge text={paymentText(record)} className={paymentClass(record.payment)} /> : <span className="text-[var(--faint)]">—</span>}</td>
                <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{money(record.amount)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap"><Link className="text-[var(--gold)] hover:underline" href={record.href}>查看 →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 space-y-3 md:hidden">
        {records.map((record) => (
          <div key={record.key} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-medium">{record.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{money(record.amount)}</span>
            </div>
            <div className="mt-1 text-sm text-[var(--soft)]">
              {record.invoiceNo && <><span className="text-[var(--gold)]">{record.invoiceNo}</span>　·　</>}
              {record.person}　·　{record.date}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3 text-xs">
              <div className="flex flex-wrap gap-1.5">
                <Badge text={statusText(record)} className={statusClass(record.status)} />
                {record.payment && <Badge text={paymentText(record)} className={paymentClass(record.payment)} />}
              </div>
              <Link className="shrink-0 text-[var(--gold)] hover:underline" href={record.href}>查看 →</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
