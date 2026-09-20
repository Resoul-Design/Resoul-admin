import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Booking = {
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  plan: string | null;
  status: string;
  service_date: string | null;
  amount: number | null;
  payment_amount: number | null;
  created_at: string;
};

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
  const supabase = await createClient();
  const { data } = await supabase
    .from("cremation_bookings")
    .select("owner_name, contact, pet_name, plan, status, service_date, amount, payment_amount, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  const bookings = (data ?? []) as Booking[];

  const map = new Map<string, Customer>();
  for (const b of bookings) {
    const key = (b.contact || b.owner_name || "未知").trim();
    let c = map.get(key);
    if (!c) {
      c = {
        key,
        name: b.owner_name || "—",
        contact: b.contact,
        pets: new Set(),
        count: 0,
        spend: 0,
        last: b.service_date || b.created_at.slice(0, 10),
      };
      map.set(key, c);
    }
    if (b.pet_name) c.pets.add(b.pet_name);
    c.count += 1;
    c.spend += b.amount ?? b.payment_amount ?? 0;
    const d = b.service_date || b.created_at.slice(0, 10);
    if (d > c.last) c.last = d;
    if (b.owner_name && c.name === "—") c.name = b.owner_name;
  }
  const customers = [...map.values()].sort((a, b) => b.last.localeCompare(a.last));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">客戶檔案</h1>

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
                <th className="px-4 py-3 font-medium text-right">預約次數</th>
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
                <span className="text-[var(--soft)]">預約 <span className="tabular-nums text-[var(--ink)]">{c.count}</span> 次</span>
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
