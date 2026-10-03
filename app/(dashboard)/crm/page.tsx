import { PageHeader } from "../_page-header";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { customerKey, type ProductOrderRow } from "@/lib/product-orders";
import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";

export const dynamic = "force-dynamic";

type Booking = {
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  status: string;
  service_date: string | null;
  amount?: number | null;
  payment_amount: number | null;
  payment_status: string | null;
  created_at: string;
};

// 一筆客戶記錄（預約、紀念品訂單或草稿）：paid＝已付款金額（未付款／取消為 0）
type Entry = { name: string | null; contact: string | null; pet: string | null; date: string; paid: number };

type Customer = {
  key: string;
  name: string;
  contact: string | null;
  pets: Set<string>;
  count: number;
  spend: number;
  last: string;
};

export default async function CrmPage() {
  const admin = createAdminClient();
  const [{ data }, { data: pickupData }, { data: orderData }, drafts] = await Promise.all([
    admin.from("cremation_bookings").select("owner_name, contact, pet_name, status, service_date, amount, payment_amount, payment_status, created_at").order("created_at", { ascending: false }).limit(1000),
    admin.from("deposit_bookings").select("owner_name, contact, pet_name, status, service_date, payment_amount, payment_status, created_at").order("created_at", { ascending: false }).limit(1000),
    admin.from("product_orders").select("customer_name, phone, total_amount, financial_status, cancelled_at, shopify_created_at").order("shopify_created_at", { ascending: false }).limit(1000),
    loadSouvenirDrafts(),
  ]);
  const paidBooking = (b: Booking) =>
    b.payment_status === "paid" && b.status !== "cancelled" ? Number(b.amount ?? b.payment_amount ?? 0) : 0;
  const entries: Entry[] = [
    ...((data ?? []) as Booking[]).map((b) => ({ name: b.owner_name, contact: b.contact, pet: b.pet_name, date: b.service_date || b.created_at.slice(0, 10), paid: paidBooking(b) })),
    ...((pickupData ?? []) as Booking[]).map((b) => ({ name: b.owner_name, contact: b.contact, pet: b.pet_name, date: b.service_date || b.created_at.slice(0, 10), paid: paidBooking(b) })),
    ...((orderData ?? []) as Pick<ProductOrderRow, "customer_name" | "phone" | "total_amount" | "financial_status" | "cancelled_at" | "shopify_created_at">[]).map((o) => ({
      name: o.customer_name,
      contact: o.phone,
      pet: null,
      date: o.shopify_created_at.slice(0, 10),
      paid: o.cancelled_at || ["REFUNDED", "PARTIALLY_REFUNDED", "VOIDED"].includes(o.financial_status || "") ? 0 : Number(o.total_amount || 0),
    })),
    // 未付款的紀念品草稿：計入記錄數，不計消費
    ...drafts.map((d) => ({ name: d.owner, contact: d.phone, pet: null, date: d.createdAt.slice(0, 10), paid: 0 })),
  ];

  const map = new Map<string, Customer>();
  for (const e of entries) {
    const key = customerKey(e.contact, e.name);
    let c = map.get(key);
    if (!c) {
      c = { key, name: e.name || "—", contact: e.contact, pets: new Set(), count: 0, spend: 0, last: e.date };
      map.set(key, c);
    }
    if (e.pet) c.pets.add(e.pet);
    c.count += 1;
    c.spend += e.paid;
    if (e.date > c.last) c.last = e.date;
    if (e.name && c.name === "—") c.name = e.name;
    if (!c.contact && e.contact) c.contact = e.contact;
  }
  const customers = [...map.values()].sort((a, b) => b.last.localeCompare(a.last));

  return (
    <div>
      <PageHeader title="客戶檔案" />

      {customers.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          暫無客戶資料。
        </div>
      ) : (
        <><div className="hidden md:block rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
                <th className="px-4 py-3 font-medium">客戶</th>
                <th className="px-4 py-3 font-medium">聯絡</th>
                <th className="px-4 py-3 font-medium">毛孩</th>
                <th className="px-4 py-3 font-medium text-right">記錄數</th>
                <th className="px-4 py-3 font-medium text-right">累計消費</th>
                <th className="px-4 py-3 font-medium">最近服務</th>
                <th className="px-4 py-3 font-medium text-right">檔案</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.key} className="border-t border-[var(--line)] hover:bg-[var(--cream)]/40">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/crm/${encodeURIComponent(c.key)}`}
                      className="text-[var(--ink)] hover:text-[var(--gold)] hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--soft)]">{c.contact || "—"}</td>
                  <td className="px-4 py-3 text-[var(--soft)]">
                    {[...c.pets].join("、") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.count}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    ${Math.round(c.spend).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-[var(--soft)] whitespace-nowrap">{c.last}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/crm/${encodeURIComponent(c.key)}`}
                      className="text-xs text-[var(--gold)] hover:underline"
                    >
                      查看 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {customers.map((c) => (
            <Link key={c.key} href={`/crm/${encodeURIComponent(c.key)}`} className="block rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-[var(--soft)]">{c.last}</span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--soft)]">{c.contact || "—"}</div>
              {[...c.pets].length > 0 && <div className="mt-1 text-sm">毛孩：{[...c.pets].join("、")}</div>}
              <div className="mt-2 flex items-center gap-4 text-xs">
                <span className="text-[var(--soft)]">記錄 <span className="tabular-nums text-[var(--ink)]">{c.count}</span> 筆</span>
                <span className="ml-auto font-medium">累計 <span className="tabular-nums">${Math.round(c.spend).toLocaleString()}</span></span>
              </div>
            </Link>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
