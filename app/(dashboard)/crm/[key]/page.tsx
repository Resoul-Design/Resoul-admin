import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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

  const name =
    bookings.find((b) => b.owner_name)?.owner_name || key || "客戶";
  const contact = bookings.find((b) => b.contact)?.contact || key;
  const pets = [...new Set(bookings.map((b) => b.pet_name).filter(Boolean))];
  const eff = (b: Booking) => b.amount ?? b.payment_amount ?? 0;
  const spend = bookings.reduce((s, b) => s + eff(b), 0);
  const paidSpend = bookings
    .filter((b) => b.payment_status === "paid")
    .reduce((s, b) => s + eff(b), 0);

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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stat("預約次數", String(bookings.length))}
        {stat("累計消費", "$" + Math.round(spend).toLocaleString())}
        {stat("已付款金額", "$" + Math.round(paidSpend).toLocaleString())}
        {stat("毛孩數目", String(pets.length))}
      </div>

      <h2 className="text-base font-semibold mb-3">購買 / 服務記錄</h2>

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          未有此客戶的記錄。
        </div>
      ) : (
        <>
          {/* 桌面表格 */}
          <div className="hidden md:block rounded-2xl border border-[var(--line)] bg-[var(--card)]">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                  <th className="px-4 py-3 font-medium w-[14%]">日期</th>
                  <th className="px-4 py-3 font-medium">毛孩</th>
                  <th className="px-4 py-3 font-medium">方案</th>
                  <th className="px-4 py-3 font-medium w-[12%]">狀態</th>
                  <th className="px-4 py-3 font-medium w-[12%]">付款</th>
                  <th className="px-4 py-3 font-medium text-right w-[14%]">金額</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-t border-[var(--line)] align-top">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {b.service_date || b.created_at.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 break-words">{b.pet_name || "—"}</td>
                    <td className="px-4 py-3 break-words">{b.plan || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                        {STATUS_LABEL[b.status] || b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {b.payment_status
                        ? PAY_LABEL[b.payment_status] || b.payment_status
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                      {eff(b) ? "$" + Math.round(eff(b)).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 手機卡片 */}
          <div className="md:hidden space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{b.pet_name || "—"}</span>
                  <span className="text-xs text-[var(--soft)]">
                    {b.service_date || b.created_at.slice(0, 10)}
                  </span>
                </div>
                <div className="mt-1 text-sm text-[var(--soft)]">{b.plan || "—"}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                    {STATUS_LABEL[b.status] || b.status}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                    {b.payment_status ? PAY_LABEL[b.payment_status] || b.payment_status : "—"}
                  </span>
                  <span className="ml-auto font-medium text-[var(--ink)]">
                    {b.amount ? "$" + Math.round(b.amount).toLocaleString() : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
