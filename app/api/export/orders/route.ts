import { createClient } from "@/lib/supabase/server";
import { moduleGuardResponse } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";
import { canonicalProjectNo, projectNoFromItems } from "@/lib/order-label";
import type { ProductOrderRow } from "@/lib/product-orders";
import { loadSouvenirDrafts } from "@/lib/souvenir-drafts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await moduleGuardResponse("orders", "reports");
  if (denied) return denied;
  const { data } = await (await createClient()).from("product_orders").select("*").order("shopify_created_at", { ascending: false });
  const headers = ["分類", "專案編號", "Shopify訂單", "日期", "客戶", "電話", "內容", "付款狀態", "出貨狀態", "金額", "貨幣", "取消時間"];
  const rows = ((data ?? []) as ProductOrderRow[]).map((o) => [
    "紀念品訂單", canonicalProjectNo(o.order_name, projectNoFromItems(o.line_items)), o.order_name, o.shopify_created_at?.slice(0, 19).replace("T", " "),
    o.customer_name, o.phone, (o.line_items || []).map((i) => `${i.title}×${i.quantity}`).join("、"), o.financial_status, o.fulfillment_status,
    o.total_amount, o.currency, o.cancelled_at?.slice(0, 19).replace("T", " "),
  ]);
  // 未付款的紀念品草稿（Shopify 草稿訂單）
  const drafts = (await loadSouvenirDrafts()).map((d) => [
    "紀念品訂單（草稿）", d.projectNo, d.name, d.createdAt.slice(0, 19).replace("T", " "),
    d.owner, d.phone, d.itemsText, "待付款（草稿）", "草稿", d.amount, d.currency, "",
  ]);
  return csvResponse("memorial-orders.csv", toCsv(headers, [...drafts, ...rows]));
}
