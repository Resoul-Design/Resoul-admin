"use server";

import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { customerKey } from "@/lib/product-orders";

type Result = { error?: string };

const NOT_READY = "未啟用客戶合併：請先於 Supabase 執行 db/migration_20261007_admin_upgrade.sql。";

async function guard() {
  const staff = await getStaff();
  if (!staff) return { staff: null, error: "登入狀態已失效，請重新登入。" };
  if (!hasModule(staff, ["crm"])) return { staff: null, error: "沒有此功能的使用權限。" };
  return { staff, error: "" };
}

// 把另一位客戶（輸入電話或名稱）合併入目前客戶檔案
export async function mergeCustomer(primaryKey: string, other: string): Promise<Result> {
  const { staff, error } = await guard();
  if (!staff) return { error };
  const input = other.trim();
  if (!input) return { error: "請輸入要合併的客戶電話或名稱。" };
  const otherKey = customerKey(input, input);
  if (!primaryKey || otherKey === primaryKey) return { error: "不可以合併同一位客戶。" };
  const admin = createAdminClient();
  // 被合併客戶本身已有合併入的檔案：一併轉到目前客戶
  const moved = await admin.from("customer_aliases").update({ primary_key: primaryKey }).eq("primary_key", otherKey);
  if (moved.error) return { error: /customer_aliases/.test(moved.error.message) ? NOT_READY : `合併失敗：${moved.error.message}` };
  const { error: upsertError } = await admin
    .from("customer_aliases")
    .upsert({ alias_key: otherKey, primary_key: primaryKey, created_by: staff.name || staff.email });
  if (upsertError) return { error: `合併失敗：${upsertError.message}` };
  // 目前客戶不可同時是別人的別名
  await admin.from("customer_aliases").delete().eq("alias_key", primaryKey);
  await logAudit("merge_customer", "customer_aliases", otherKey, `合併入 ${primaryKey}`);
  revalidatePath("/crm");
  revalidatePath(`/crm/${encodeURIComponent(primaryKey)}`);
  return {};
}

export async function unmergeCustomer(primaryKey: string, aliasKey: string): Promise<Result> {
  const { staff, error } = await guard();
  if (!staff) return { error };
  const { error: delError } = await createAdminClient().from("customer_aliases").delete().eq("alias_key", aliasKey).eq("primary_key", primaryKey);
  if (delError) return { error: `取消合併失敗：${delError.message}` };
  await logAudit("unmerge_customer", "customer_aliases", aliasKey, `由 ${primaryKey} 分拆`);
  revalidatePath("/crm");
  revalidatePath(`/crm/${encodeURIComponent(primaryKey)}`);
  return {};
}
