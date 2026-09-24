import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalProjectNo, projectNoFromItems, projectNoFromNotes } from "@/lib/order-label";
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
  source: string | null;
};
type Entry = { booking_id: string | null; order_ref: string | null; kind: string; amount: number };
type Deposit = {
  id: string; owner_name: string | null; pet_name: string | null; status: string;
  service_date: string | null; created_at: string; payment_amount: number | null;
  payment_status: string | null; shopify_order_name: string | null; notes: string | null;
};

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
  kind: "pickup" | "vet" | "cremation" | "product";
  income: number;
  expense: number;
  date: string;
  records?: { label: string; date: string; status: string; amount: number; href: string }[];
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const [bkRes, peRes, poRes, depRes] = await Promise.all([
    supabase
      .from("cremation_bookings")
      .select("id, case_no, pet_name, owner_name, plan, status, service_date, created_at, amount, payment_amount, payment_status, shopify_order_name, notes, source")
      .order("created_at", { ascending: false })
      .limit(1000),
    // select("*") 以容忍 order_ref 欄位尚未建立（migration 未跑）時不報錯
    supabase.from("project_entries").select("*"),
    supabase.from("product_orders").select("*").order("shopify_created_at", { ascending: false }).limit(500),
    admin.from("deposit_bookings").select("id, owner_name, pet_name, status, service_date, created_at, payment_amount, payment_status, shopify_order_name, notes").order("created_at", { ascending: false }).limit(1000),
  ]);
  const bookings = (bkRes.data ?? []) as Booking[];
  const entries = (peRes.data ?? []) as Entry[];
  const productOrders = (poRes.data ?? []) as ProductOrderRow[];
  const deposits = (depRes.data ?? []) as Deposit[];

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
  for (const d of deposits) {
    rows.push({
      key: "d:" + d.id,
      href: "/deposits",
      projectNo: canonicalProjectNo(d.shopify_order_name, projectNoFromNotes(d.notes)),
      primary: d.pet_name || "—",
      secondary: d.owner_name || "—",
      plan: "接送服務",
      status: STATUS_LABEL[d.status] || d.status,
      kind: "pickup",
      income: d.payment_status === "paid" ? Number(d.payment_amount || 0) : 0,
      expense: 0,
      date: d.service_date || d.created_at?.slice(0, 10) || "",
    });
  }
  for (const b of bookings) {
    const vet = (b.source || "").includes("euthanasia");
    const a = byBooking[b.id] || { income: 0, expense: 0 };
    const cancelled = b.status === "cancelled";
    const refunded = b.payment_status === "refunded";
    const paid = b.payment_status === "paid" ? (b.amount ?? b.payment_amount ?? 0) : 0;
    // 已取消／已退款：收入不計
    const income = cancelled || refunded ? 0 : a.income > 0 ? a.income : paid;
    rows.push({
      key: "b:" + b.id,
      href: `/projects/${b.id}`,
      projectNo: canonicalProjectNo(b.shopify_order_name, projectNoFromNotes(b.notes)),
      primary: b.pet_name || "—",
      secondary: b.owner_name || "—",
      plan: vet ? "獸醫評估" : b.plan || "火化服務",
      status: cancelled ? "已取消" : refunded ? "已退款" : STATUS_LABEL[b.status] || b.status,
      kind: vet ? "vet" : "cremation",
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
      projectNo: canonicalProjectNo(o.order_name, projectNoFromItems(o.line_items)),
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
  // 將跨服務的 RSL 編號合併為一個專案列；沒有 RSL 的舊資料仍獨立保留。
  const grouped = new Map<string, Row[]>();
  const combined: Row[] = [];
  for (const row of rows) {
    if (row.projectNo === "—") {
      combined.push(row);
      continue;
    }
    grouped.set(row.projectNo, [...(grouped.get(row.projectNo) || []), row]);
  }
  for (const [projectNo, items] of grouped) {
    const first = items[0];
    const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));
    const names = unique(items.map((item) => item.primary));
    const secondary = unique(items.map((item) => item.secondary));
    const plans = unique(items.map((item) => item.plan));
    const statuses = unique(items.map((item) => item.status));
    combined.push({
      ...first,
      key: `project:${projectNo}`,
      href: `/projects/group/${encodeURIComponent(projectNo)}`,
      primary: names.join("、"),
      secondary: secondary.join("、"),
      plan: plans.join("、"),
      status: statuses.join("、"),
      income: items.reduce((sum, item) => sum + item.income, 0),
      expense: items.reduce((sum, item) => sum + item.expense, 0),
      date: items.map((item) => item.date).filter(Boolean).sort().at(-1) || "",
      records: items.map((item) => ({
        label: `${item.plan} · ${item.status}`,
        date: item.date,
        status: item.status,
        amount: item.income,
        href: item.href,
      })),
    });
  }
  rows.splice(0, rows.length, ...combined);

  // 按專案編號由大至細排列；未有編號者排最後
  const numKey = (s: string) => {
    const m = s.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : -1;
  };
  rows.sort((x, y) => numKey(y.projectNo) - numKey(x.projectNo));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">專案管理</h1>
      <p className="mb-6 text-sm text-[var(--soft)]"><span className="font-medium text-[var(--ink)]">RSL-xxxxxx-xxxx</span> 會連結接送、火化及紀念產品；每次付款的 Shopify 發票編號則獨立保留。</p>

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
