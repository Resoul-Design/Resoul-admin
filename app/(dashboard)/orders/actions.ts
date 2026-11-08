"use server";

import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { shopifyGraphQL } from "@/lib/shopify";
import { isProjectNo } from "@/lib/order-label";

// 紀念品訂單連結客人原有的專案編號（須已存在於接送、火化或其他紀念品記錄）
const ORDER_PROJECT_QUERY = `query OrderProject($id: ID!) { order(id: $id) { note customAttributes { key value } } }`;
const ORDER_PROJECT_UPDATE = `mutation OrderProjectUpdate($input: OrderInput!) { orderUpdate(input: $input) { order { id } userErrors { message } } }`;
const LINK_NOTE = "🔗 後台連結專案";

// 同步至 Shopify 訂單：自訂欄位「Project No」改為新編號（原有不同編號保留為「Original Project No」），備註加一行記錄。
// 產品備註（line item properties）於已付款訂單不能修改，故保留原狀。
async function syncOrderProjectToShopify(orderId: string, projectNo: string): Promise<boolean> {
  try {
    const cur = await shopifyGraphQL<{ order: { note: string | null; customAttributes: { key: string; value: string }[] } | null }>(ORDER_PROJECT_QUERY, { id: orderId });
    if (!cur.order) return false;
    const attrs = cur.order.customAttributes.map(({ key, value }) => ({ key, value }));
    const old = attrs.find((x) => x.key === "Project No")?.value || "";
    const kept = attrs.filter((x) => x.key !== "Project No");
    // 只記錄第一次改動前的原有編號
    const original = !attrs.some((x) => x.key === "Original Project No") && old && old !== projectNo ? [{ key: "Original Project No", value: old }] : [];
    const date = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const lines = String(cur.order.note || "").split("\n").filter((l) => l && !l.startsWith(LINK_NOTE));
    const res = await shopifyGraphQL<{ orderUpdate: { userErrors: { message: string }[] } }>(ORDER_PROJECT_UPDATE, {
      input: {
        id: orderId,
        note: [...lines, `${LINK_NOTE}：${projectNo}（${date}）`].join("\n"),
        customAttributes: [...kept, ...original, { key: "Project No", value: projectNo }],
      },
    });
    return !res.orderUpdate.userErrors.length;
  } catch (e) {
    console.error("[link_order_project_shopify]", e instanceof Error ? e.message : "unknown");
    return false;
  }
}

export async function linkOrderProject(orderId: string, rawProjectNo: string): Promise<{ error?: string; warning?: string }> {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  if (!hasModule(staff, ["orders"])) return { error: "沒有「紀念品訂單」權限。" };
  const projectNo = rawProjectNo.trim().toUpperCase();
  if (!isProjectNo(projectNo)) return { error: "專案編號只可包含文字、數字、空格、連字號或底線（2–40 個字元）。" };
  const admin = createAdminClient();
  const [d, b, o] = await Promise.all([
    admin.from("deposit_bookings").select("id", { count: "exact", head: true }).eq("project_no", projectNo),
    admin.from("cremation_bookings").select("id", { count: "exact", head: true }).or(`case_no.eq.${projectNo},notes.ilike.*${projectNo}*`),
    admin.from("product_orders").select("shopify_order_id", { count: "exact", head: true }).eq("project_no", projectNo),
  ]);
  if (!(d.count || b.count || o.count)) return { error: "找不到此專案編號，請檢查是否輸入正確。" };
  const { error } = await admin.from("product_orders").update({ project_no: projectNo }).eq("shopify_order_id", orderId);
  if (error) return { error: `更新失敗：${error.message}` };
  const synced = /^gid:\/\/shopify\/Order\/\d+$/.test(orderId) && (await syncOrderProjectToShopify(orderId, projectNo));
  await logAudit("link_order_project", "product_orders", orderId, `連結專案 ${projectNo}${synced ? "（已同步 Shopify）" : "（未能同步 Shopify）"}`);
  revalidatePath("/orders");
  revalidatePath("/projects");
  return synced ? {} : { warning: "已連結專案，但未能更新 Shopify 訂單的專案編號，請稍後再試或在 Shopify 手動修改。" };
}
