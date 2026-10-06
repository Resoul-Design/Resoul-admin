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
