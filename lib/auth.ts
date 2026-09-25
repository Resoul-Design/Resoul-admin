import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccess } from "@/lib/modules";

export type Staff = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "staff";
  active: boolean;
  permissions: string[] | null;
  authEmail?: string;
};

// 取得目前登入的員工資料；若未登入或非在職員工，回傳 null。
export async function getStaff(): Promise<Staff | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("staff")
    .select("id, email, name, role, active, permissions")
    .eq("id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!data) return null;
  return { ...(data as Staff), authEmail: user.email ?? undefined };
}

// 是否可使用任一指定模組（管理員全部可用）
export function hasModule(staff: Staff, keys: string[]): boolean {
  return keys.some((key) => canAccess(staff.role, staff.permissions, key));
}

// Server Actions 專用：未登入轉去登入頁；已登入但無任一指定模組權限則拋錯。
// middleware 只在瀏覽頁面時檢查模組權限，而 Server Action 可從任何路徑觸發，故每個 action 須自行檢查。
export async function requireModule(...keys: string[]): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!hasModule(staff, keys)) throw new Error("沒有此功能的使用權限。");
  return staff;
}

// Route Handler 專用：未登入回 401、無權限回 403；通過則回傳 null。
export async function moduleGuardResponse(...keys: string[]): Promise<Response | null> {
  const staff = await getStaff();
  if (!staff) return new Response("Unauthorized", { status: 401 });
  if (!hasModule(staff, keys)) return new Response("Forbidden", { status: 403 });
  return null;
}
