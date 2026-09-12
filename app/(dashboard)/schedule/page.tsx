import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createBooking } from "./actions";

export const dynamic = "force-dynamic";

const PLANS = ["風之旅", "雲之旅", "星之旅"];

type Booking = {
  id: string;
  owner_name: string | null;
  contact: string | null;
  pet_name: string | null;
  pet_type: string | null;
  plan: string | null;
  pickup_address: string | null;
  notes: string | null;
  status: string;
  service_date: string | null;
  service_time: string | null;
  created_at: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
function shiftYm(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const inputCls =
  "px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)] text-sm";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const now = new Date();
  const { ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}` } = await searchParams;
  const [y, m] = ym.split("-").map(Number);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cremation_bookings")
    .select(
      "id, owner_name, contact, pet_name, pet_type, plan, pickup_address, notes, status, service_date, service_time, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  const bookings = (data ?? []) as Booking[];

  const monthPrefix = `${y}-${pad(m)}`;
  const byDay: Record<number, Booking[]> = {};
  for (const b of bookings) {
    if (b.service_date && b.service_date.startsWith(monthPrefix)) {
      const day = Number(b.service_date.slice(8, 10));
      (byDay[day] = byDay[day] || []).push(b);
    }
  }
  for (const day in byDay) {
    byDay[day].sort((a, b) => (a.service_time || "").localeCompare(b.service_time || ""));
  }

  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const isToday = (d: number) => `${y}-${pad(m)}-${pad(d)}` === todayStr;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">安排火化服務</h1>

      {/* 新增預約 */}
      <details className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--card)]">
        <summary className="cursor-pointer list-none px-5 py-3.5 flex items-center gap-2 font-medium">
          <span className="text-[var(--gold)]">＋</span> 新增預約
        </summary>
        <form
          action={createBooking}
          className="px-5 pb-5 pt-1 border-t border-[var(--line)] grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          {[
            { name: "owner_name", label: "主人姓名" },
            { name: "contact", label: "電話 / 聯絡" },
            { name: "pet_name", label: "毛孩名" },
            { name: "pet_type", label: "種類（貓 / 狗…）" },
          ].map((f) => (
            <label key={f.name} className="text-sm">
              <span className="block text-[var(--soft)] mb-1">{f.label}</span>
              <input name={f.name} className={inputCls + " w-full"} />
            </label>
          ))}
          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">方案</span>
            <select name="plan" defaultValue="" className={inputCls + " w-full"}>
              <option value="">未定</option>
              {PLANS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">接送地址</span>
            <input name="pickup_address" className={inputCls + " w-full"} />
          </label>
          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">服務日期</span>
            <input type="date" name="service_date" className={inputCls + " w-full"} />
          </label>
          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">服務時間</span>
            <input type="time" name="service_time" className={inputCls + " w-full"} />
          </label>
          <label className="text-sm lg:col-span-3 sm:col-span-2">
            <span className="block text-[var(--soft)] mb-1">預約要求 / 備註</span>
            <textarea name="notes" rows={2} className={inputCls + " w-full resize-y"} />
          </label>
          <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
            <button className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">
              新增預約
            </button>
          </div>
        </form>
      </details>

      {error && (
        <div className="mb-4 rounded-xl border border-red-300 bg-[var(--card)] p-4 text-sm text-red-600">
          讀取失敗：{error.message}
          <div className="text-[var(--soft)] mt-1">
            如提示欄位不存在，請先於 Supabase 執行 db/migration_schedule.sql（新增 service_time 欄）。
          </div>
        </div>
      )}

      {/* 月曆（全闊） */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 mb-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">
            {y} 年 {m} 月
          </h2>
          <div className="flex gap-2 text-sm">
            <Link href={`/schedule?ym=${shiftYm(ym, -1)}`} className="px-3 py-1.5 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]">← 上月</Link>
            <Link href="/schedule" className="px-3 py-1.5 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]">本月</Link>
            <Link href={`/schedule?ym=${shiftYm(ym, 1)}`} className="px-3 py-1.5 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]">下月 →</Link>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-sm text-[var(--soft)] mb-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((d, i) => (
            <div
              key={i}
              className={
                "min-h-[132px] rounded-lg border p-2 text-left " +
                (d === null
                  ? "border-transparent"
                  : isToday(d)
                  ? "border-[var(--gold)] bg-[var(--cream)]/40"
                  : "border-[var(--line)]")
              }
            >
              {d !== null && (
                <>
                  <div className="text-sm text-[var(--soft)] mb-1.5">{d}</div>
                  <div className="space-y-1">
                    {(byDay[d] || []).map((b) => (
                      <div
                        key={b.id}
                        className="text-xs leading-snug px-2 py-1.5 rounded-md bg-[var(--gold)] text-white break-words"
                        title={`${b.service_time?.slice(0, 5) || ""} ${b.pet_name || ""} ${b.owner_name || ""}（${b.plan || ""}）${b.contact || ""}`}
                      >
                        {b.service_time && (
                          <div className="font-medium tabular-nums">{b.service_time.slice(0, 5)}</div>
                        )}
                        <div className="break-words">{b.pet_name || "預約"}</div>
                        <div className="break-words opacity-90">{b.owner_name || ""}{b.plan ? " · " + b.plan : ""}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
