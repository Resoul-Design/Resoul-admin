import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateCustomerData } from "../../actions";

const fields = [
  ["owner_name", "主人姓名"], ["phone", "電話"], ["email", "電郵"], ["pet_name", "寵物名稱"],
  ["arrival_date", "到達日期"], ["arrival_time", "到達時間"], ["plan", "套餐"], ["driver", "司機"],
  ["pickup_type", "接送方式"], ["pickup_from", "接送地點"], ["pickup_fee", "接送費"], ["pickup_surcharge", "接送附加費"],
  ["delivery_cost_to_customer", "客戶送貨費"], ["driver_or_gogovan_cost", "司機／GoGoVan 成本"], ["commission", "佣金"],
  ["memorial_cost", "紀念品成本"], ["endup_profit", "最終利潤"], ["memorial_supplier", "紀念品供應商"],
  ["product_pickup_or_delivery_on", "紀念品取貨／送貨日期"], ["memorial_remarks", "紀念品備註"],
] as const;

export default async function EditCustomerPage({ params }: { params: Promise<{ invoice: string }> }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!hasModule(staff, ["inventory"])) redirect("/logistics");
  const invoice = decodeURIComponent((await params).invoice);
  const { data } = await createAdminClient().from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle();
  if (!data) redirect(`/logistics/${encodeURIComponent(invoice)}`);
  return <div><Link href={`/logistics/${encodeURIComponent(invoice)}`} className="text-sm text-[var(--gold)] hover:underline">← 返回客戶資料</Link><h1 className="mt-4 text-2xl font-semibold">編輯完整客戶資料 · {invoice}</h1><form action={updateCustomerData.bind(null, invoice)} className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--head)] p-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([key, label]) => <label key={key} className="text-sm">{label}<input name={key} defaultValue={String((data as Record<string, unknown>)[key] ?? "")} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label>)}</div><div className="mt-5 flex gap-3"><button className="rounded-lg bg-[var(--gold)] px-5 py-2 text-sm text-white">儲存全部修改</button><Link href={`/logistics/${encodeURIComponent(invoice)}`} className="rounded-lg border border-[var(--line)] px-5 py-2 text-sm">取消</Link></div></form></div>;
}

