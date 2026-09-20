import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { createStaff, updateStaff } from "./actions";
import { ConfirmSubmitButton } from "./_confirm";
import { PermsButton } from "./_perms";

export const dynamic = "force-dynamic";

type Staff = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  permissions: string[] | null;
  created_at: string;
};

const inputCls =
  "px-3 py-2 rounded-lg border border-[var(--line)] bg-white outline-none focus:border-[var(--gold)] text-sm";

export default async function StaffPage() {
  const me = await getStaff();
  const isAdmin = me?.role === "admin";
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff")
    .select("*")
    .order("created_at", { ascending: true });
  const staff = (data ?? []) as Staff[];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">員工管理</h1>

      {isAdmin && (
        <details className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--card)]">
          <summary className="cursor-pointer list-none px-5 py-3.5 flex items-center gap-2 font-medium">
            <span className="text-[var(--gold)]">＋</span> 新增員工
          </summary>
          <form
            action={createStaff}
            className="px-5 pb-5 pt-1 border-t border-[var(--line)] flex flex-wrap gap-3 items-end"
          >
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">姓名</span>
              <input name="name" className={inputCls} />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">電郵</span>
              <input name="email" type="email" required className={inputCls} />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">初始密碼</span>
              <input name="password" type="text" required minLength={6} className={inputCls} placeholder="至少 6 位" />
            </label>
            <label className="text-sm">
              <span className="block text-[var(--soft)] mb-1">角色</span>
              <select name="role" defaultValue="staff" className={inputCls}>
                <option value="staff">員工</option>
                <option value="admin">管理員</option>
              </select>
            </label>
            <button className="px-4 py-2 rounded-lg text-sm bg-[var(--gold)] text-white hover:opacity-90">
              建立
            </button>
          </form>
        </details>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-[var(--head)] text-left text-[var(--soft)]">
              <th className="px-4 py-3 font-medium">姓名</th>
              <th className="px-4 py-3 font-medium">電郵</th>
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-4 py-3 font-medium">狀態</th>
              {isAdmin && <th className="px-4 py-3 font-medium">功能權限</th>}
              {isAdmin && <th className="px-4 py-3 font-medium text-right">更新</th>}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">{s.name || "—"}</td>
                <td className="px-4 py-3 text-[var(--soft)]">{s.email}</td>
                <td className="px-4 py-3">
                  {isAdmin ? null : s.role === "admin" ? "管理員" : "員工"}
                  {isAdmin && (
                    <form action={updateStaff} className="flex items-center gap-2" id={`f-${s.id}`}>
                      <input type="hidden" name="id" value={s.id} />
                      <select name="role" defaultValue={s.role} className="text-xs border border-[var(--line)] rounded-md px-2 py-1 bg-white">
                        <option value="staff">員工</option>
                        <option value="admin">管理員</option>
                      </select>
                    </form>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isAdmin ? (
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" name="active" defaultChecked={s.active} form={`f-${s.id}`} />
                      在職
                    </label>
                  ) : s.active ? (
                    <span className="text-green-700">在職</span>
                  ) : (
                    <span className="text-[var(--faint)]">停用</span>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <PermsButton
                      id={s.id}
                      name={s.name || s.email}
                      role={s.role}
                      permissions={s.permissions || []}
                    />
                  </td>
                )}
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    <ConfirmSubmitButton
                      form={`f-${s.id}`}
                      message="確定更新此員工的角色／狀態？"
                      className="text-xs px-3 py-1 rounded-md bg-[var(--gold)] text-white hover:opacity-90"
                    >
                      存
                    </ConfirmSubmitButton>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isAdmin && (
        <p className="text-xs text-[var(--soft)] mt-3">只有管理員可新增或修改員工。</p>
      )}
    </div>
  );
}
