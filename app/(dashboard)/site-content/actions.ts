"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { normalizeSiteContent, SITE_KEYS, SITE_LABELS, type SiteKey } from "@/lib/site-content";

type Result = { error?: string; savedAt?: string };

const KEEP_VERSIONS = 20;

// 儲存前把現時內容存入版本記錄（每區塊保留最近 20 個）；未建立版本表時略過
async function archiveCurrent(key: string) {
  const admin = createAdminClient();
  const { data: current } = await admin.from("site_content").select("data, updated_at, updated_by").eq("key", key).maybeSingle();
  if (!current) return;
  const { error } = await admin.from("site_content_versions").insert({ key, data: current.data, saved_at: current.updated_at, saved_by: current.updated_by });
  if (error) return;
  const { data: old } = await admin.from("site_content_versions").select("id").eq("key", key).order("saved_at", { ascending: false }).range(KEEP_VERSIONS, KEEP_VERSIONS + 100);
  const ids = (old || []).map((r: { id: number }) => r.id);
  if (ids.length) await admin.from("site_content_versions").delete().in("id", ids);
}

async function writeContent(key: SiteKey, raw: unknown, by: string | null, audit: string): Promise<Result> {
  let data;
  try {
    data = normalizeSiteContent(key, raw);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "內容格式不正確。" };
  }
  await archiveCurrent(key);
  const now = new Date().toISOString();
  const { error } = await createAdminClient().from("site_content").upsert({ key, data, updated_at: now, updated_by: by });
  if (error) {
    return { error: /site_content|relation|schema cache/i.test(error.message) ? "未啟用網站內容：請先於 Supabase 執行 db/migration_site_content.sql。" : `儲存失敗：${error.message}` };
  }
  await logAudit(audit, "site_content", key, SITE_LABELS[key].label);
  revalidatePath("/site-content");
  revalidatePath("/replies");
  return { savedAt: now };
}

// 儲存一個區塊；錯誤以回傳值交還編輯器（正式環境不會顯示拋出的錯誤訊息）
export async function saveSiteContent(key: string, raw: unknown): Promise<Result> {
  const staff = await requireModule("site_content");
  if (!(SITE_KEYS as string[]).includes(key)) return { error: "未知的網站內容區塊。" };
  return writeContent(key as SiteKey, raw, staff.name || staff.email || null, "update_site_content");
}

// 還原為某個舊版本（現時內容會先存入版本記錄，可再還原）
export async function restoreSiteContentVersion(id: number): Promise<Result> {
  const staff = await requireModule("site_content");
  const { data: version, error } = await createAdminClient().from("site_content_versions").select("key, data").eq("id", id).maybeSingle();
  if (error || !version) return { error: "找不到此版本。" };
  if (!(SITE_KEYS as string[]).includes(version.key)) return { error: "未知的網站內容區塊。" };
  return writeContent(version.key as SiteKey, version.data, staff.name || staff.email || null, "restore_site_content");
}
