import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { phoneKey, type ProductOrderRow } from "@/lib/product-orders";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "新收到",
  scheduled: "已排期",
  pickup: "接送中",
  cremating: "火化中",
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
  notes: string | null;
  created_at: string;
};

const FIN: Record<string, string> = {
  PAID: "已付款",
  PENDING: "待付款",
  PARTIALLY_PAID: "部分付款",
  REFUNDED: "已退款",
  PARTIALLY_REFUNDED: "部分退款",
  VOIDED: "已作廢",
};

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);

  const supabase = await createClient();
  const { data } = await supabase
    .from("cremation_bookings")
    .select(
      "id, owner_name, contact, pet_name, pet_type, plan, status, service_date, service_time, amount, payment_amount, payment_status, notes, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  // 以「聯絡 || 主人名」為客戶識別鍵，與客戶檔案列表一致
  const bookings = ((data ?? []) as Booking[]).filter(
    (b) => (b.contact || b.owner_name || "未知").trim() === key
  );

  const name = bookings.find((b) => b.owner_name)?.owner_name || key || "客戶";
  const contact = bookings.find((b) => b.contact)?.contact || key;
  const pets = [...new Set(bookings.map((b) => b.pet_name).filter(Boolean))];
  const eff = (b: Booking) => b.amount ?? b.payment_amount ?? 0;

  // 火化：已付款預約金額
  const cremPaid = bookings
    .filter((b) => b.payment_status === "paid")
    .reduce((s, b) => s + eff(b), 0);

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
  const productSpend = productOrders.reduce((sum, order) => sum + Number(order.total_amount), 0);

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stat("火化預約", `${bookings.length} 次`)}
        {stat("火化消費（已付）", "$" + Math.round(cremPaid).toLocaleString())}
        {stat("產品銷售", `${productOrders.length} 張`)}
        {stat("產品消費", "$" + Math.round(productSpend).toLocaleString())}
      </div>

      {/* 火化預約記錄 */}
      <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
        <span className="text-[var(--gold)]">✦</span> 火化預約記錄
      </h2>
      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-8 text-center text-[var(--soft)] mb-8">
          未有火化預約記錄。
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto mb-8">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)] whitespace-nowrap">
                <th className="px-4 py-3 font-medium">日期</th>
                <th className="px-4 py-3 font-medium">毛孩</th>
                <th className="px-4 py-3 font-medium">方案</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium">付款</th>
                <th className="px-4 py-3 font-medium text-right">金額</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-[var(--line)] whitespace-nowrap">
                  <td className="px-4 py-3">{b.service_date || b.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3">{b.pet_name || "—"}</td>
                  <td className="px-4 py-3">{b.plan || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                      {STATUS_LABEL[b.status] || b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {b.payment_status ? PAY_LABEL[b.payment_status] || b.payment_status : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {eff(b) ? "$" + Math.round(eff(b)).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 產品銷售記錄 */}
      <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
        <span className="text-[var(--gold)]">▣</span> 產品銷售記錄
      </h2>
      {productOrders.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-8 text-center text-[var(--soft)]">
          未有以此電話配對到的產品訂單。
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)] whitespace-nowrap">
                <th className="px-4 py-3 font-medium">日期</th>
                <th className="px-4 py-3 font-medium">訂單</th>
                <th className="px-4 py-3 font-medium">內容</th>
                <th className="px-4 py-3 font-medium">付款</th>
                <th className="px-4 py-3 font-medium text-right">金額</th>
              </tr>
            </thead>
            <tbody>
              {productOrders.map((o) => (
                <tr key={o.shopify_order_id} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{o.shopify_created_at.slice(0, 10)}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium">{o.order_name}</td>
                  <td className="px-4 py-3 text-[var(--soft)]">
                    {(o.line_items || []).map((item) => `${item.title}×${item.quantity}`).join("、") || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {FIN[o.financial_status || ""] || o.financial_status || "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    ${Number(o.total_amount).toLocaleString()}
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
