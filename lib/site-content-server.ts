// 伺服器讀取「網站內容」；未儲存的區塊使用網站現有內容（預設值）。
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_DEFAULTS, SITE_KEYS, type SiteContent, type SiteKey } from "@/lib/site-content";

export type LoadedSiteContent = {
  content: SiteContent;
  saved: Partial<Record<SiteKey, { updated_at: string; updated_by: string | null }>>;
  notReady: boolean; // 未執行 db/migration_site_content.sql
};

export async function loadSiteContent(): Promise<LoadedSiteContent> {
  const content = structuredClone(SITE_DEFAULTS);
  const saved: LoadedSiteContent["saved"] = {};
  const { data, error } = await createAdminClient().from("site_content").select("key, data, updated_at, updated_by");
  if (error) return { content, saved, notReady: true };
  for (const row of (data || []) as { key: string; data: unknown; updated_at: string; updated_by: string | null }[]) {
    if (!(SITE_KEYS as string[]).includes(row.key) || !row.data || typeof row.data !== "object") continue;
    const key = row.key as SiteKey;
    (content as Record<SiteKey, unknown>)[key] = row.data;
    saved[key] = { updated_at: row.updated_at, updated_by: row.updated_by };
  }
  return { content, saved, notReady: false };
}

// 各區塊的版本記錄（新至舊）；未建立版本表時回傳空
export async function loadVersions(): Promise<Partial<Record<SiteKey, { id: number; saved_at: string; saved_by: string | null }[]>>> {
  const { data, error } = await createAdminClient()
    .from("site_content_versions")
    .select("id, key, saved_at, saved_by")
    .order("saved_at", { ascending: false })
    .limit(300);
  const out: Partial<Record<SiteKey, { id: number; saved_at: string; saved_by: string | null }[]>> = {};
  if (error) return out;
  for (const v of (data || []) as { id: number; key: string; saved_at: string; saved_by: string | null }[]) {
    if (!(SITE_KEYS as string[]).includes(v.key)) continue;
    (out[v.key as SiteKey] ||= []).push({ id: v.id, saved_at: v.saved_at, saved_by: v.saved_by });
  }
  return out;
}
