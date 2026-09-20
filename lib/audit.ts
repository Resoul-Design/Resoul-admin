import { createAdminClient } from "@/lib/supabase/admin";
import { getStaff } from "@/lib/auth";

// 記錄後台重要操作。Best-effort：即使記錄失敗也不影響主要動作。
export async function logAudit(
  action: string,
  entity: string,
  entityId?: string | null,
  detail?: string | null
) {
  try {
    const me = await getStaff();
    await createAdminClient().from("audit_log").insert({
      actor_id: me?.id ?? null,
      actor_email: me?.email ?? me?.authEmail ?? null,
      action,
      entity,
      entity_id: entityId ?? null,
      detail: detail ?? null,
    });
  } catch {
    // 忽略：審計記錄不應阻斷主要操作（例如 migration 未執行時）
  }
}
