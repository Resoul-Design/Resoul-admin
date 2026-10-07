import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { customerKey, phoneKey, type ProductOrderRow } from "@/lib/product-orders";
import { canonicalProjectNo, productOrderProjectNo, projectNoFromNotes } from "@/lib/order-label";
import { RecordTable, type RecordRow } from "./_record-table";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "新收到",
  contacted: "已聯絡",
  scheduled: "已排期",
  pickup: "已接送",
  cremating: "火化中",
  ready: "可取回",
  completed: "已完成",
  cancelled: "已取消",
};
const PAY_LABEL: Record<string, string> = {
  paid: "已付款",
  pending: "待付款",
  failed: "付款失敗",
  refunded: "已退款",
};

type Booking = {
  id: string;
  case_no: string | null;
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  pet_type: string | null;
  plan: string | null;
  status: string;
  service_date: string | null;
  service_time: string | null;
  amount: number | null;
  payment_amount: number | null;
  payment_status: string | null;
  payment_ref: string | null;
  shopify_order_name: string | null;
  notes: string | null;
  source: string | null;
  created_at: string;
};
type Deposit = {
  id: string;
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  status: string;
  service_date: string | null;
  service_time: string | null;
  payment_amount: number | null;
  payment_status: string | null;
  shopify_order_name: string | null;
  notes: string | null;
  created_at: string;
  project_no?: string | null;
};

function pickupProjectNo(row: Deposit) {
  return canonicalProjectNo(row.project_no, projectNoFromNotes(row.notes));
}

function projectNo(b: Booking): string {
  return canonicalProjectNo(b.case_no, projectNoFromNotes(b.notes));
}

const FUL: Record<string, string> = {
  FULFILLED: "已出貨",
  UNFULFILLED: "未出貨",
  PARTIALLY_FULFILLED: "部分出貨",
  RESTOCKED: "已退貨入庫",
};

// 日期及時間：預約日期＋時段；未有預約日期時用建立時間（香港時間）
const hkDateTime = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)}`;
};
const when = (date: string | null, time: string | null, created: string) =>
  date ? [date, time].filter(Boolean).join(" ") : hkDateTime(created);
const money = (n: number | null | undefined) => (n ? "$" + Math.round(Number(n)).toLocaleString() : "—");
const petText = (name: string | null, type?: string | null) => `毛孩：${name || "—"}${type ? `（${type}）` : ""}`;

const FIN: Record<string, string> = {
  PAID: "已付款",
  PENDING: "待付款",
  PARTIALLY_PAID: "部分付款",
  REFUNDED: "已退款",
  PARTIALLY_REFUNDED: "部分退款",
  VOIDED: "已作廢",
  DRAFT: "待付款（草稿）",
};

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);

  const supabase = await createClient();
  const admin = createAdminClient();
  const [{ data }, { data: pickupData }] = await Promise.all([
    createAdminClient().from("cremation_bookings").select("id, case_no, owner_name, contact, pet_name, pet_type, plan, status, service_date, service_time, amount, payment_amount, payment_status, payment_ref, shopify_order_name, notes, source, created_at").order("created_at", { ascending: false }).limit(1000),
    admin.from("deposit_bookings").select("id, project_no, owner_name, contact, pet_name, status, service_date, service_time, payment_amount, payment_status, shopify_order_name, notes, created_at").order("created_at", { ascending: false }).limit(1000),
  ]);

  // 客戶識別鍵與客戶檔案列表一致（電話尾 8 位，無電話用名稱）；舊連結以原始聯絡文字亦可配對
  const sameCustomer = (contact: string | null, name: string | null) =>
    customerKey(contact, name) === key || (contact || name || "未知").trim() === key;
  const allBookings = ((data ?? []) as Booking[]).filter((b) => sameCustomer(b.contact, b.owner_name));
  const vetBookings = allBookings.filter((b) => (b.source || "").includes("euthanasia"));
  const bookings = allBookings.filter((b) => !(b.source || "").includes("euthanasia"));
  const pickups = ((pickupData ?? []) as Deposit[]).filter((b) => sameCustomer(b.contact, b.owner_name));

  const name = allBookings.find((b) => b.owner_name)?.owner_name || pickups.find((b) => b.owner_name)?.owner_name || key || "客戶";
  const contact = allBookings.find((b) => b.contact)?.contact || pickups.find((b) => b.contact)?.contact || key;
  const pets = [...new Set([...allBookings, ...pickups].map((b) => b.pet_name).filter(Boolean))];
  const eff = (b: Booking) => b.amount ?? b.payment_amount ?? 0;

  // 火化：已付款預約金額
  const cremPaid = bookings
    .filter((b) => b.payment_status === "paid")
    .reduce((s, b) => s + eff(b), 0);
  const pickupPaid = pickups
    .filter((b) => b.payment_status === "paid" && b.status !== "cancelled")
    .reduce((s, b) => s + Number(b.payment_amount || 0), 0);

  // 產品銷售：直接從 Supabase 同步表按電話尾 8 位配對。
  const custPhone = phoneKey(contact);
  let productOrders: ProductOrderRow[] = [];
  if (custPhone) {
    const { data: orderData } = await supabase
      .from("product_orders")
      .select("*")
      .eq("phone_key", custPhone)
      .order("shopify_created_at", { ascending: false });
    productOrders = (orderData || []) as ProductOrderRow[];
  }
  // 未付款草稿：列出但不計入消費
  const draftOrders: ProductOrderRow[] = custPhone
    ? (await loadSouvenirDrafts())
        .filter((d) => d.phoneKey === custPhone)
        .map((d) => ({
          shopify_order_id: d.id,
          order_name: d.name,
          shopify_created_at: d.createdAt,
          shopify_updated_at: null,
          customer_name: d.owner,
          email: null,
          phone: d.phone,
          phone_key: d.phoneKey,
          financial_status: "DRAFT",
          fulfillment_status: null,
          total_amount: d.amount,
          currency: d.currency,
          line_items: d.items.map((it) => ({ title: it.title, quantity: it.quantity })) as ProductOrderRow["line_items"],
          cancelled_at: null,
          synced_at: d.createdAt,
        }))
    : [];
  const productSpend = productOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);
  productOrders = [...draftOrders, ...productOrders];

  // 四類記錄統一欄位：日期及時間、專案編號、訂單編號、內容、狀態、付款、金額
  const pickupRows: RecordRow[] = pickups.map((b) => ({
    key: b.id,
    when: when(b.service_date, b.service_time, b.created_at),
    project: pickupProjectNo(b),
    order: b.shopify_order_name || "—",
    content: `預約接送訂金 · ${petText(b.pet_name)}`,
    status: STATUS_LABEL[b.status] || b.status,
    payment: PAY_LABEL[b.payment_status || ""] || b.payment_status || "—",
    amount: money(b.payment_amount),
  }));
  const bookingRow = (b: Booking, label: string): RecordRow => ({
    key: b.id,
    when: when(b.service_date, b.service_time?.slice(0, 5) || null, b.created_at),
    project: projectNo(b),
    order: b.shopify_order_name || "—",
    content: `${label} · ${petText(b.pet_name, b.pet_type)}`,
    status: STATUS_LABEL[b.status] || b.status,
    payment: PAY_LABEL[b.payment_status || ""] || b.payment_status || "—",
    amount: money(eff(b)),
  });
  const vetRows = vetBookings.map((b) => bookingRow(b, "上門獸醫評估"));
  const cremationRows = bookings.map((b) => bookingRow(b, b.plan || "火化"));
  const productRows: RecordRow[] = productOrders.map((o) => ({
    key: o.shopify_order_id,
    when: hkDateTime(o.shopify_created_at),
    project: productOrderProjectNo(o),
    order: o.order_name,
    content: (o.line_items || []).map((item) => `${item.title}×${item.quantity}`).join("、") || "—",
    status: o.cancelled_at ? "已取消" : o.financial_status === "DRAFT" ? "草稿" : FUL[o.fulfillment_status || ""] || "未出貨",
    payment: FIN[o.financial_status || ""] || o.financial_status || "—",
    amount: money(Number(o.total_amount)),
  }));

  const stat = (label: string, value: string) => (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-4 py-3">
      <div className="text-xs text-[var(--soft)]">{label}</div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );

  return (
    <div>
      <Link href="/crm" className="text-sm text-[var(--gold)] hover:underline">
        ← 返回客戶檔案
      </Link>

      <div className="mt-3 mb-5">
        <h1 className="text-2xl font-semibold">{name}</h1>
        <div className="text-[var(--soft)] mt-1 text-sm">
          {contact}
          {pets.length > 0 && <>　·　毛孩：{pets.join("、")}</>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        {stat("接送服務", `${pickups.length} 次`)}
        {stat("接送消費（已付）", "$" + Math.round(pickupPaid).toLocaleString())}
        {stat("火化預約", `${bookings.length} 次`)}
        {stat("火化消費（已付）", "$" + Math.round(cremPaid).toLocaleString())}
        {stat("獸醫評估", `${vetBookings.length} 次`)}
        {stat("產品消費", `${productOrders.length - draftOrders.length} 張 · $${Math.round(productSpend).toLocaleString()}${draftOrders.length ? `（另有 ${draftOrders.length} 張待付款）` : ""}`)}
      </div>

      <RecordTable icon="◆" title="接送服務記錄" empty="未有接送服務記錄。" rows={pickupRows} />
      <RecordTable icon="✚" title="獸醫評估記錄" empty="未有獸醫評估記錄。" rows={vetRows} />
      <RecordTable icon="✦" title="火化預約記錄" empty="未有火化預約記錄。" rows={cremationRows} />
      <RecordTable icon="▣" title="產品銷售記錄" empty="未有以此電話配對到的產品訂單。" rows={productRows} />
    </div>
  );
}
