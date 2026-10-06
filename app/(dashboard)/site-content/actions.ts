"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { normalizeSiteContent, SITE_KEYS, SITE_LABELS, type SiteKey } from "@/lib/site-content";

type Result = { error?: string; savedAt?: string };

// 儲存一個區塊；錯誤以回傳值交還編輯器（正式環境不會顯示拋出的錯誤訊息）
export async function saveSiteContent(key: string, raw: unknown): Promise<Result> {
  const staff = await requireModule("site_content");
  if (!(SITE_KEYS as string[]).includes(key)) return { error: "未知的網站內容區塊。" };
  let data;
  try {
    data = normalizeSiteContent(key as SiteKey, raw);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "內容格式不正確。" };
  }
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("site_content")
    .upsert({ key, data, updated_at: now, updated_by: staff.name || staff.email || null });
  if (error) {
    return { error: /site_content|relation|schema cache/i.test(error.message) ? "未啟用網站內容：請先於 Supabase 執行 db/migration_site_content.sql。" : `儲存失敗：${error.message}` };
  }
  await logAudit("update_site_content", "site_content", key, SITE_LABELS[key as SiteKey].label);
  revalidatePath("/site-content");
  revalidatePath("/replies");
  return { savedAt: now };
}

