import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { scheduleBooking, createBooking } from "./actions";

const PLANS = ["風之旅", "雲之旅", "星之旅"];

const STATUS_LABEL: Record<string, string> = {
  new: "新收到",
  scheduled: "已排期",
  pickup: "接送中",
  cremating: "火化中",
  completed: "已完成",
  cancelled: "已取消",
};
const statusLabel = (k: string) => STATUS_LABEL[k] || k;

export const dynamic = "force-dynamic";

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

  // 待安排：狀態為 new 或 未有日期
  const needScheduling = bookings.filter(
    (b) => b.status === "new" || !b.service_date
  );

  // 已排期：有日期且未完成/取消（不論月份，方便一覽）
  const scheduled = bookings
    .filter(
      (b) =>
        b.service_date &&
        b.status !== "new" &&
        b.status !== "completed" &&
        b.status !== "cancelled"
    )
    .sort((a, b) =>
      (a.service_date! + (a.service_time || "")).localeCompare(
        b.service_date! + (b.service_time || "")
      )
    );

  // 當月已排期
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
          className="px-5 pb-5 pt-1 border-t border-[var(--line)] grid sm:grid-cols-2 gap-3"
        >
          {[
            { name: "owner_name", label: "主人姓名" },
            { name: "contact", label: "聯絡（電話 / WhatsApp）" },
            { name: "pet_name", label: "毛孩名" },
            { name: "pet_type", label: "種類（貓 / 狗…）" },
          ].map((f) => (
            <label key={f.name} className="text-sm">
              <span className="block text-[var(--soft)] mb-1">{f.label}</span>
              <input
                name={f.name}
                className="w-full px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
              />
            </label>
          ))}

          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">方案</span>
            <select
              name="plan"
              defaultValue=""
              className="w-full px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
            >
              <option value="">未定</option>
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">接送地址</span>
            <input
              name="pickup_address"
              className="w-full px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
            />
          </label>

          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">服務日期</span>
            <input
              type="date"
              name="service_date"
              className="w-full px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
            />
          </label>

          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">服務時間</span>
            <input
              type="time"
              name="service_time"
              className="w-full px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)]"
            />
          </label>

          <label className="text-sm sm:col-span-2">
            <span className="block text-[var(--soft)] mb-1">預約要求 / 備註</span>
            <textarea
              name="notes"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)] resize-y"
            />
          </label>

          <div className="sm:col-span-2 flex justify-end">
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

      <div className="grid lg:grid-cols-3 gap-5">
        {/* 月曆 */}
        <div className="lg:col-span-2 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base">
              {y} 年 {m} 月
            </h2>
            <div className="flex gap-2 text-sm">
              <Link
                href={`/schedule?ym=${shiftYm(ym, -1)}`}
                className="px-2.5 py-1 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]"
              >
                ← 上月
              </Link>
              <Link
                href="/schedule"
                className="px-2.5 py-1 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]"
              >
                本月
              </Link>
              <Link
                href={`/schedule?ym=${shiftYm(ym, 1)}`}
                className="px-2.5 py-1 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]"
              >
                下月 →
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs text-[var(--soft)] mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => (
              <div
                key={i}
                className={
                  "min-h-[76px] rounded-lg border p-1.5 text-left " +
                  (d === null
                    ? "border-transparent"
                    : isToday(d)
                    ? "border-[var(--gold)] bg-[var(--cream)]/40"
                    : "border-[var(--line)]")
                }
              >
                {d !== null && (
                  <>
                    <div className="text-xs text-[var(--soft)] mb-1">{d}</div>
                    <div className="space-y-1">
                      {(byDay[d] || []).map((b) => (
                        <div
                          key={b.id}
                          className="text-[11px] leading-tight px-1.5 py-1 rounded bg-[var(--gold)] text-white truncate"
                          title={`${b.service_time?.slice(0, 5) || ""} ${b.pet_name || ""} ${b.owner_name || ""}（${b.plan || ""}）`}
                        >
                          {b.service_time ? b.service_time.slice(0, 5) + " " : ""}
                          {b.pet_name || b.owner_name || "預約"}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 待安排 */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <h2 className="text-base mb-1">待安排</h2>
          <p className="text-xs text-[var(--soft)] mb-4">
            未排期或新收到的預約，設定日子與時間後即排入月曆。
          </p>

          {needScheduling.length === 0 ? (
            <p className="text-sm text-[var(--soft)] py-6 text-center">目前沒有待安排的預約。</p>
          ) : (
            <div className="space-y-3">
              {needScheduling.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-[var(--line)] p-3 text-sm"
                >
                  <div className="font-medium">
                    {b.pet_name || "—"}
                    <span className="text-[var(--soft)] font-normal">
                      {b.pet_type ? `　${b.pet_type}` : ""}
                    </span>
                  </div>
                  <div className="text-[var(--soft)] text-xs mt-0.5">
                    {b.owner_name || "—"}
                    {b.contact ? `　·　${b.contact}` : ""}
                  </div>
                  {b.plan && (
                    <div className="text-[var(--soft)] text-xs">方案：{b.plan}</div>
                  )}
                  {b.pickup_address && (
                    <div className="text-[var(--soft)] text-xs">📍 {b.pickup_address}</div>
                  )}
                  {b.notes && (
                    <div className="text-[var(--soft)] text-xs mt-1">備註：{b.notes}</div>
                  )}

                  <form action={scheduleBooking} className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="id" value={b.id} />
                    <input
                      type="date"
                      name="service_date"
                      defaultValue={b.service_date || todayStr}
                      required
                      className="text-xs border border-[var(--line)] rounded-md px-2 py-1 bg-white"
                    />
                    <input
                      type="time"
                      name="service_time"
                      defaultValue={b.service_time || ""}
                      className="text-xs border border-[var(--line)] rounded-md px-2 py-1 bg-white"
                    />
                    <button className="text-xs px-3 py-1 rounded-md bg-[var(--gold)] text-white hover:opacity-90">
                      排期
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 已排期預約（不論月份，一覽即將到來） */}
      <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
        <h2 className="text-base mb-3">已排期預約</h2>
        {scheduled.length === 0 ? (
          <p className="text-sm text-[var(--soft)] py-4 text-center">尚未有已排期的預約。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--soft)] border-b border-[var(--line)]">
                  <th className="py-2 pr-3 font-medium">日期</th>
                  <th className="py-2 pr-3 font-medium">時間</th>
                  <th className="py-2 pr-3 font-medium">毛孩 / 主人</th>
                  <th className="py-2 pr-3 font-medium">方案</th>
                  <th className="py-2 pr-3 font-medium">狀態</th>
                  <th className="py-2 font-medium text-right">月曆</th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map((b) => (
                  <tr key={b.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{b.service_date}</td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {b.service_time ? b.service_time.slice(0, 5) : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <span>{b.pet_name || "—"}</span>
                      <span className="text-[var(--soft)]">
                        {b.owner_name ? `　·　${b.owner_name}` : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{b.plan || "—"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--cream)] text-[var(--soft)]">
                        {statusLabel(b.status)}
                      </span>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Link
                        href={`/schedule?ym=${b.service_date!.slice(0, 7)}`}
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
        )}
      </div>
    </div>
  );
}
