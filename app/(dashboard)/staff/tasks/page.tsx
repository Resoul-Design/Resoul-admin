import { createClient } from "@/lib/supabase/server";
import { createTask, updateTaskStatus, deleteTask } from "../actions";

export const dynamic = "force-dynamic";

const inputCls =
  "px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)] text-sm";

type Task = {
  id: string;
  title: string;
  detail: string | null;
  booking_id: string | null;
  assignee: string | null;
  due_date: string | null;
  status: string;
};
type StaffRow = { id: string; name: string | null; email: string };
type BookingRow = { id: string; pet_name: string | null; case_no: string | null; owner_name: string | null };

const STATUS = [
  { key: "todo", label: "待辦", cls: "bg-amber-100 text-amber-800" },
  { key: "doing", label: "進行中", cls: "bg-blue-100 text-blue-800" },
  { key: "done", label: "完成", cls: "bg-green-100 text-green-800" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "todo" } = await searchParams;
  const supabase = await createClient();

  const [tasksRes, staffRes, bookingsRes] = await Promise.all([
    supabase.from("tasks").select("*").order("created_at", { ascending: false }).limit(300),
    supabase.from("staff").select("id, name, email").eq("active", true),
    supabase
      .from("cremation_bookings")
      .select("id, pet_name, case_no, owner_name")
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  const allTasks = (tasksRes.data ?? []) as Task[];
  const staff = (staffRes.data ?? []) as StaffRow[];
  const bookings = (bookingsRes.data ?? []) as BookingRow[];

  const tasks = filter === "all" ? allTasks : allTasks.filter((t) => t.status === filter);
  const nameOf = (id: string | null) => {
    if (!id) return "未指派";
    const s = staff.find((x) => x.id === id);
    return s?.name || s?.email || "—";
  };
  const bookingOf = (id: string | null) => {
    if (!id) return null;
    const b = bookings.find((x) => x.id === id);
    return b ? `${b.case_no ? b.case_no + " · " : ""}${b.pet_name || b.owner_name || "預約"}` : null;
  };

  const tabs = [
    { key: "todo", label: "待辦" },
    { key: "doing", label: "進行中" },
    { key: "done", label: "完成" },
    { key: "all", label: "全部" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">任務指派</h1>

      {/* 新增任務 */}
      <details className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--card)]">
        <summary className="cursor-pointer list-none px-5 py-3.5 flex items-center gap-2 font-medium">
          <span className="text-[var(--gold)]">＋</span> 新增任務
        </summary>
        <form action={createTask} className="px-5 pb-5 pt-1 border-t border-[var(--line)] grid sm:grid-cols-2 gap-3">
          <label className="text-sm sm:col-span-2">
            <span className="block text-[var(--soft)] mb-1">任務標題</span>
            <input name="title" required className={inputCls + " w-full"} placeholder="如 接送小明的貓 Testing" />
          </label>
          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">指派給</span>
            <select name="assignee" defaultValue="" className={inputCls + " w-full"}>
              <option value="">未指派</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name || s.email}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">關聯預約（選填）</span>
            <select name="booking_id" defaultValue="" className={inputCls + " w-full"}>
              <option value="">無</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {(b.case_no ? b.case_no + " · " : "") + (b.pet_name || b.owner_name || "預約")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">到期日</span>
            <input type="date" name="due_date" className={inputCls + " w-full"} />
          </label>
          <label className="text-sm">
            <span className="block text-[var(--soft)] mb-1">詳情</span>
            <input name="detail" className={inputCls + " w-full"} />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">新增</button>
          </div>
        </form>
      </details>

      {/* 篩選 */}
      <div className="flex gap-2 mb-5">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/staff/tasks?filter=${t.key}`}
            className={
              "px-3 py-1.5 rounded-full text-sm border transition " +
              (filter === t.key
                ? "bg-[var(--gold)] text-white border-[var(--gold)]"
                : "bg-[var(--card)] text-[var(--soft)] border-[var(--line)] hover:bg-[var(--cream)]")
            }
          >
            {t.label}
          </a>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">
          此分類暫無任務。
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const st = STATUS.find((s) => s.key === t.status);
            const bk = bookingOf(t.booking_id);
            const overdue = t.due_date && t.status !== "done" && t.due_date < new Date().toISOString().slice(0, 10);
            return (
              <div key={t.id} className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 flex flex-wrap items-center gap-3">
                <span className={"text-xs px-2 py-0.5 rounded-full " + (st?.cls || "")}>{st?.label || t.status}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-[var(--soft)] flex flex-wrap gap-x-3 mt-0.5">
                    <span>👤 {nameOf(t.assignee)}</span>
                    {bk && <span>🔗 {bk}</span>}
                    {t.due_date && (
                      <span className={overdue ? "text-red-600" : ""}>📅 {t.due_date}{overdue ? "（逾期）" : ""}</span>
                    )}
                    {t.detail && <span>{t.detail}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {STATUS.filter((s) => s.key !== t.status).map((s) => (
                    <form key={s.key} action={updateTaskStatus}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="status" value={s.key} />
                      <button className="text-xs px-2.5 py-1 rounded-md border border-[var(--line)] hover:bg-[var(--cream)]">
                        {s.label}
                      </button>
                    </form>
                  ))}
                  <form action={deleteTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-xs px-2.5 py-1 rounded-md text-red-600 hover:bg-red-50">刪除</button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
