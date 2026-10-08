"use server";

import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { phoneKey } from "@/lib/product-orders";

// 記錄已邀請評價（或略過）；同一電話之後不會再列出
export async function markReviewInvite(entity: "cremation" | "deposit", ref: string, phone: string, skipped: boolean): Promise<{ error?: string }> {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  if (!hasModule(staff, [entity === "cremation" ? "bookings" : "deposits"])) return { error: "沒有此功能的使用權限。" };
  if (!ref || (entity !== "cremation" && entity !== "deposit")) return { error: "資料無效。" };
  const { error } = await createAdminClient()
    .from("review_invites")
    .upsert({ entity, ref, phone_key: phoneKey(phone) || null, skipped, invited_by: staff.name || staff.email, invited_at: new Date().toISOString() });
  if (error) return { error: /review_invites/.test(error.message) ? "未啟用邀請評價：請先於 Supabase 執行 db/migration_review_invites.sql。" : `更新失敗：${error.message}` };
  await logAudit(skipped ? "skip_review_invite" : "review_invite", entity === "cremation" ? "cremation_bookings" : "deposit_bookings", ref, skipped ? "略過邀請評價" : "已邀請評價");
  revalidatePath("/");
  return {};
}
