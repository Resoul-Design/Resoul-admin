import { createClient } from "@/lib/supabase/server";
import { projectNoFromItems, projectNoFromNotes } from "@/lib/order-label";
import type { ProductOrderRow } from "@/lib/product-orders";
import { ProjectsTable } from "./_table";

export const dynamic = "force-dynamic";

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
  notes: string | null;
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
  kind: "cremation" | "product";
  income: number;
  expense: number;
  date: string;
};

export default async function ProjectsPage() {
  const supabase = await createClient();

  const [bkRes, peRes, poRes] = await Promise.all([
    supabase
      .from("cremation_bookings")
      .select("id, case_no, pet_name, owner_name, plan, status, service_date, created_at, amount, payment_amount, payment_status, shopify_order_name, notes")
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
    const cancelled = b.status === "cancelled";
    const refunded = b.payment_status === "refunded";
    const paid = b.payment_status === "paid" ? (b.amount ?? b.payment_amount ?? 0) : 0;
    // 已取消／已退款：收入不計
    const income = cancelled || refunded ? 0 : a.income > 0 ? a.income : paid;
    rows.push({
      key: "b:" + b.id,
      href: `/projects/${b.id}`,
      projectNo: projectNoFromNotes(b.notes),
      primary: b.pet_name || "—",
      secondary: b.owner_name || "—",
      plan: b.plan || "火化服務",
      status: cancelled ? "已取消" : refunded ? "已退款" : STATUS_LABEL[b.status] || b.status,
      kind: "cremation",
      income,
      expense: a.expense,
      date: b.service_date || b.created_at?.slice(0, 10) || "",
    });
  }
  for (const o of productOrders) {
    const a = byOrder[o.shopify_order_id] || { income: 0, expense: 0 };
    const fin = (o.financial_status || "").toLowerCase();
    const cancelled = !!o.cancelled_at;
    const refunded = fin === "refunded" || fin === "partially_refunded" || fin === "voided";
    // 已取消／已退款：收入不計
    const income = cancelled || refunded ? 0 : a.income > 0 ? a.income : Number(o.total_amount || 0);
    const items = (o.line_items || []).map((it) => `${it.title}×${it.quantity}`).join("、");
    rows.push({
      key: "o:" + o.shopify_order_id,
      href: `/projects/order/${o.shopify_order_id.split("/").pop()}`,
      projectNo: projectNoFromItems(o.line_items),
      primary: o.customer_name || "—",
      secondary: items || "產品訂單",
      plan: "紀念產品",
      status: cancelled ? "已取消" : FIN[o.financial_status || ""] || o.financial_status || "—",
      kind: "product",
      income,
      expense: a.expense,
      date: o.shopify_created_at?.slice(0, 10) || "",
    });
  }
  // 按專案編號（Shopify 訂單號）由大至細排列；未有編號者排最後
  const numKey = (s: string) => {
    const m = s.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : -1;
  };
  rows.sort((x, y) => numKey(y.projectNo) - numKey(x.projectNo));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">專案管理</h1>
      <p className="mb-6 text-sm text-[var(--soft)]">相同 RSL 專案編號會連結接送、火化及紀念產品；每次付款仍保留獨立發票編號。</p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無專案。預約火化記錄與產品訂單會成為專案。
        </div>
      ) : (
        <ProjectsTable rows={rows} />
      )}
    </div>
  );
}
