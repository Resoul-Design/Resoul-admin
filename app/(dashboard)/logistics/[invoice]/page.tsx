import { getStaff, hasModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { LogisticsForm } from "../_logistics-form";
import { LOGISTICS_FIELDS } from "@/lib/logistics-fields";

export const dynamic = "force-dynamic";
export default async function LogisticsDetail({ params }: { params: Promise<{ invoice: string }> }) {
  const staff = await getStaff(); if (!staff) redirect("/login"); if (!hasModule(staff, ["inventory"])) notFound();
  const invoice = decodeURIComponent((await params).invoice);
  const admin = createAdminClient();
  const [logistics, company, deposits, cremations, products] = await Promise.all([
    admin.from("logistics_orders").select("*").eq("invoice_no", invoice).maybeSingle(),
    // 同一單號可有多筆記錄（同一專案共用單號）
    admin.from("company_orders").select("*").eq("invoice_no", Number(invoice) || invoice).order("created_at").limit(20),
    admin.from("deposit_bookings").select("*").eq("invoice_no", Number(invoice) || invoice).order("created_at").limit(20),
    admin.from("cremation_bookings").select("*").eq("invoice_no", Number(invoice) || invoice).order("created_at").limit(20),
    admin.from("product_orders").select("*").eq("invoice_no", Number(invoice) || invoice).order("shopify_created_at").limit(20),
  ]);
  const co = company.data?.[0], dep = deposits.data?.[0], cre = cremations.data?.[0], pro = products.data?.[0];
  const data = logistics.data || (co ? { ...co, owner_name: co.customer_name, phone: co.phone, email: co.email } : null) || (dep ? { ...dep, phone: dep.contact } : null) || (cre ? { ...cre, phone: cre.contact } : null) || (pro ? { ...pro, owner_name: pro.customer_name } : null);
  if (!data) notFound();
  // 客戶資料表格預設值：有 Excel 記錄用記錄，否則由服務記錄帶入（保存後建立）
  const lg = logistics.data as Record<string, unknown> | null;
  const svc = (dep || cre || null) as Record<string, unknown> | null;
  const fallback: Record<string, unknown> = {
    owner_name: svc?.owner_name ?? co?.customer_name ?? pro?.customer_name, phone: svc?.contact ?? co?.phone ?? pro?.phone,
    email: co?.email ?? pro?.email, pet_name: svc?.pet_name ?? co?.pet_name, animal: svc?.pet_type,
    arrival_date: svc?.service_date, arrival_time: svc?.service_time, pickup_from: svc?.pickup_address, package_name: svc?.plan,
    invoice_amount: svc?.payment_amount ?? co?.amount ?? pro?.total_amount,
  };
  const formInitial: Record<string, string> = Object.fromEntries(LOGISTICS_FIELDS.map((f) => {
    const v = lg ? lg[f.key] : fallback[f.key];
    return [f.key, v == null ? "" : String(v).slice(0, f.type === "date" ? 10 : 2000)];
  }));
  return <div><div className="mb-5 flex items-center gap-3"><Link href="/logistics" className="text-sm text-[var(--gold)] hover:underline">← 客戶資料</Link><h1 className="text-2xl font-semibold">{invoice}</h1></div><LogisticsForm invoice={invoice} initial={formInitial} exists={!!logistics.data} isAdmin={staff.role === "admin"} /></div>;
}