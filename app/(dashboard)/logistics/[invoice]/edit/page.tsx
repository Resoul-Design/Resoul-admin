import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveLogisticsCosts, expandedLogisticsRow } from "@/lib/logistics-auto-costs";
import { updateCustomerData } from "../../actions";

const fields = [
  ["owner_name", "主人姓名"], ["phone", "電話"], ["email", "電郵"], ["pet_name", "寵物名稱"],
  ["arrival_date", "到達日期"], ["arrival_time", "到達時間"], ["plan", "套餐"], ["driver", "司機"],
  ["pickup_type", "接送方式"], ["pickup_from", "接送地點"], ["pickup_surcharge", "接送附加費"],
  ["delivery_cost_to_customer", "客戶送貨費"], ["driver_or_gogovan_cost", "司機／GoGoVan 成本（自動）", true], ["commission", "佣金"],
  ["invoice_amount", "發票金額"], ["deposit_received", "已收訂金"], ["balance_settled", "餘額結清"], ["package_price", "套餐價格"],
  ["urn", "骨灰龕"], ["memorial_cost", "骨灰龕成本（自動）", true], ["memorial_addon_price", "紀念品及產品總金額（自動）", true],
  ["endup_profit", "最終利潤"], ["memorial_supplier", "紀念品供應商"],
  ["product_pickup_or_delivery_on", "紀念品取貨／送貨日期"], ["memorial_remarks", "紀念品備註"],
] as const;

export default async function EditCustomerPage({ params }: { params: Promise<{ invoice: string }> }) {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (!hasModule(staff, ["inventory"])) redirect("/logistics");
  const invoice = decodeURIComponent((await params).invoice);
  const admin = createAdminClient();
  const invoiceValue = Number(invoice) || invoice;
  const [{ data }, { data: logisticsRows }, { data: productOrders }, { data: companyOrders }] = await Promise.all([
    admin.from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle(),
    admin.from("logistics_orders").select("*").order("updated_at", { ascending: false }).limit(1000),
    admin.from("product_orders").select("*").eq("invoice_no", invoiceValue),
    admin.from("company_orders").select("*").eq("invoice_no", invoiceValue),
  ]);
  if (!data) redirect(`/logistics/${encodeURIComponent(invoice)}`);
  const row = expandedLogisticsRow(data as Record<string, unknown>);
  const automatic = deriveLogisticsCosts(row, (logisticsRows || []) as Record<string, unknown>[], (productOrders || []) as Record<string, unknown>[], (companyOrders || []) as Record<string, unknown>[]);
  const values: Record<string, unknown> = { ...row, ...automatic };
  return <div><Link href={`/logistics/${encodeURIComponent(invoice)}`} className="text-sm text-[var(--gold)] hover:underline">← 返回客戶資料</Link><h1 className="mt-4 text-2xl font-semibold">編輯完整客戶資料 · {invoice}</h1><form action={updateCustomerData.bind(null, invoice)} className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--head)] p-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([key, label, automaticField]) => <label key={key} className="text-sm">{label}<input name={key} defaultValue={String(values[key] ?? "")} readOnly={Boolean(automaticField)} className={`mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 ${automaticField ? "bg-[var(--cream)] text-[var(--soft)]" : "bg-white"}`} />{automaticField && <span className="mt-1 block text-xs text-[var(--soft)]">根據 Customers Record &amp; Logistic record 自動帶入</span>}</label>)}</div><div className="mt-5 flex gap-3"><button className="rounded-lg bg-[var(--gold)] px-5 py-2 text-sm text-white">儲存全部修改</button><Link href={`/logistics/${encodeURIComponent(invoice)}`} className="rounded-lg border border-[var(--line)] px-5 py-2 text-sm">取消</Link></div></form></div>;
}