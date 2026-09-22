import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";
import { canonicalProjectNo } from "@/lib/order-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("cremation_bookings")
    .select(
      "case_no, created_at, owner_name, contact, pet_name, pet_type, plan, service_date, service_time, pickup_address, status, source, amount, cost, payment_status, payment_amount, payment_currency, shopify_order_name, shopify_order_id, paid_at, payment_ref, notes"
    )
    .order("created_at", { ascending: false });

  const headers = [
    "專案編號", "內部編號 case_no", "收到", "主人", "聯絡", "毛孩", "種類", "方案",
    "服務日期", "服務時間", "接送地址", "狀態", "來源", "收入", "成本",
    "付款狀態", "付款金額", "付款貨幣", "Shopify訂單", "Shopify訂單ID",
    "付款時間", "Payment Ref", "備註",
  ];
  const rows = (data ?? []).map((b) => [
    canonicalProjectNo(b.shopify_order_name, b.case_no), b.case_no, b.created_at?.slice(0, 10), b.owner_name, b.contact, b.pet_name,
    b.pet_type, b.plan, b.service_date, b.service_time, b.pickup_address,
    b.status, b.source, b.amount, b.cost, b.payment_status, b.payment_amount,
    b.payment_currency, b.shopify_order_name, b.shopify_order_id,
    b.paid_at?.slice(0, 19).replace("T", " "), b.payment_ref, b.notes,
  ]);
  return csvResponse("bookings.csv", toCsv(headers, rows));
}
