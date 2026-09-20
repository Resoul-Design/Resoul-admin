import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Log = {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  delete_project: "刪除專案",
  update_booking: "更新預約",
  add_entry: "新增收支明細",
  delete_entry: "刪除收支明細",
  set_post_status: "留言改狀態",
  delete_post: "刪除留言",
  create_staff: "新增員工",
  update_staff: "更新員工",
  update_permissions: "更改權限",
};

export default async function AuditPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, created_at, actor_email, action, entity, entity_id, detail")
    .order("created_at", { ascending: false })
    .limit(500);
  const logs = (data ?? []) as Log[];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">審計記錄</h1>
      <p className="mb-6 text-sm text-[var(--soft)]">紀錄後台的重要操作（刪除、改狀態、改員工等），方便日後追查。</p>

      {error && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          尚未啟用審計記錄。請於 Supabase → SQL Editor 執行 <code>db/migration_audit_log.sql</code>。
        </div>
      )}

      {!error && logs.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-10 text-center text-[var(--soft)]">暫無記錄。</div>
      ) : !error && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-[var(--head)] text-left text-[var(--soft)] whitespace-nowrap">
                <th className="px-4 py-3 font-medium">時間</th>
                <th className="px-4 py-3 font-medium">操作人</th>
                <th className="px-4 py-3 font-medium">操作</th>
                <th className="px-4 py-3 font-medium">對象</th>
                <th className="px-4 py-3 font-medium">詳情</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-[var(--line)] align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{l.created_at?.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{l.actor_email || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{ACTION_LABEL[l.action] || l.action}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--soft)]">{l.entity || "—"}{l.entity_id ? ` · ${l.entity_id}` : ""}</td>
                  <td className="px-4 py-3 break-words">{l.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
