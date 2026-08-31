import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { addShift, deleteShift } from "../actions";

export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const inputCls =
  "px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)] text-sm";

type Shift = {
  id: string;
  staff_id: string;
  shift_date: string;
  start_time: string | null;
  end_time: string | null;
  role_note: string | null;
};
type StaffRow = { id: string; name: string | null; email: string };

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ wk?: string }>;
}) {
  const me = await getStaff();
  const isAdmin = me?.role === "admin";
  const sp = await searchParams;

  const today = new Date();
  let start: Date;
  if (sp.wk && /^\d{4}-\d{2}-\d{2}$/.test(sp.wk)) {
    start = new Date(sp.wk + "T00:00:00");
  } else {
    start = new Date(today);
    start.setDate(start.getDate() - start.getDay());
  }
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const prevWk = new Date(start);
  prevWk.setDate(start.getDate() - 7);
  const nextWk = new Date(start);
  nextWk.setDate(start.getDate() + 7);

  const supabase = await createClient();
  const [shiftsRes, staffRes] = await Promise.all([
    supabase
      .from("shifts")
      .select("*")
      .gte("shift_date", ymd(days[0]))
      .lte("shift_date", ymd(days[6]))
      .order("start_time", { ascending: true }),
    supabase.from("staff").select("id, name, email").eq("active", true),
  ]);
  const shifts = (shiftsRes.data ?? []) as Shift[];
  const staff = (staffRes.data ?? []) as StaffRow[];
  const nameOf = (id: string) => {
    const s = staff.find((x) => x.id === id);
    return s?.name || s?.email || "—";
  };
  const byDay: Record<string, Shift[]> = {};
  for (const s of shifts) (byDay[s.shift_date] = byDay[s.shift_date] || []).push(s);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">排更表</h1>
        <div className="flex gap-2 text-sm">
          <Link href={`/staff/roster?wk=${ymd(prevWk)}`} className="px-2.5 py-1 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]">← 上週</Link>
          <Link href="/staff/roster" className="px-2.5 py-1 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]">本週</Link>
          <Link href={`/staff/roster?wk=${ymd(nextWk)}`} className="px-2.5 py-1 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]">下週 →</Link>
        </div>
      </div>

      {isAdmin && (
        <details className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--card)]">
          <summary className="cursor-pointer list-none px-5 py-3.5 flex items-center gap-2 font-medium">
            <span className="text-[var(--gold)]">＋</span> 新增更表
          </summary>
          <form action={addShift} className="px-5 pb-5 pt-1 border-t border-[var(--line)] flex flex-wrap gap-3 items-end">
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">員工</span>
              <select name="staff_id" required className={inputCls}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name || s.email}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">日期</span>
              <input type="date" name="shift_date" required defaultValue={ymd(today)} className={inputCls} />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">開始</span>
              <input type="time" name="start_time" className={inputCls} />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">結束</span>
              <input type="time" name="end_time" className={inputCls} />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">崗位 / 備註</span>
              <input name="role_note" className={inputCls} placeholder="接送 / 火化 / 店務…" />
            </label>
            <button className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">加入</button>
          </form>
        </details>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
        {days.map((d) => {
          const key = ymd(d);
          const list = byDay[key] || [];
          const isToday = key === ymd(today);
          return (
            <div key={key} className={"rounded-xl border p-2 min-h-[120px] " + (isToday ? "border-[var(--gold)] bg-[var(--cream)]/40" : "border-[var(--line)] bg-[var(--card)]")}>
              <div className="text-xs text-[var(--soft)] mb-2">
                {WEEKDAYS[d.getDay()]} {d.getMonth() + 1}/{d.getDate()}
              </div>
              <div className="space-y-1.5">
                {list.map((s) => (
                  <div key={s.id} className="text-[11px] leading-tight rounded-md bg-[var(--card)] border border-[var(--line)] px-1.5 py-1">
                    <div className="font-medium truncate">{nameOf(s.staff_id)}</div>
                    <div className="text-[var(--soft)]">
                      {s.start_time ? s.start_time.slice(0, 5) : ""}
                      {s.end_time ? "–" + s.end_time.slice(0, 5) : ""}
                    </div>
                    {s.role_note && <div className="text-[var(--soft)]">{s.role_note}</div>}
                    {isAdmin && (
                      <form action={deleteShift}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-[10px] text-red-600 hover:underline mt-0.5">刪除</button>
                      </form>
                    )}
                  </div>
                ))}
                {list.length === 0 && <div className="text-[11px] text-[var(--faint)]">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
