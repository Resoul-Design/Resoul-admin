import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { todo: "待辦", doing: "進行中", done: "完成" };

export async function GET() {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  const supabase = await createClient();
  const [tasksRes, staffRes] = await Promise.all([
    supabase.from("tasks").select("title, detail, assignee, due_date, status, created_at").order("created_at", { ascending: false }),
    supabase.from("staff").select("id, name, email"),
  ]);
  const staff = staffRes.data ?? [];
  const nameOf = (id: string | null) => {
    if (!id) return "未指派";
    const s = staff.find((x) => x.id === id);
    return s?.name || s?.email || "";
  };

  const headers = ["任務", "詳情", "負責人", "到期日", "狀態", "建立"];
  const rows = (tasksRes.data ?? []).map((t) => [
    t.title, t.detail, nameOf(t.assignee), t.due_date, STATUS[t.status] || t.status, t.created_at?.slice(0, 10),
  ]);
  return csvResponse("tasks.csv", toCsv(headers, rows));
}
