"use server";

import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

// 測試記錄：標記／取消標記，以及刪除全部測試記錄（只限接送及預約；紀念品訂單會由 Shopify 同步回來，只可隱藏）
export type TestEntity = "deposit" | "cremation" | "vet" | "order";

const CONF: Record<TestEntity, { table: string; idCol: string; module: string; path: string; label: string }> = {
  deposit: { table: "deposit_bookings", idCol: "id", module: "deposits", path: "/deposits", label: "接送服務" },
  cremation: { table: "cremation_bookings", idCol: "id", module: "bookings", path: "/bookings", label: "火化預約" },
  vet: { table: "cremation_bookings", idCol: "id", module: "vet_assessments", path: "/vet-assessments", label: "獸醫評估" },
  order: { table: "product_orders", idCol: "shopify_order_id", module: "orders", path: "/orders", label: "紀念品訂單" },
};

type Result = { error?: string; count?: number };

export async function setTestFlag(entity: TestEntity, id: string, isTest: boolean): Promise<Result> {
  const conf = CONF[entity];
  if (!conf || !id) return { error: "資料無效。" };
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  if (!hasModule(staff, [conf.module])) return { error: "沒有此功能的使用權限。" };
  const { error } = await createAdminClient().from(conf.table).update({ is_test: isTest }).eq(conf.idCol, id);
  if (error) return { error: /is_test/.test(error.message) ? "未啟用測試記錄：請先於 Supabase 執行 db/migration_20261007_admin_upgrade.sql。" : `更新失敗：${error.message}` };
  await logAudit(isTest ? "mark_test" : "unmark_test", conf.table, id, `${conf.label}${isTest ? "標記為測試" : "取消測試標記"}`);
  revalidatePath(conf.path);
  revalidatePath("/");
  return {};
}

// 只限管理員：永久刪除該類別全部已標記的測試記錄
export async function deleteTestRecords(entity: TestEntity): Promise<Result> {
  const conf = CONF[entity];
  if (!conf || entity === "order") return { error: "紀念品訂單不可在此刪除（會由 Shopify 同步回來），請保持隱藏。" };
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  if (staff.role !== "admin") return { error: "只有管理員可以刪除測試記錄。" };
  const admin = createAdminClient();
  let query = admin.from(conf.table).delete({ count: "exact" }).eq("is_test", true);
  if (entity === "vet") query = query.ilike("source", "%euthanasia%");
  // 火化：來源不是獸醫評估（包括未有來源的舊記錄）
  if (entity === "cremation") query = query.or("source.is.null,source.not.ilike.*euthanasia*");
  const { error, count } = await query;
  if (error) return { error: `刪除失敗：${error.message}` };
  await logAudit("delete_test_records", conf.table, null, `刪除${conf.label}測試記錄 ${count ?? 0} 筆`);
  revalidatePath(conf.path);
  revalidatePath("/");
  return { count: count ?? 0 };
}
