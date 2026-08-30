import { createClient } from "@/lib/supabase/server";

export type Staff = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "staff";
  active: boolean;
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
    .select("id, email, name, role, active")
    .eq("id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!data) return null;
  return { ...(data as Staff), authEmail: user.email ?? undefined };
}
