import { createAdminClient } from "@/lib/supabase/admin";
import { moduleGuardResponse } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";
import { canonicalProjectNo, projectNoFromNotes } from "@/lib/order-label";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await moduleGuardResponse("deposits", "reports");
  if (denied) return denied;
  const { data } = await createAdminClient()
    .from("deposit_bookings")
    .select("created_at, owner_name, contact, pet_name, pet_type, service_date, service_time, pickup_address, status, payment_ref, payment_status, payment_amount, payment_currency, shopify_order_name, notes")
    .order("created_at", { ascending: false });
  const headers = ["分類", "專案編號", "收到", "主人", "聯絡", "毛孩", "種類", "希望日期", "希望時段", "接送地址", "狀態", "付款狀態", "付款金額", "付款貨幣", "付款參考", "備註"];
  const rows = (data ?? []).map((b) => [
    "接送服務", canonicalProjectNo(b.shopify_order_name, projectNoFromNotes(b.notes)), b.created_at?.slice(0, 19).replace("T", " "), b.owner_name, b.contact,
    b.pet_name, b.pet_type, b.service_date, b.service_time, b.pickup_address, b.status, b.payment_status, b.payment_amount, b.payment_currency, b.payment_ref, b.notes,
  ]);
  return csvResponse("pickup-services.csv", toCsv(headers, rows));
}
