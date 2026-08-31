import { createClient } from "@/lib/supabase/server";
import { getStaff } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getStaff())) return new Response("Unauthorized", { status: 401 });
  const supabase = await createClient();
  const { data } = await supabase
    .from("cremation_bookings")
    .select(
      "case_no, created_at, owner_name, contact, pet_name, pet_type, plan, service_date, service_time, pickup_address, status, amount, cost, notes"
    )
    .order("created_at", { ascending: false });

  const headers = [
    "專案編號", "收到", "主人", "聯絡", "毛孩", "種類", "方案",
    "服務日期", "服務時間", "接送地址", "狀態", "收入", "成本", "備註",
  ];
  const rows = (data ?? []).map((b) => [
    b.case_no, b.created_at?.slice(0, 10), b.owner_name, b.contact, b.pet_name,
    b.pet_type, b.plan, b.service_date, b.service_time, b.pickup_address,
    b.status, b.amount, b.cost, b.notes,
  ]);
  return csvResponse("bookings.csv", toCsv(headers, rows));
}
