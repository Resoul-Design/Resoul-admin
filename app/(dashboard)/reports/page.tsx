import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BSTATUS: { key: string; label: string }[] = [
  { key: "new", label: "新收到" },
  { key: "scheduled", label: "已排期" },
  { key: "pickup", label: "接送中" },
  { key: "cremating", label: "火化中" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
];
const TSTATUS: { key: string; label: string }[] = [
  { key: "todo", label: "待辦" },
  { key: "doing", label: "進行中" },
  { key: "done", label: "完成" },
];

export default async function ReportsPage() {
  const supabase = await createClient();
  const [bkRes, tkRes] = await Promise.all([
    supabase.from("cremation_bookings").select("status, amount, cost").limit(2000),
    supabase.from("tasks").select("status").limit(2000),
  ]);
  const bookings = bkRes.data ?? [];
  const tasks = tkRes.data ?? [];

  const income = bookings.reduce((n, b) => n + (b.amount || 0), 0);
  const cost = bookings.reduce((n, b) => n + (b.cost || 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">報表與匯出</h1>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {/* 預約概況 */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <h2 className="text-base mb-3">預約概況</h2>
          <div className="space-y-1.5 text-sm">
            {BSTATUS.map((s) => (
              <div key={s.key} className="flex justify-between">
                <span className="text-[var(--soft)]">{s.label}</span>
                <span className="tabular-nums">{bookings.filter((b) => b.status === s.key).length}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-[var(--line)] pt-1.5 mt-1.5 font-medium">
              <span>總計</span>
              <span className="tabular-nums">{bookings.length}</span>
            </div>
          </div>
        </div>

        {/* 任務概況 */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <h2 className="text-base mb-3">任務概況</h2>
          <div className="space-y-1.5 text-sm">
            {TSTATUS.map((s) => (
              <div key={s.key} className="flex justify-between">
                <span className="text-[var(--soft)]">{s.label}</span>
                <span className="tabular-nums">{tasks.filter((t) => t.status === s.key).length}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-[var(--line)] pt-1.5 mt-1.5 font-medium">
              <span>總計</span>
              <span className="tabular-nums">{tasks.length}</span>
            </div>
          </div>
        </div>

        {/* 財務概況 */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
          <h2 className="text-base mb-3">火化收支（累計）</h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--soft)]">收入</span>
              <span className="tabular-nums">${Math.round(income).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--soft)]">成本</span>
              <span className="tabular-nums">${Math.round(cost).toLocaleString()}</span>
            </div>
            <div className="flex justify-between border-t border-[var(--line)] pt-1.5 mt-1.5 font-medium">
              <span>毛利</span>
              <span className="tabular-nums">${Math.round(income - cost).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 匯出 */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
        <h2 className="text-base mb-3">匯出 CSV</h2>
        <div className="flex flex-wrap gap-3">
          <a href="/api/export/bookings" className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">
            匯出預約火化記錄
          </a>
          <a href="/api/export/tasks" className="px-4 py-2 rounded-lg text-sm border border-[var(--line)] hover:bg-[var(--cream)]">
            匯出任務
          </a>
        </div>
      </div>
    </div>
  );
}
