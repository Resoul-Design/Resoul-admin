import { createAdminClient } from "@/lib/supabase/admin";

// 客戶檔案合併：alias_key（被合併的客戶識別鍵）→ primary_key（保留的客戶）
// 未執行 db/migration_20261007_admin_upgrade.sql 時回傳空對照，客戶檔案照常顯示。
export async function loadAliases(): Promise<Map<string, string>> {
  const { data, error } = await createAdminClient().from("customer_aliases").select("alias_key, primary_key");
  const map = new Map<string, string>();
  if (error) return map;
  for (const row of (data || []) as { alias_key: string; primary_key: string }[]) map.set(row.alias_key, row.primary_key);
  return map;
}

export const resolveCustomerKey = (key: string, aliases: Map<string, string>) => aliases.get(key) || key;

// 已合併入某客戶的其他識別鍵
export const aliasesOf = (key: string, aliases: Map<string, string>) =>
  [...aliases.entries()].filter(([, primary]) => primary === key).map(([alias]) => alias);
